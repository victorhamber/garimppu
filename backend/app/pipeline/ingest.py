import logging
from collections.abc import Callable
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.collectors.base import RawAd
from app.config import get_settings
from app.models import Ad, Creative, Page, Source, SourceAd
from app.pipeline import media
from app.pipeline.dedupe import CreativeMatcher, perceptual_hash, text_hash
from app.pipeline.brands import refresh_big_brands
from app.pipeline.niche import NicheSignals, classify_signals
from app.pipeline.normalize import text_signature
from app.pipeline.offers import set_offer
from app.pipeline.scoring import recompute_scores, refresh_page_counts

logger = logging.getLogger(__name__)
COMMIT_EVERY = 25


class Ingestor:
    def __init__(self, db: Session, source: Source, log: Callable[[str], None]):
        self.db = db
        self.source = source
        self.log = log
        self.settings = get_settings()
        self.matcher = CreativeMatcher(db)
        self.by_url: dict[str, int] = {}
        self.client = httpx.Client(timeout=30)
        self.now = datetime.now(timezone.utc)

    def close(self) -> None:
        self.client.close()

    def upsert_page(self, raw: RawAd) -> None:
        if not raw.page_id:
            return
        page = self.db.get(Page, raw.page_id)
        if page is None:
            page = Page(page_id=raw.page_id)
            self.db.add(page)
        page.name = raw.page_name or page.name
        page.profile_picture_url = raw.page_profile_picture_url or page.profile_picture_url
        page.page_like_count = raw.page_like_count or page.page_like_count
        page.categories = raw.page_categories or page.categories or []

    def upsert_ad(self, raw: RawAd) -> Ad:
        ad = self.db.get(Ad, raw.ad_archive_id)
        if ad is None:
            ad = Ad(ad_archive_id=raw.ad_archive_id, source=raw.source, first_seen_at=self.now)
            self.db.add(ad)
        elif ad.source != raw.source:
            ad.source = "both"
        for field in ("page_id", "body", "title", "caption", "cta_text", "link_url", "display_format",
                      "start_date", "collation_id", "collation_count", "snapshot_url"):
            value = getattr(raw, field)
            if value is not None:
                setattr(ad, field, value)
        ad.end_date = raw.end_date
        ad.is_active = raw.is_active
        set_offer(ad)
        ad.platforms = raw.platforms or ad.platforms or []
        ad.last_seen_at = self.now
        self.db.flush()
        if self.db.get(SourceAd, (self.source.id, raw.ad_archive_id)) is None:
            self.db.add(SourceAd(source_id=self.source.id, ad_archive_id=raw.ad_archive_id))
        return ad

    def _visual_creative(self, raw: RawAd) -> Creative | None:
        if raw.video_urls or raw.video_preview_urls:
            kind, media_type = "v", "video"
            thumb = (raw.video_preview_urls or raw.image_urls or [None])[0]
            media_url = (raw.video_urls or [thumb])[0]
        elif raw.image_urls:
            kind, media_type = "i", "image"
            thumb = media_url = raw.image_urls[0]
        else:
            return None
        if not thumb:
            return None

        cache_key = media.url_key(thumb)
        if cache_key in self.by_url:
            creative = self.db.get(Creative, self.by_url[cache_key])
            if creative:
                creative.thumbnail_url, creative.media_url = thumb, media_url
            return creative

        downloaded = media.download_image(self.client, thumb)
        if downloaded is None:
            return None
        rel_path, content = downloaded
        phash = perceptual_hash(content)
        if phash is None:
            return None
        key = f"{kind}:{phash}"

        existing_id = self.matcher.find(key)
        if existing_id is not None:
            creative = self.db.get(Creative, existing_id)
            creative.thumbnail_url, creative.media_url = thumb, media_url
            creative.local_path = creative.local_path or rel_path
        else:
            creative = Creative(hash=key, media_type=media_type, media_url=media_url,
                                thumbnail_url=thumb, local_path=rel_path, first_seen_at=self.now)
            self.db.add(creative)
            self.db.flush()
            self.matcher.add(key, creative.id)

        if media_type == "video" and self.settings.download_videos and not creative.local_video_path:
            if raw.video_urls:
                creative.local_video_path = media.download_video(self.client, raw.video_urls[0])
        self.by_url[cache_key] = creative.id
        return creative

    def _text_creative(self, raw: RawAd) -> Creative:
        signature = text_signature(raw.body, raw.title)
        key = f"t:{text_hash(signature)}" if signature else f"t:ad-{raw.ad_archive_id}"
        existing_id = self.matcher.find(key)
        if existing_id is not None:
            return self.db.get(Creative, existing_id)
        creative = Creative(hash=key, media_type="text", first_seen_at=self.now)
        self.db.add(creative)
        self.db.flush()
        self.matcher.add(key, creative.id)
        return creative

    def resolve_creative(self, raw: RawAd, ad: Ad) -> Creative:
        creative = self._visual_creative(raw)
        if creative is None:
            # Don't downgrade an ad already linked to a visual creative to a text-only one.
            if ad.creatives:
                return ad.creatives[0]
            creative = self._text_creative(raw)
        if ad.creatives != [creative]:
            ad.creatives = [creative]
        creative.last_seen_at = self.now
        if creative.niche is None:
            creative.niche = classify_signals(NicheSignals(
                texts=[raw.body, raw.title, raw.caption],
                page_name=raw.page_name,
                offer_keys=[ad.offer_key],
                categories=raw.page_categories,
            ))
        return creative

    def run(self, raw_ads: list[RawAd]) -> tuple[int, set[int]]:
        creative_ids: set[int] = set()
        page_ids: set[str] = set()
        for i, raw in enumerate(raw_ads, 1):
            self.upsert_page(raw)
            ad = self.upsert_ad(raw)
            creative_ids.add(self.resolve_creative(raw, ad).id)
            if raw.page_id:
                page_ids.add(raw.page_id)
            if i % COMMIT_EVERY == 0:
                self.db.commit()
                self.log(f"Processados {i}/{len(raw_ads)} anúncios")
        self.db.flush()
        refresh_page_counts(self.db, page_ids)
        refresh_big_brands(self.db, page_ids)
        self.db.flush()
        recompute_scores(self.db, creative_ids)
        self.db.commit()
        return len(raw_ads), creative_ids


def ingest_ads(db: Session, source: Source, raw_ads: list[RawAd],
               log: Callable[[str], None] = logger.info) -> tuple[int, set[int]]:
    ingestor = Ingestor(db, source, log)
    try:
        return ingestor.run(raw_ads)
    finally:
        ingestor.close()

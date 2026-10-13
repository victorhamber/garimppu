"""Stores TikTok top ads for a source: TikTok's metrics, a local cover, the offer behind the landing page, a score.

score = 3*(1 - CTR percentile)              top 1% of the industry -> ~3, median -> 1.5
      + 0.5*log10(1 + likes)                 100k likes -> 2.5
      + 0.5*log10(1 + comments + 2*shares)   people talking about it and passing it on
      + 0.25*budget tier                     TikTok's low/medium/high spend band
"""

import math
from collections.abc import Callable

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.collectors.tiktok_ads import RawTikTokAd
from app.models import Source, SourceTikTokAd, TikTokAd, utcnow
from app.pipeline.media import download_image
from app.pipeline.offers import classify_destination

INDUSTRY_BLOCK = 1_000_000_000


def industry_parent(industry_id: int | None) -> int | None:
    return industry_id // INDUSTRY_BLOCK * INDUSTRY_BLOCK if industry_id else None


def score_tiktok_ad(ad: TikTokAd) -> None:
    score = 0.5 * math.log10(1 + (ad.likes or 0))
    if ad.ctr_rank is not None:
        score += 3 * (1 - min(max(ad.ctr_rank, 0.0), 1.0))
    if ad.comments is not None or ad.shares is not None:
        score += 0.5 * math.log10(1 + (ad.comments or 0) + 2 * (ad.shares or 0))
    score += 0.25 * (ad.budget or 0)
    ad.score = round(score, 4)


def known_ids(db: Session, ids: list[str]) -> set[str]:
    """Ads whose details (comments, shares, landing page) were already fetched."""
    if not ids:
        return set()
    return set(db.scalars(select(TikTokAd.id).where(TikTokAd.id.in_(ids), TikTokAd.comments.is_not(None))))


def ingest_tiktok_ads(db: Session, source: Source, raw_ads: list[RawTikTokAd],
                      log: Callable[[str], None]) -> tuple[int, int]:
    """Returns (ads in this collection, ads never seen before)."""
    now = utcnow()
    linked = set(db.scalars(select(SourceTikTokAd.ad_id).where(SourceTikTokAd.source_id == source.id)))
    new = 0
    with httpx.Client(timeout=30) as http:
        for raw in raw_ads:
            ad = db.get(TikTokAd, raw.id)
            if ad is None:
                ad = TikTokAd(id=raw.id, country=source.country, first_seen_at=now)
                db.add(ad)
                new += 1
            ad.title = raw.title
            ad.brand = raw.brand
            ad.industry_id = raw.industry_id
            ad.industry_parent = industry_parent(raw.industry_id)
            ad.objective = raw.objective
            ad.ctr_rank = raw.ctr_rank
            ad.likes = raw.likes
            ad.budget = raw.budget
            ad.duration_s = raw.duration_s
            ad.last_seen_at = now
            # Details are fetched once per ad; later collections only refresh the listing metrics.
            if raw.comments is not None:
                ad.comments = raw.comments
            if raw.shares is not None:
                ad.shares = raw.shares
            if raw.landing_page:
                ad.landing_page = raw.landing_page
                offer = classify_destination(raw.landing_page, None)
                ad.offer_key = offer.key[:255] if offer else None
                ad.offer_kind = offer.kind if offer else None
                ad.offer_platform = offer.platform if offer else None
            if raw.cover_url and not ad.cover_path:
                saved = download_image(http, raw.cover_url)
                ad.cover_path = saved[0] if saved else None
            score_tiktok_ad(ad)
    db.flush()
    current = {raw.id for raw in raw_ads}
    gone = linked - current
    if gone:
        db.execute(delete(SourceTikTokAd).where(SourceTikTokAd.source_id == source.id, SourceTikTokAd.ad_id.in_(gone)))
    for ad_id in current - linked:
        db.add(SourceTikTokAd(source_id=source.id, ad_id=ad_id))
    db.commit()
    with_offer = db.scalar(select(func.count()).select_from(TikTokAd).where(
        TikTokAd.id.in_(current), TikTokAd.offer_key.is_not(None)))
    log(f"{len(raw_ads)} anúncios do TikTok salvos ({new} novos, {with_offer} com oferta identificada)")
    return len(raw_ads), new

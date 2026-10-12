import re
from collections import Counter

from app.models import Ad, Creative
from app.pipeline.offers import offer_label
from app.pipeline.scoring import live_ads
from app.schemas import AdOut, CreativeCard, CreativeDetail, OfferRef, PageOut, ScoreOut, SnapshotOut

LIBRARY_AD_URL = "https://www.facebook.com/ads/library/?id={}"
_TEMPLATE_RE = re.compile(r"\{\{[^}]*\}\}")


def media_path(local: str | None, remote: str | None) -> str | None:
    return f"/media/{local}" if local else remote


def library_url(ad_archive_id: str) -> str:
    return LIBRARY_AD_URL.format(ad_archive_id)


def _has_real_copy(ad: Ad) -> bool:
    return bool(ad.body and _TEMPLATE_RE.sub("", ad.body).strip())


def representative_ad(creative: Creative) -> Ad | None:
    """The live ad with the most complete copy, else any ad."""
    candidates = live_ads(creative.ads) or creative.ads
    if not candidates:
        return None
    return max(candidates, key=lambda a: (_has_real_copy(a), bool(a.body), a.last_seen_at))


def ad_out(ad: Ad) -> AdOut:
    return AdOut(
        ad_archive_id=ad.ad_archive_id,
        page_id=ad.page_id,
        body=ad.body,
        title=ad.title,
        caption=ad.caption,
        cta_text=ad.cta_text,
        link_url=ad.link_url,
        display_format=ad.display_format,
        start_date=ad.start_date,
        end_date=ad.end_date,
        is_active=ad.is_active,
        platforms=ad.platforms or [],
        collation_count=ad.collation_count,
        source=ad.source,
        library_url=library_url(ad.ad_archive_id),
        last_seen_at=ad.last_seen_at,
    )


def offer_ref(creative: Creative) -> OfferRef | None:
    """The offer most of this creative's live ads point to."""
    ads = [a for a in (live_ads(creative.ads) or creative.ads) if a.offer_key]
    if not ads:
        return None
    key, _ = Counter(a.offer_key for a in ads).most_common(1)[0]
    ad = next(a for a in ads if a.offer_key == key)
    kind = ad.offer_kind or "site"
    page_name = ad.page.name if ad.page else None
    return OfferRef(key=key, label=offer_label(key, kind, ad.offer_platform, page_name), kind=kind,
                    platform=ad.offer_platform)


def creative_card(creative: Creative, collection_ids: list[int] | None = None, has_history: bool = False) -> CreativeCard:
    ad = representative_ad(creative)
    starts = [a.start_date for a in creative.ads if a.start_date]
    image = media_path(creative.local_path, creative.thumbnail_url)
    video = None
    if creative.media_type == "video":
        video = media_path(creative.local_video_path, creative.media_url)
    return CreativeCard(
        id=creative.id,
        media_type=creative.media_type,
        image=image,
        video=video,
        niche=creative.niche,
        score=ScoreOut.model_validate(creative.score) if creative.score else None,
        page=PageOut.model_validate(ad.page) if ad and ad.page else None,
        body=ad.body if ad else None,
        title=ad.title if ad else None,
        cta_text=ad.cta_text if ad else None,
        link_url=ad.link_url if ad else None,
        library_url=library_url(ad.ad_archive_id) if ad else None,
        start_date=min(starts) if starts else None,
        platforms=sorted({p for a in creative.ads for p in (a.platforms or [])}),
        ads_count=len(creative.ads),
        first_seen_at=creative.first_seen_at,
        collection_ids=collection_ids or [],
        offer=offer_ref(creative),
        has_history=has_history,
    )


def creative_detail(creative: Creative, collection_ids: list[int] | None = None) -> CreativeDetail:
    card = creative_card(creative, collection_ids, has_history=len(creative.snapshots) > 1)
    ads = sorted(creative.ads, key=lambda a: (not a.is_active, a.start_date or a.last_seen_at.date()))
    return CreativeDetail(
        **card.model_dump(),
        ads=[ad_out(a) for a in ads],
        snapshots=[SnapshotOut.model_validate(s) for s in creative.snapshots],
    )

"""Stores a Cloudflare Radar ranking for a source, keeping each site's previous position to show movement."""

from collections.abc import Callable

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.collectors.radar import RawSite
from app.models import Ad, Site, Source, SourceSite, TikTokAd, utcnow
from app.pipeline.offers import classify_destination


def site_offer_key(domain: str) -> str | None:
    offer = classify_destination(f"https://{domain}", None)
    return offer.key[:255] if offer else None


def ingest_sites(db: Session, source: Source, raw_sites: list[RawSite], log: Callable[[str], None]) -> tuple[int, int]:
    """Returns (sites in this ranking, sites never seen before)."""
    now = utcnow()
    links = {link.domain: link for link in db.scalars(select(SourceSite).where(SourceSite.source_id == source.id))}
    new = 0
    for raw in raw_sites:
        site = db.get(Site, raw.domain)
        if site is None:
            site = Site(domain=raw.domain, first_seen_at=now, offer_key=site_offer_key(raw.domain))
            db.add(site)
            new += 1
        if raw.categories:
            site.categories = ", ".join(dict.fromkeys(raw.categories))
        site.last_seen_at = now
    db.flush()

    current = {raw.domain for raw in raw_sites}
    gone = set(links) - current
    if gone:
        db.execute(delete(SourceSite).where(SourceSite.source_id == source.id, SourceSite.domain.in_(gone)))
    for raw in raw_sites:
        link = links.get(raw.domain)
        if link is None:
            db.add(SourceSite(source_id=source.id, domain=raw.domain, rank=raw.rank,
                              pct_rank_change=raw.pct_rank_change, first_seen_at=now))
        else:
            if link.rank != raw.rank:
                link.previous_rank = link.rank
            link.rank = raw.rank
            link.pct_rank_change = raw.pct_rank_change
    db.commit()

    keys = select(Site.offer_key).where(Site.domain.in_(current), Site.offer_key.is_not(None))
    with_ads = db.scalar(select(func.count(func.distinct(Site.domain))).where(
        Site.domain.in_(current),
        or_(Site.offer_key.in_(select(Ad.offer_key).where(Ad.offer_key.in_(keys))),
            Site.offer_key.in_(select(TikTokAd.offer_key).where(TikTokAd.offer_key.in_(keys)))),
    )) or 0
    log(f"{len(raw_sites)} sites salvos ({new} novos, {with_ads} com anúncios no Garimppu)")
    return len(raw_sites), new

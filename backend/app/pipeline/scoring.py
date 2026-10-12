"""Ranks creatives by indirect scaling signals.

score = w1*log(1+duplicates) + w2*min(days_active,90)/90 + w3*platforms/6
        + w4*growth_7d + w5*log(1+page_active_ads)/log(1+500)
"""

import math
from collections.abc import Iterable
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.models import Ad, Creative, CreativeScore, Page, Snapshot

MAX_LONGEVITY_DAYS = 90
MAX_PLATFORMS = 6
PAGE_ADS_REFERENCE = 500
GROWTH_CLAMP = (-1.0, 5.0)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def live_ads(ads: Iterable[Ad]) -> list[Ad]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=get_settings().stale_ad_days)
    return [a for a in ads if a.is_active and _aware(a.last_seen_at) >= cutoff]


def count_duplicates(ads: Iterable[Ad]) -> int:
    """Ads Meta collapses under one collation group count once per hidden copy."""
    groups: dict[str, int] = {}
    for ad in ads:
        key = ad.collation_id or ad.ad_archive_id
        groups[key] = max(groups.get(key, 1), ad.collation_count or 1)
    return sum(groups.values())


def days_running(ads: Iterable[Ad], today: date) -> int:
    best = 0
    for ad in ads:
        if ad.start_date:
            end = ad.end_date if ad.end_date and not ad.is_active else today
            best = max(best, (end - ad.start_date).days)
    return best


def growth_since(snapshots: list[Snapshot], current: int, today: date) -> float:
    previous = [s for s in snapshots if s.taken_on < today]
    if not previous:
        return 0.0
    target = today - timedelta(days=7)
    older = [s for s in previous if s.taken_on <= target]
    base = older[-1] if older else previous[0]
    growth = (current - base.active_ads) / max(base.active_ads, 1)
    return max(GROWTH_CLAMP[0], min(GROWTH_CLAMP[1], growth))


def compute_score(duplicates: int, days: int, platforms: int, growth: float, page_ads: int) -> float:
    s = get_settings()
    return round(
        s.score_w_duplicates * math.log1p(duplicates)
        + s.score_w_longevity * min(days, MAX_LONGEVITY_DAYS) / MAX_LONGEVITY_DAYS
        + s.score_w_platforms * min(platforms, MAX_PLATFORMS) / MAX_PLATFORMS
        + s.score_w_growth * growth
        + s.score_w_page * math.log1p(page_ads) / math.log1p(PAGE_ADS_REFERENCE),
        4,
    )


def refresh_page_counts(db: Session, page_ids: Iterable[str]) -> None:
    page_ids = list(set(page_ids))
    if not page_ids:
        return
    cutoff = datetime.now(timezone.utc) - timedelta(days=get_settings().stale_ad_days)
    counts = dict(
        db.execute(
            select(Ad.page_id, func.count())
            .where(Ad.page_id.in_(page_ids), Ad.is_active.is_(True), Ad.last_seen_at >= cutoff)
            .group_by(Ad.page_id)
        ).all()
    )
    for page in db.scalars(select(Page).where(Page.page_id.in_(page_ids))):
        page.active_ads_count = counts.get(page.page_id, 0)


def recompute_scores(db: Session, creative_ids: Iterable[int] | None = None, snapshot: bool = True) -> int:
    today = date.today()
    stmt = select(Creative).options(
        selectinload(Creative.ads).selectinload(Ad.page),
        selectinload(Creative.snapshots),
        selectinload(Creative.score),
    )
    if creative_ids is not None:
        ids = list(set(creative_ids))
        if not ids:
            return 0
        stmt = stmt.where(Creative.id.in_(ids))

    count = 0
    for creative in db.scalars(stmt):
        active = live_ads(creative.ads)
        considered = active or creative.ads
        duplicates = count_duplicates(active)
        days = days_running(considered, today)
        platforms = len({p for a in considered for p in (a.platforms or [])})
        page_ads = max((a.page.active_ads_count for a in considered if a.page), default=0)
        growth = growth_since(creative.snapshots, duplicates, today)

        score = creative.score or CreativeScore(creative_id=creative.id)
        score.duplicates = duplicates
        score.days_active = days
        score.platforms_count = platforms
        score.growth_7d = round(growth, 4)
        score.page_active_ads = page_ads
        score.is_active = bool(active)
        score.score = compute_score(duplicates, days, platforms, growth, page_ads)
        creative.score = score

        if snapshot:
            todays = next((s for s in creative.snapshots if s.taken_on == today), None)
            if todays:
                todays.active_ads = duplicates
            else:
                creative.snapshots.append(Snapshot(taken_on=today, active_ads=duplicates))
        count += 1
    db.flush()
    return count

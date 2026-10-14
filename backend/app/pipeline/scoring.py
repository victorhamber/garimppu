"""Ranks creatives by indirect scaling signals, as a 0-100 nota (see pipeline/nota.py).

  35  ads running this creative     fills at 30
  25  days on air                   fills at 60
  15  advertiser's active ads       fills at 100
  10  placements                    fills at 4
  15  growth in active ads, 7 days  fills at +100%; left out before the 2nd collection
"""

from collections.abc import Iterable
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.models import Ad, Creative, CreativeScore, Page, Snapshot
from app.pipeline.nota import linear, log_share, weighted

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


def growth_since(snapshots: list[Snapshot], current: int, today: date) -> float | None:
    previous = [s for s in snapshots if s.taken_on < today]
    if not previous:
        return None
    target = today - timedelta(days=7)
    older = [s for s in previous if s.taken_on <= target]
    base = older[-1] if older else previous[0]
    growth = (current - base.active_ads) / max(base.active_ads, 1)
    return max(GROWTH_CLAMP[0], min(GROWTH_CLAMP[1], growth))


def compute_score(duplicates: int, days: int, platforms: int, growth: float | None, page_ads: int) -> float:
    return weighted([
        (35, log_share(duplicates - 1, 29)),
        (25, linear(days, 60)),
        (15, log_share(page_ads, 100)),
        (10, linear(platforms, 4)),
        (15, None if growth is None else linear(growth, 1)),
    ])


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
        score.growth_7d = round(growth or 0.0, 4)
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

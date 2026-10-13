"""Qualifies organic videos: how fast they gather views, beyond their channel's size, and whether they are speeding up.

score = log10(1 + views/day)          1k/day -> 3, 100k/day -> 5
      + log10(1 + views/subscribers)   10x the channel -> 1, 100x -> 2
      + 0.5 * min(engagement / 5%, 1.5)
      + acceleration bonus             recent views/day vs lifetime: doubling -> +0.5, capped at +1 / -0.5
"""

import math
from datetime import datetime, timedelta, timezone

from app.models import Video

MIN_AGE_DAYS = 1.0
# The channel-size floor keeps a 30-subscriber channel with 3k views from outranking real breakouts.
MIN_SUBSCRIBERS = 1000
ENGAGEMENT_REFERENCE = 0.05
# Views/day measured over less than this is mostly noise from YouTube's counter updates.
MIN_GROWTH_WINDOW = timedelta(hours=20)


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def score_video(video: Video, now: datetime | None = None) -> None:
    now = now or datetime.now(timezone.utc)
    age_days = max((now - _utc(video.published_at)).total_seconds() / 86400, MIN_AGE_DAYS)
    views = video.views or 0
    video.velocity = round(views / age_days, 2)
    video.outlier = (
        round(views / max(video.channel_subscribers, MIN_SUBSCRIBERS), 3)
        if video.channel_subscribers is not None else None
    )
    interactions = (video.likes or 0) + 2 * (video.comments or 0)
    video.engagement = round(interactions / views, 4) if views and (video.likes is not None or video.comments is not None) else None
    video.acceleration = _acceleration(video, now)

    score = math.log10(1 + video.velocity)
    if video.outlier is not None:
        score += math.log10(1 + video.outlier)
    if video.engagement is not None:
        score += 0.5 * min(video.engagement / ENGAGEMENT_REFERENCE, 1.5)
    if video.acceleration is not None:
        score += max(min(math.log2(max(video.acceleration, 0.01)) / 2, 1.0), -0.5)
    video.score = round(score, 4)


def _acceleration(video: Video, now: datetime) -> float | None:
    """Views/day since the latest snapshot that is at least ~1 day old, relative to the lifetime average."""
    earlier = [s for s in video.snapshots if now - _utc(s.taken_at) >= MIN_GROWTH_WINDOW and s.views <= video.views]
    if not earlier or not video.velocity:
        return None
    base = earlier[-1]
    days = (now - _utc(base.taken_at)).total_seconds() / 86400
    recent = (video.views - base.views) / days
    return round(recent / video.velocity, 3)

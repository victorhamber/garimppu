"""Qualifies organic videos: how fast they gather views, beyond their channel's size, and whether they are speeding up.

Nota 0-100 (pipeline/nota.py):
  40  views per day          log scale, fills at 100k/day
  25  views vs subscribers   log scale, fills at 100x the channel
  15  engagement             fills at 5%
  20  acceleration           recent views/day vs lifetime: steady -> half, doubling -> full, halving -> none
"""

import math
from datetime import datetime, timedelta, timezone

from app.models import Video
from app.pipeline.nota import linear, weighted

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

    accel = video.acceleration
    video.score = weighted([
        (40, linear(math.log10(1 + video.velocity), 5)),
        (25, None if video.outlier is None else linear(math.log10(1 + video.outlier), 2)),
        (15, None if video.engagement is None else linear(video.engagement, ENGAGEMENT_REFERENCE)),
        (20, None if accel is None else linear(math.log2(max(accel, 0.01)) + 1, 2)),
    ])


def _acceleration(video: Video, now: datetime) -> float | None:
    """Views/day since the latest snapshot that is at least ~1 day old, relative to the lifetime average."""
    earlier = [s for s in video.snapshots if now - _utc(s.taken_at) >= MIN_GROWTH_WINDOW and s.views <= video.views]
    if not earlier or not video.velocity:
        return None
    base = earlier[-1]
    days = (now - _utc(base.taken_at)).total_seconds() / 86400
    recent = (video.views - base.views) / days
    return round(recent / video.velocity, 3)

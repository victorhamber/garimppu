"""Stores collected videos for a source: latest counters, one view snapshot per day, offer link, score."""

import re
from collections.abc import Callable

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.collectors.youtube import RawVideo
from app.models import Source, SourceVideo, Video, VideoSnapshot, utcnow
from app.pipeline.niche import NicheSignals, classify_signals
from app.pipeline.offers import classify_destination
from app.pipeline.video_score import score_video

DESCRIPTION_CHARS = 600
_URL_RE = re.compile(r"https?://[^\s<>()\"'\]]+", re.I)
# What a viewer is sent to buy is the signal; sites and social profiles in descriptions are mostly noise.
_OFFER_PRIORITY = {"infoproduto": 0, "loja": 1, "app": 2}


def description_offer(description: str | None):
    """The most commercial link in the description: checkout, then store product, then app."""
    best = None
    for raw in _URL_RE.findall(description or ""):
        url = raw.rstrip(".,;:!?")
        offer = classify_destination(url, None)
        if offer is None or offer.kind not in _OFFER_PRIORITY:
            continue
        if best is None or _OFFER_PRIORITY[offer.kind] < _OFFER_PRIORITY[best[1].kind]:
            best = (url, offer)
    return best


def video_niche(title: str | None, description: str | None, channel: str | None, offer_key: str | None) -> str | None:
    # Long descriptions are mostly sponsor blurbs and social links; the opening carries the topic.
    return classify_signals(NicheSignals(
        texts=[title, title, (description or "")[:DESCRIPTION_CHARS]], page_name=channel, offer_keys=[offer_key],
    ))


def ingest_videos(db: Session, source: Source, raw_videos: list[RawVideo], log: Callable[[str], None]) -> tuple[int, int]:
    """Returns (videos in this collection, videos never seen before)."""
    now = utcnow()
    today = now.date()
    linked = set(db.scalars(select(SourceVideo.video_id).where(SourceVideo.source_id == source.id)))
    new = 0
    for raw in raw_videos:
        video_id = f"youtube:{raw.external_id}"
        video = db.get(Video, video_id)
        if video is None:
            video = Video(id=video_id, platform="youtube", external_id=raw.external_id, first_seen_at=now)
            db.add(video)
            new += 1
        video.channel_id = raw.channel_id
        video.channel_title = raw.channel_title
        video.channel_subscribers = raw.channel_subscribers
        video.title = raw.title
        video.description = raw.description
        video.thumbnail_url = raw.thumbnail_url
        video.duration_s = raw.duration_s
        video.is_short = raw.is_short
        video.published_at = raw.published_at
        video.views = raw.views
        video.likes = raw.likes
        video.comments = raw.comments
        video.last_seen_at = now
        found = description_offer(raw.description)
        video.link_url = found[0] if found else None
        video.offer_key = found[1].key[:255] if found else None
        video.offer_kind = found[1].kind if found else None
        video.offer_platform = found[1].platform if found else None
        video.language = raw.language
        video.niche = video_niche(raw.title, raw.description, raw.channel_title, video.offer_key)

        score_video(video, now)
        snapshot = next((s for s in video.snapshots if s.taken_on == today), None)
        if snapshot is None:
            video.snapshots.append(VideoSnapshot(taken_on=today, taken_at=now, views=raw.views))
        else:
            snapshot.views = raw.views
    db.flush()
    # The search shows what is trending now: videos that left its top list are unlinked (they stay in the base).
    current = {f"youtube:{raw.external_id}" for raw in raw_videos}
    gone = linked - current
    if gone:
        db.execute(delete(SourceVideo).where(SourceVideo.source_id == source.id, SourceVideo.video_id.in_(gone)))
    for video_id in current - linked:
        db.add(SourceVideo(source_id=source.id, video_id=video_id))
    db.commit()
    with_offer = sum(1 for r in raw_videos if description_offer(r.description))
    log(f"{len(raw_videos)} vídeos salvos ({new} novos, {with_offer} com link de oferta na descrição)")
    return len(raw_videos), new


def rescore_videos(db: Session) -> int:
    """Daily refresh so views/day and acceleration age correctly between collections."""
    now = utcnow()
    videos = list(db.scalars(select(Video)))
    for video in videos:
        score_video(video, now)
    db.commit()
    return len(videos)

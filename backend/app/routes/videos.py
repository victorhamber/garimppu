"""Organic videos collected by YouTube searches, ranked by video_score."""

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import current_user
from app.config import get_settings
from app.db import get_db
from app.models import SourceVideo, User, Video
from app.pipeline.heat import HOT_SHARE, WARM_SHARE, rank_cutoff
from app.pipeline.offers import offer_label
from app.pipeline.sources import user_search_source, user_source_ids
from app.schemas import ScoreHeat, VideoOut, VideoPage

router = APIRouter(prefix="/api/videos", tags=["videos"])

VideoSort = Literal["score", "velocity", "views", "outlier", "engagement", "acceleration", "recent"]
SORT_COLUMNS = {
    "score": Video.score,
    "velocity": Video.velocity,
    "views": Video.views,
    "outlier": Video.outlier,
    "engagement": Video.engagement,
    "acceleration": Video.acceleration,
    "recent": Video.published_at,
}


def _video_url(video: Video) -> str:
    if video.is_short:
        return f"https://www.youtube.com/shorts/{video.external_id}"
    return f"https://www.youtube.com/watch?v={video.external_id}"


def _out(video: Video) -> VideoOut:
    label = offer_label(video.offer_key, video.offer_kind or "site", video.offer_platform, None) if video.offer_key else None
    fields = {f: getattr(video, f) for f in VideoOut.model_fields if f not in ("url", "offer_label")}
    return VideoOut(**fields, url=_video_url(video), offer_label=label)


@router.get("", response_model=VideoPage)
def list_videos(
    q: str | None = None,
    search_id: int | None = None,
    scope: Literal["mine", "all"] = Query("mine", description="mine = só vídeos das buscas do usuário"),
    offer: str | None = Query(None, description="Uma oferta exata (offer_key)"),
    niche: str | None = None,
    has_offer: bool = False,
    format: Literal["all", "short", "long"] = "all",
    period: int | None = Query(None, ge=1, le=365, description="Publicados nos últimos N dias"),
    min_views: int | None = Query(None, ge=0),
    sort: VideoSort = "score",
    limit: int = Query(30, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    stmt = select(Video)
    if search_id:
        source_id = user_search_source(user.id, search_id)
        stmt = stmt.where(Video.id.in_(select(SourceVideo.video_id).where(SourceVideo.source_id == source_id)))
    elif scope == "mine" and not offer:
        stmt = stmt.where(Video.id.in_(
            select(SourceVideo.video_id).where(SourceVideo.source_id.in_(user_source_ids(user.id)))
        ))
    if offer:
        stmt = stmt.where(Video.offer_key == offer)
    elif has_offer:
        stmt = stmt.where(Video.offer_key.is_not(None))
    if niche:
        stmt = stmt.where(Video.niche == niche)
    if format == "short":
        stmt = stmt.where(Video.is_short.is_(True))
    elif format == "long":
        stmt = stmt.where(Video.is_short.is_(False))
    if period:
        stmt = stmt.where(Video.published_at >= datetime.now(timezone.utc) - timedelta(days=period))
    if min_views is not None:
        stmt = stmt.where(Video.views >= min_views)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Video.title.ilike(like), Video.channel_title.ilike(like),
                              Video.description.ilike(like), Video.offer_key.ilike(like)))

    filtered = stmt.subquery()
    total = db.scalar(select(func.count()).select_from(filtered)) or 0
    scores = list(db.scalars(select(filtered.c.score)))
    heat = ScoreHeat(hot=rank_cutoff(scores, HOT_SHARE), warm=rank_cutoff(scores, WARM_SHARE))
    column = SORT_COLUMNS[sort]
    rows = db.scalars(
        stmt.order_by(column.desc().nulls_last(), Video.score.desc(), Video.id).offset(offset).limit(limit)
    )
    return VideoPage(total=total, items=[_out(v) for v in rows], heat=heat,
                     enabled=bool(get_settings().youtube_api_key))

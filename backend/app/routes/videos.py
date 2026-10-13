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
from app.csv_export import EXPORT_LIMIT, csv_response
from app.pipeline.heat import HOT_SHARE, WARM_SHARE, metric_cutoffs, rank_cutoff, rank_cutoffs
from app.pipeline.niche import NICHES
from app.pipeline.offers import offer_label
from app.pipeline.sources import SCOPE_HELP, resolve_scope, user_search_source, user_source_ids
from app.routes.collections import collections_by_ref, saved_refs
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
    fields = {f: getattr(video, f) for f in VideoOut.model_fields if f not in ("url", "offer_label", "collection_ids")}
    return VideoOut(**fields, url=_video_url(video), offer_label=label)


@router.get("", response_model=VideoPage)
def list_videos(
    q: str | None = None,
    search_id: int | None = None,
    collection_id: int | None = None,
    scope: Literal["mine", "all"] | None = Query(None, description=SCOPE_HELP),
    offer: str | None = Query(None, description="Uma oferta exata (offer_key)"),
    niche: str | None = None,
    has_offer: bool = False,
    format: Literal["all", "short", "long"] = "all",
    period: int | None = Query(None, ge=1, le=365, description="Publicados nos últimos N dias"),
    min_views: int | None = Query(None, ge=0),
    sort: VideoSort = "score",
    limit: int = Query(30, ge=1, le=EXPORT_LIMIT),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    scope = resolve_scope(db, user.id, scope)
    stmt = select(Video)
    if collection_id:
        stmt = stmt.where(Video.id.in_(saved_refs(collection_id, "video", user)))
    if search_id:
        source_id = user_search_source(user.id, search_id)
        stmt = stmt.where(Video.id.in_(select(SourceVideo.video_id).where(SourceVideo.source_id == source_id)))
    elif scope == "mine" and not (offer or collection_id):
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
    signals = db.execute(select(filtered.c.score, filtered.c.views, filtered.c.velocity, filtered.c.outlier,
                                filtered.c.engagement)).all()
    heat = ScoreHeat(
        hot=rank_cutoff([s[0] for s in signals], HOT_SHARE),
        warm=rank_cutoff([s[0] for s in signals], WARM_SHARE),
        ranks=rank_cutoffs([s[0] for s in signals]),
        metrics=metric_cutoffs(
            {"views": [s[1] for s in signals], "velocity": [s[2] for s in signals],
             "outlier": [s[3] for s in signals], "engagement": [s[4] for s in signals]},
            {"views": 1_000, "velocity": 100, "outlier": 1, "engagement": 0.02},
        ),
    )
    column = SORT_COLUMNS[sort]
    rows = db.scalars(
        stmt.order_by(column.desc().nulls_last(), Video.score.desc(), Video.id).offset(offset).limit(limit)
    )
    items = [_out(v) for v in rows]
    saved_in = collections_by_ref(db, "video", [v.id for v in items], user)
    for item in items:
        item.collection_ids = saved_in.get(item.id, [])
    return VideoPage(total=total, items=items, heat=heat, enabled=bool(get_settings().youtube_api_key), scope=scope)


VIDEO_CSV = ["titulo", "url", "canal", "inscritos", "nicho", "short", "publicado", "score", "views", "views_por_dia",
             "x_canal", "engajamento", "aceleracao", "curtidas", "comentarios", "oferta", "link"]


@router.get("/export.csv")
def export_videos(page: VideoPage = Depends(list_videos)):
    return csv_response("videos-youtube.csv", VIDEO_CSV, (
        [v.title, v.url, v.channel_title, v.channel_subscribers, NICHES.get(v.niche or "", {}).get("label", v.niche),
         "sim" if v.is_short else "não", v.published_at.date().isoformat(), v.score, v.views, round(v.velocity),
         v.outlier, v.engagement, v.acceleration, v.likes, v.comments, v.offer_label, v.link_url]
        for v in page.items
    ))

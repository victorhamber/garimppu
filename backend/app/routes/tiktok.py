"""TikTok Creative Center top ads collected by TikTok searches, ranked by pipeline.tiktok_ingest."""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import current_user
from app.collectors.tiktok_ads import INDUSTRIES, OBJECTIVES, detail_url
from app.db import get_db
from app.models import SourceTikTokAd, TikTokAd, User
from app.pipeline.heat import HOT_SHARE, WARM_SHARE, rank_cutoff
from app.pipeline.offers import offer_label
from app.pipeline.sources import user_search_source, user_source_ids
from app.schemas import ScoreHeat, TikTokAdOut, TikTokAdPage, TikTokIndustry
from app.serializers import media_path

router = APIRouter(prefix="/api/tiktok", tags=["tiktok"])

TikTokSort = Literal["score", "ctr", "likes", "comments", "shares", "recent"]
SORT_COLUMNS = {
    "score": TikTokAd.score.desc(),
    "ctr": TikTokAd.ctr_rank.asc(),  # lower percentile = better click-through
    "likes": TikTokAd.likes.desc(),
    "comments": TikTokAd.comments.desc(),
    "shares": TikTokAd.shares.desc(),
    "recent": TikTokAd.first_seen_at.desc(),
}


def _out(ad: TikTokAd) -> TikTokAdOut:
    label = offer_label(ad.offer_key, ad.offer_kind or "site", ad.offer_platform, ad.brand) if ad.offer_key else None
    return TikTokAdOut(
        id=ad.id, url=detail_url(ad.id, ad.country), country=ad.country, title=ad.title, brand=ad.brand,
        industry=INDUSTRIES.get(ad.industry_parent), industry_id=ad.industry_parent,
        objective=OBJECTIVES.get(ad.objective, ad.objective), ctr_rank=ad.ctr_rank, likes=ad.likes,
        comments=ad.comments, shares=ad.shares, budget=ad.budget, duration_s=ad.duration_s,
        cover=media_path(ad.cover_path, None), landing_page=ad.landing_page, offer_key=ad.offer_key,
        offer_label=label, score=ad.score, first_seen_at=ad.first_seen_at,
    )


@router.get("/industries", response_model=list[TikTokIndustry])
def list_industries():
    return sorted((TikTokIndustry(id=k, label=v) for k, v in INDUSTRIES.items()), key=lambda i: i.label)


@router.get("/ads", response_model=TikTokAdPage)
def list_ads(
    q: str | None = None,
    search_id: int | None = None,
    scope: Literal["mine", "all"] = Query("mine", description="mine = só anúncios das buscas do usuário"),
    industry: int | None = None,
    objective: str | None = None,
    offer: str | None = Query(None, description="Uma oferta exata (offer_key)"),
    has_offer: bool = False,
    sort: TikTokSort = "score",
    limit: int = Query(30, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    stmt = select(TikTokAd)
    if search_id:
        source_id = user_search_source(user.id, search_id)
        stmt = stmt.where(TikTokAd.id.in_(select(SourceTikTokAd.ad_id).where(SourceTikTokAd.source_id == source_id)))
    elif scope == "mine" and not offer:
        stmt = stmt.where(TikTokAd.id.in_(
            select(SourceTikTokAd.ad_id).where(SourceTikTokAd.source_id.in_(user_source_ids(user.id)))
        ))
    if industry:
        stmt = stmt.where(TikTokAd.industry_parent == industry)
    if objective:
        stmt = stmt.where(TikTokAd.objective == objective)
    if offer:
        stmt = stmt.where(TikTokAd.offer_key == offer)
    elif has_offer:
        stmt = stmt.where(TikTokAd.offer_key.is_not(None))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(TikTokAd.title.ilike(like), TikTokAd.brand.ilike(like),
                              TikTokAd.landing_page.ilike(like), TikTokAd.offer_key.ilike(like)))

    filtered = stmt.subquery()
    total = db.scalar(select(func.count()).select_from(filtered)) or 0
    scores = list(db.scalars(select(filtered.c.score)))
    heat = ScoreHeat(hot=rank_cutoff(scores, HOT_SHARE), warm=rank_cutoff(scores, WARM_SHARE))
    rows = db.scalars(stmt.order_by(SORT_COLUMNS[sort].nulls_last(), TikTokAd.score.desc(), TikTokAd.id)
                      .offset(offset).limit(limit))
    return TikTokAdPage(total=total, items=[_out(a) for a in rows], heat=heat)

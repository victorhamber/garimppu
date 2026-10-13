"""TikTok Creative Center top ads collected by TikTok searches, ranked by pipeline.tiktok_ingest."""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import current_user
from app.collectors.tiktok_ads import INDUSTRIES, OBJECTIVES, detail_url
from app.db import get_db
from app.models import SourceTikTokAd, TikTokAd, User
from app.csv_export import EXPORT_LIMIT, csv_response
from app.pipeline.heat import HOT_SHARE, WARM_SHARE, metric_cutoffs, rank_cutoff, rank_cutoffs
from app.pipeline.offers import offer_label
from app.pipeline.sources import SCOPE_HELP, resolve_scope, user_search_source, user_source_ids
from app.routes.collections import collections_by_ref, saved_refs
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
    collection_id: int | None = None,
    scope: Literal["mine", "all"] | None = Query(None, description=SCOPE_HELP),
    industry: int | None = None,
    objective: str | None = None,
    offer: str | None = Query(None, description="Uma oferta exata (offer_key)"),
    has_offer: bool = False,
    sort: TikTokSort = "score",
    limit: int = Query(30, ge=1, le=EXPORT_LIMIT),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    scope = resolve_scope(db, user.id, scope)
    stmt = select(TikTokAd)
    if collection_id:
        stmt = stmt.where(TikTokAd.id.in_(saved_refs(collection_id, "tiktok", user)))
    if search_id:
        source_id = user_search_source(user.id, search_id)
        stmt = stmt.where(TikTokAd.id.in_(select(SourceTikTokAd.ad_id).where(SourceTikTokAd.source_id == source_id)))
    elif scope == "mine" and not (offer or collection_id):
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
    signals = db.execute(select(filtered.c.score, filtered.c.ctr_rank, filtered.c.likes, filtered.c.comments,
                                filtered.c.shares)).all()
    heat = ScoreHeat(
        hot=rank_cutoff([s[0] for s in signals], HOT_SHARE),
        warm=rank_cutoff([s[0] for s in signals], WARM_SHARE),
        ranks=rank_cutoffs([s[0] for s in signals]),
        metrics=metric_cutoffs(
            {"ctr_rank": [s[1] for s in signals], "likes": [s[2] for s in signals],
             "comments": [s[3] for s in signals], "shares": [s[4] for s in signals]},
            {"ctr_rank": 0.5, "likes": 100, "comments": 10, "shares": 10},
            lower_is_better=frozenset({"ctr_rank"}),
        ),
    )
    rows = db.scalars(stmt.order_by(SORT_COLUMNS[sort].nulls_last(), TikTokAd.score.desc(), TikTokAd.id)
                      .offset(offset).limit(limit))
    items = [_out(a) for a in rows]
    saved_in = collections_by_ref(db, "tiktok", [a.id for a in items], user)
    for item in items:
        item.collection_ids = saved_in.get(item.id, [])
    return TikTokAdPage(total=total, items=items, heat=heat, scope=scope)


TIKTOK_CSV = ["texto", "url", "marca", "pais", "nicho", "objetivo", "score", "ctr_top", "curtidas", "comentarios",
              "compartilhamentos", "verba", "duracao_s", "pagina_destino", "oferta", "primeira_vez"]
BUDGETS = ["baixa", "média", "alta"]


@router.get("/ads/export.csv")
def export_ads(page: TikTokAdPage = Depends(list_ads)):
    return csv_response("anuncios-tiktok.csv", TIKTOK_CSV, (
        [a.title, a.url, a.brand, a.country, a.industry, a.objective, a.score, a.ctr_rank, a.likes, a.comments,
         a.shares, BUDGETS[a.budget] if a.budget is not None and 0 <= a.budget < len(BUDGETS) else None,
         a.duration_s, a.landing_page, a.offer_label, a.first_seen_at.date().isoformat()]
        for a in page.items
    ))

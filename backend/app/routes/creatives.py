import csv
import io
from dataclasses import dataclass
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.auth import current_user
from app.db import get_db
from app.models import (
    Ad,
    AdCreative,
    CollectionItem,
    Creative,
    CreativeScore,
    Page,
    Snapshot,
    Source,
    SourceAd,
    User,
)
from app.pipeline.heat import HOT_SHARE, MIN_DAYS_ACTIVE, MIN_DUPLICATES, WARM_SHARE, metric_cutoffs, rank_cutoff, rank_cutoffs
from app.pipeline.niche import NICHES
from app.pipeline.sources import SCOPE_HELP, resolve_scope, user_search_source, user_source_ids
from app.routes.collections import user_collection_ids
from app.schemas import CreativeDetail, CreativePage, ScoreHeat
from app.serializers import creative_card, creative_detail

router = APIRouter(prefix="/api/creatives", tags=["creatives"])

SortKey = Literal["score", "duplicates", "days_active", "growth", "recent"]
SORT_COLUMNS = {
    "score": CreativeScore.score,
    "duplicates": CreativeScore.duplicates,
    "days_active": CreativeScore.days_active,
    "growth": CreativeScore.growth_7d,
    "recent": Creative.first_seen_at,
}


@dataclass
class CreativeFilters:
    q: str | None = Query(None, description="Texto no anúncio ou nome do anunciante")
    search_id: int | None = None
    country: str | None = None
    niche: str | None = None
    media_type: Literal["image", "video", "text"] | None = None
    page_id: str | None = None
    offer: str | None = None
    collection_id: int | None = None
    min_days: int | None = Query(None, ge=0)
    min_duplicates: int | None = Query(None, ge=0)
    active_only: bool = True
    include_brands: bool = Query(False, description="Inclui páginas de marcas grandes, que afiliados não promovem")
    scope: Literal["mine", "all"] | None = Query(None, description=SCOPE_HELP)
    sort: SortKey = "score"

    @property
    def hides_brands(self) -> bool:
        # An advertiser, collection or offer the user opened is shown whole, brand or not.
        return not (self.include_brands or self.page_id or self.collection_id or self.offer)

    @property
    def only_mine(self) -> bool:
        # A specific search, advertiser, offer or collection already defines what to show.
        return self.scope == "mine" and not (self.search_id or self.page_id or self.offer or self.collection_id)


def _creatives_with_ads(ad_condition) -> Select:
    return select(AdCreative.creative_id).join(Ad, Ad.ad_archive_id == AdCreative.ad_archive_id).where(ad_condition)


def _brand_creatives() -> Select:
    return _creatives_with_ads(Ad.page_id.in_(select(Page.page_id).where(Page.big_brand.is_(True))))


def build_query(f: CreativeFilters, user: User, hide_brands: bool | None = None) -> Select:
    stmt = select(Creative).join(CreativeScore, CreativeScore.creative_id == Creative.id)
    if f.only_mine:
        stmt = stmt.where(Creative.id.in_(
            select(AdCreative.creative_id)
            .join(SourceAd, SourceAd.ad_archive_id == AdCreative.ad_archive_id)
            .where(SourceAd.source_id.in_(user_source_ids(user.id)))
        ))
    if f.hides_brands if hide_brands is None else hide_brands:
        stmt = stmt.where(Creative.id.not_in(_brand_creatives()))
    if f.active_only:
        stmt = stmt.where(CreativeScore.is_active.is_(True))
    if f.niche:
        stmt = stmt.where(Creative.niche == f.niche)
    if f.media_type:
        stmt = stmt.where(Creative.media_type == f.media_type)
    if f.min_days is not None:
        stmt = stmt.where(CreativeScore.days_active >= f.min_days)
    if f.min_duplicates is not None:
        stmt = stmt.where(CreativeScore.duplicates >= f.min_duplicates)
    if f.page_id:
        stmt = stmt.where(Creative.id.in_(_creatives_with_ads(Ad.page_id == f.page_id)))
    if f.offer:
        stmt = stmt.where(Creative.id.in_(_creatives_with_ads(Ad.offer_key == f.offer)))
    if f.search_id or f.country:
        sub = select(AdCreative.creative_id).join(
            SourceAd, SourceAd.ad_archive_id == AdCreative.ad_archive_id
        )
        if f.search_id:
            sub = sub.where(SourceAd.source_id == user_search_source(user.id, f.search_id))
        if f.country:
            sub = sub.join(Source, Source.id == SourceAd.source_id).where(Source.country == f.country.upper())
        stmt = stmt.where(Creative.id.in_(sub))
    if f.collection_id:
        stmt = stmt.where(
            Creative.id.in_(select(CollectionItem.creative_id).where(
                CollectionItem.collection_id == f.collection_id,
                CollectionItem.collection_id.in_(user_collection_ids(user)),
            ))
        )
    if f.q:
        like = f"%{f.q.strip()}%"
        page_ids = select(Page.page_id).where(Page.name.ilike(like))
        stmt = stmt.where(
            Creative.id.in_(
                _creatives_with_ads(
                    or_(Ad.body.ilike(like), Ad.title.ilike(like), Ad.caption.ilike(like),
                        Ad.link_url.ilike(like), Ad.page_id.in_(page_ids))
                )
            )
        )
    order = SORT_COLUMNS[f.sort]
    return stmt.order_by(order.desc(), CreativeScore.score.desc(), Creative.id.desc())


def _load_options():
    return (
        selectinload(Creative.ads).selectinload(Ad.page),
        selectinload(Creative.score),
    )


def collections_by_creative(db: Session, creative_ids: list[int], user: User) -> dict[int, list[int]]:
    result: dict[int, list[int]] = {}
    if not creative_ids:
        return result
    for cid, coll in db.execute(
        select(CollectionItem.creative_id, CollectionItem.collection_id).where(
            CollectionItem.creative_id.in_(creative_ids),
            CollectionItem.collection_id.in_(user_collection_ids(user)),
        )
    ):
        result.setdefault(cid, []).append(coll)
    return result


@router.get("", response_model=CreativePage)
def list_creatives(
    f: CreativeFilters = Depends(),
    limit: int = Query(48, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    f.scope = resolve_scope(db, user.id, f.scope)
    stmt = build_query(f, user)
    signals = db.execute(
        stmt.order_by(None).with_only_columns(
            CreativeScore.score, CreativeScore.duplicates, CreativeScore.days_active, maintain_column_froms=True
        )
    ).all()
    creatives = list(db.scalars(stmt.options(*_load_options()).limit(limit).offset(offset)))
    ids = [c.id for c in creatives]
    colls = collections_by_creative(db, ids, user)
    with_history = creatives_with_history(db, ids)
    hidden = 0
    if f.hides_brands:
        everything = build_query(f, user, hide_brands=False).order_by(None)
        hidden = db.scalar(select(func.count()).select_from(everything.subquery())) - len(signals)
    return CreativePage(
        total=len(signals),
        items=[creative_card(c, colls.get(c.id), c.id in with_history) for c in creatives],
        heat=creative_heat(signals),
        has_history=db.scalar(_history_query().limit(1)) is not None,
        hidden_brands=hidden,
        scope=f.scope,
    )


def _history_query() -> Select:
    """Creatives seen in more than one collection day, the minimum for growth to mean anything."""
    return select(Snapshot.creative_id).group_by(Snapshot.creative_id).having(func.count() > 1)


def creatives_with_history(db: Session, creative_ids: list[int]) -> set[int]:
    if not creative_ids:
        return set()
    return set(db.scalars(_history_query().where(Snapshot.creative_id.in_(creative_ids))))


def creative_heat(signals) -> ScoreHeat:
    scores = [s for s, _, _ in signals]
    return ScoreHeat(
        hot=rank_cutoff(scores, HOT_SHARE),
        warm=rank_cutoff(scores, WARM_SHARE),
        ranks=rank_cutoffs(scores),
        metrics=metric_cutoffs(
            {"duplicates": [d for _, d, _ in signals], "days_active": [d for _, _, d in signals]},
            {"duplicates": MIN_DUPLICATES, "days_active": MIN_DAYS_ACTIVE},
        ),
    )


CSV_COLUMNS = [
    "creative_id", "score", "duplicates", "days_active", "growth_7d", "platforms", "media_type", "niche",
    "page_name", "page_id", "title", "body", "cta", "link_url", "library_url", "media_url", "start_date",
]


@router.get("/export.csv")
def export_csv(f: CreativeFilters = Depends(), limit: int = Query(5000, ge=1, le=50000),
               db: Session = Depends(get_db), user: User = Depends(current_user)):
    f.scope = resolve_scope(db, user.id, f.scope)
    creatives = list(db.scalars(build_query(f, user).options(*_load_options()).limit(limit)))

    def rows():
        buf = io.StringIO()
        writer = csv.writer(buf, delimiter=";")
        buf.write("\ufeff")
        writer.writerow(CSV_COLUMNS)
        for creative in creatives:
            card = creative_card(creative)
            s = card.score
            writer.writerow([
                card.id, s.score if s else "", s.duplicates if s else "", s.days_active if s else "",
                s.growth_7d if s else "", ",".join(card.platforms), card.media_type,
                NICHES.get(card.niche or "", {}).get("label", card.niche or ""),
                card.page.name if card.page else "", card.page.page_id if card.page else "",
                card.title or "", card.body or "", card.cta_text or "", card.link_url or "",
                card.library_url or "", creative.media_url or creative.thumbnail_url or "",
                card.start_date.isoformat() if card.start_date else "",
            ])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    return StreamingResponse(
        rows(), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="criativos.csv"'},
    )


@router.get("/{creative_id}", response_model=CreativeDetail)
def get_creative(creative_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    creative = db.scalar(
        select(Creative)
        .where(Creative.id == creative_id)
        .options(*_load_options(), selectinload(Creative.snapshots))
    )
    if creative is None:
        raise HTTPException(404, "Criativo não encontrado")
    colls = collections_by_creative(db, [creative.id], user)
    return creative_detail(creative, colls.get(creative.id))

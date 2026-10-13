"""Trending Google searches per country, by niche, with how long they trend and whether Meta ads use the term."""

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import current_user
from app.collectors.google_suggest import SuggestError, suggest
from app.config import get_settings
from app.db import get_db
from app.models import Ad, Search, SourceTrend, TrendKeyword, TrendSnapshot, User
from app.pipeline.heat import HOT_SHARE, WARM_SHARE, rank_cutoff
from app.pipeline.niche import NicheSignals, classify_signals
from app.pipeline.sources import as_utc, user_search_source, user_source_ids
from app.routes.searches import COUNTRY_LANGUAGE
from app.schemas import KeywordOut, KeywordPage, KeywordSuggestion, KeywordSuggestions, ScoreHeat, TrendNews

router = APIRouter(prefix="/api/keywords", tags=["keywords"])

KeywordSort = Literal["traffic", "recent", "days", "new"]
# Terms shorter than this match too many unrelated ad texts.
MIN_MENTION_LENGTH = 4
MENTION_CAP = 99


# Each mention count scans the ads table, so suggestions only get it for the top ranks.
MENTION_RANKS = 60


def meta_mentions(db: Session, term: str) -> int | None:
    if len(term) < MIN_MENTION_LENGTH:
        return None
    pattern = f"%{term}%"
    hits = select(Ad.ad_archive_id).where(or_(Ad.body.ilike(pattern), Ad.title.ilike(pattern))).limit(MENTION_CAP + 1)
    return db.scalar(select(func.count()).select_from(hits.subquery())) or 0


@router.get("/suggest", response_model=KeywordSuggestions)
def suggest_keywords(
    term: str = Query(..., min_length=2, max_length=80),
    country: str = Query("BR", min_length=2, max_length=2),
    limit: int = Query(60, ge=1, le=150),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    country = country.upper()
    language = f"{COUNTRY_LANGUAGE.get(country, 'pt')}-{country}"
    try:
        found = suggest(term, country=country, language=language)[:limit]
    except SuggestError as exc:
        raise HTTPException(502, str(exc)) from exc
    top = max((s.score for s in found), default=1) or 1
    base_niche = classify_signals(NicheSignals(texts=[term]))
    terms = [s.term for s in found]
    trending = set(db.scalars(select(func.lower(TrendKeyword.term)).where(
        TrendKeyword.geo == country, func.lower(TrendKeyword.term).in_(terms)))) if terms else set()
    items = [
        KeywordSuggestion(
            term=s.term, popularity=max(1, round(100 * s.score / top)), hits=s.hits,
            niche=base_niche or classify_signals(NicheSignals(texts=[s.term])),
            meta_ads=meta_mentions(db, s.term) if rank < MENTION_RANKS else None, trending=s.term in trending,
        )
        for rank, s in enumerate(found)
    ]
    return KeywordSuggestions(term=term.strip(), country=country, items=items)


@router.get("", response_model=KeywordPage)
def list_keywords(
    q: str | None = None,
    search_id: int | None = None,
    scope: Literal["mine", "all"] = Query("mine", description="mine = só termos das buscas do usuário"),
    niche: str | None = None,
    has_niche: bool = Query(False, description="Só termos com nicho identificado"),
    geo: str | None = None,
    days: int | None = Query(None, ge=1, le=365, description="Só termos em alta nos últimos N dias"),
    sort: KeywordSort = "traffic",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    trend_days = (select(TrendSnapshot.keyword_id, func.count().label("n"))
                  .group_by(TrendSnapshot.keyword_id).subquery())
    days_col = func.coalesce(trend_days.c.n, 0)
    stmt = select(TrendKeyword, days_col).outerjoin(trend_days, trend_days.c.keyword_id == TrendKeyword.id)
    if search_id:
        stmt = stmt.where(TrendKeyword.id.in_(
            select(SourceTrend.keyword_id).where(SourceTrend.source_id == user_search_source(user.id, search_id))
        ))
        # A trends search's niche is a filter over its country's terms.
        search_niche = db.scalar(select(Search.niche).where(Search.id == search_id, Search.user_id == user.id))
        niche = niche or search_niche
    elif scope == "mine":
        stmt = stmt.where(TrendKeyword.id.in_(
            select(SourceTrend.keyword_id).where(SourceTrend.source_id.in_(user_source_ids(user.id)))
        ))
    if niche:
        stmt = stmt.where(TrendKeyword.niche == niche)
    elif has_niche:
        stmt = stmt.where(TrendKeyword.niche.is_not(None))
    if geo:
        stmt = stmt.where(TrendKeyword.geo == geo.upper())
    if days:
        stmt = stmt.where(TrendKeyword.last_seen_at >= datetime.now(timezone.utc) - timedelta(days=days))
    if q and q.strip():
        stmt = stmt.where(TrendKeyword.term.ilike(f"%{q.strip()}%"))

    filtered = stmt.subquery()
    total = db.scalar(select(func.count()).select_from(filtered)) or 0
    peaks = [p for p in db.scalars(select(filtered.c.peak_traffic)) if p is not None]
    heat = ScoreHeat(hot=rank_cutoff(peaks, HOT_SHARE), warm=rank_cutoff(peaks, WARM_SHARE))
    order = {
        "traffic": (TrendKeyword.peak_traffic.desc().nulls_last(), TrendKeyword.last_seen_at.desc()),
        "recent": (TrendKeyword.last_seen_at.desc(), TrendKeyword.peak_traffic.desc().nulls_last()),
        "days": (days_col.desc(), TrendKeyword.peak_traffic.desc().nulls_last()),
        "new": (TrendKeyword.first_seen_at.desc(), TrendKeyword.peak_traffic.desc().nulls_last()),
    }[sort]
    rows = db.execute(stmt.order_by(*order, TrendKeyword.id).offset(offset).limit(limit)).all()

    ids = [keyword.id for keyword, _ in rows]
    history: dict[int, list[int | None]] = {}
    for keyword_id, traffic in db.execute(
        select(TrendSnapshot.keyword_id, TrendSnapshot.traffic)
        .where(TrendSnapshot.keyword_id.in_(ids)).order_by(TrendSnapshot.day.desc())
    ):
        history.setdefault(keyword_id, []).append(traffic)

    now_cutoff = datetime.now(timezone.utc) - timedelta(hours=get_settings().trends_refresh_hours * 3)
    items = [
        KeywordOut(
            id=keyword.id, term=keyword.term, geo=keyword.geo, niche=keyword.niche, traffic=keyword.traffic,
            peak_traffic=keyword.peak_traffic,
            previous_traffic=next(iter(history.get(keyword.id, [])[1:2]), None),
            days_trending=n_days, sightings=keyword.sightings or 0,
            trending_now=as_utc(keyword.last_seen_at) >= now_cutoff,
            news=[TrendNews(**n) for n in (keyword.news or []) if n.get("title") and n.get("url")],
            picture_url=keyword.picture_url, meta_ads=meta_mentions(db, keyword.term),
            first_seen_at=keyword.first_seen_at, last_seen_at=keyword.last_seen_at,
        )
        for keyword, n_days in rows
    ]
    countries = sorted(db.scalars(select(TrendKeyword.geo).distinct()))
    return KeywordPage(total=total, items=items, heat=heat, countries=countries)

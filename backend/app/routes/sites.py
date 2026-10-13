"""Most visited / rising sites collected from Cloudflare Radar rankings, with the ads running on each one."""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import current_user
from app.collectors.radar import CATEGORIES, PREFIX, RANKINGS, parse_term
from app.config import get_settings
from app.db import get_db
from app.models import Ad, Search, Site, Source, SourceSite, TikTokAd, User
from app.pipeline.sources import user_search_source, user_source_ids
from app.schemas import SiteOption, SiteOut, SitePage

router = APIRouter(prefix="/api/sites", tags=["sites"])

SiteSort = Literal["rank", "rise", "ads", "recent"]


def offer_counts(db: Session, offer_keys: set[str]) -> tuple[dict[str, int], dict[str, int]]:
    """Meta and TikTok ads per site offer key; store offers ("host/produto") count for their host."""
    if not offer_keys:
        return {}, {}
    result: list[dict[str, int]] = []
    for column in (Ad.offer_key, TikTokAd.offer_key):
        match = or_(column.in_(offer_keys), *[column.like(f"{key}/%") for key in offer_keys])
        counts: dict[str, int] = {}
        for key, n in db.execute(select(column, func.count()).where(match).group_by(column)):
            host = key.split("/")[0]
            counts[host] = counts.get(host, 0) + n
        result.append(counts)
    return result[0], result[1]


@router.get("/options")
def list_options(db: Session = Depends(get_db)):
    seen = {c.strip() for row in db.scalars(select(Site.categories).where(Site.categories.is_not(None)))
            for c in row.split(",") if c.strip()}
    return {
        "categories": sorted((SiteOption(id=c, label=CATEGORIES.get(c, c)) for c in seen), key=lambda o: o.label),
        "rankings": [SiteOption(id=k, label=v) for k, v in RANKINGS.items()],
    }


@router.get("", response_model=SitePage)
def list_sites(
    q: str | None = None,
    search_id: int | None = None,
    scope: Literal["mine", "all"] = Query("mine", description="mine = só sites das buscas do usuário"),
    category: str | None = None,
    ranking: Literal["POPULAR", "TRENDING_RISE", "TRENDING_STEADY"] | None = None,
    has_ads: bool = Query(False, description="Só sites com anúncios no Meta ou no TikTok já coletados"),
    sort: SiteSort = "rank",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    stmt = select(SourceSite, Site, Source).join(Site, Site.domain == SourceSite.domain).join(
        Source, Source.id == SourceSite.source_id)
    if search_id:
        stmt = stmt.where(SourceSite.source_id == user_search_source(user.id, search_id))
    elif scope == "mine":
        stmt = stmt.where(SourceSite.source_id.in_(user_source_ids(user.id)))
    if category:
        stmt = stmt.where(Site.categories.like(f"%{category}%"))
    if ranking:
        stmt = stmt.where(Source.term.like(f"{PREFIX}{ranking}:%"))
    if q:
        stmt = stmt.where(or_(Site.domain.ilike(f"%{q.strip()}%"), Site.categories.ilike(f"%{q.strip()}%")))

    rows = db.execute(stmt).all()
    meta, tiktok = offer_counts(db, {site.offer_key for _, site, _ in rows if site.offer_key})
    terms = dict(db.execute(select(Search.source_id, Search.term).where(Search.user_id == user.id)).all())

    items: list[SiteOut] = []
    for link, site, source in rows:
        rank_type, cat = parse_term(source.term)
        key = site.offer_key
        items.append(SiteOut(
            domain=site.domain, url=f"https://{site.domain}", rank=link.rank, previous_rank=link.previous_rank,
            pct_rank_change=link.pct_rank_change, ranking=rank_type, ranking_label=RANKINGS.get(rank_type, rank_type),
            category=cat, category_label=CATEGORIES.get(cat, cat) if cat else None,
            categories=[CATEGORIES.get(c.strip(), c.strip()) for c in (site.categories or "").split(",") if c.strip()],
            country=source.country, search_term=terms.get(source.id), offer_key=key,
            meta_ads=meta.get(key, 0) if key else 0, tiktok_ads=tiktok.get(key, 0) if key else 0,
            first_seen_at=link.first_seen_at,
        ))
    if has_ads:
        items = [s for s in items if s.meta_ads or s.tiktok_ads]

    def climb(s: SiteOut) -> float:
        if s.previous_rank is not None:
            return s.previous_rank - s.rank
        return s.pct_rank_change or 0

    sorters = {
        "rank": lambda s: (s.rank, s.domain),
        "rise": lambda s: (-climb(s), s.rank),
        "ads": lambda s: (-(s.meta_ads + s.tiktok_ads), s.rank),
        "recent": lambda s: (-s.first_seen_at.timestamp(), s.rank),
    }
    items.sort(key=sorters[sort])
    return SitePage(total=len(items), items=items[offset:offset + limit],
                    enabled=bool(get_settings().cloudflare_api_token))

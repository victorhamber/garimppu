"""Offers: ads grouped by what they sell (checkout product, store product, app, site).

score = 2.5*log(advertisers) + log(1+ads) + 0.5*log(1+creatives) + min(days,90)/90 + 0.75*other platforms
Several advertisers on the same offer weighs most: it means affiliates/resellers are scaling it.
Other platforms: the offer also shows up in TikTok top ads, YouTube videos and/or a collected sites ranking
(Cloudflare Radar), money and traffic flowing on more than one front.
"""

import math
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.auth import current_user
from app.collectors.radar import RANKINGS as SITE_RANKINGS
from app.collectors.radar import parse_term as parse_site_term
from app.config import get_settings
from app.db import get_db
from app.models import Ad, CollectionOffer, Creative, Page, Source, SourceAd, SourceSite, TikTokAd, User, Video
from app.csv_export import EXPORT_LIMIT, csv_response
from app.pipeline.heat import HOT_SHARE, MIN_DAYS_ACTIVE, WARM_SHARE, metric_cutoffs, rank_cutoff
from app.pipeline.offers import offer_label
from app.pipeline.scoring import MAX_LONGEVITY_DAYS, count_duplicates, days_running
from app.pipeline.sources import user_search_source, user_source_ids
from app.routes.collections import user_collection_ids
from app.schemas import OfferAdvertiser, OfferOut, OfferPage, OfferPreview, ScoreHeat
from app.serializers import media_path

router = APIRouter(prefix="/api/offers", tags=["offers"])

OfferKind = Literal["infoproduto", "loja", "app", "conversa", "site"]
OfferSort = Literal["score", "platforms", "advertisers", "ads", "creatives", "days_active", "recent"]
MAX_PREVIEWS = 4
MAX_ADVERTISERS = 3
PLATFORM_BONUS = 0.75


def offer_score(advertisers: int, ads: int, creatives: int, days: int) -> float:
    """Meta part of the score; the other-platforms bonus is added once TikTok/YouTube counts are known."""
    return round(
        2.5 * math.log(max(advertisers, 1))
        + math.log1p(ads)
        + 0.5 * math.log1p(creatives)
        + min(days, MAX_LONGEVITY_DAYS) / MAX_LONGEVITY_DAYS,
        4,
    )


def _cross_platform_counts(db: Session, keys: list[str]) -> tuple[dict[str, int], dict[str, int]]:
    """YouTube videos and TikTok top ads pointing at each offer."""
    if not keys:
        return {}, {}
    videos = dict(db.execute(
        select(Video.offer_key, func.count()).where(Video.offer_key.in_(keys)).group_by(Video.offer_key)).all())
    tiktok = dict(db.execute(
        select(TikTokAd.offer_key, func.count()).where(TikTokAd.offer_key.in_(keys)).group_by(TikTokAd.offer_key)).all())
    return videos, tiktok


def _site_candidates(offer_key: str) -> list[str]:
    """The offer's host and its parent domains: an offer on loja.exemplo.com.br matches exemplo.com.br."""
    host = offer_key.split("/")[0]
    if ":" in host or "." not in host:
        return []
    parts = host.split(".")
    return [".".join(parts[i:]) for i in range(len(parts) - 1)]


def _site_ranks(db: Session, offers: list[OfferOut]) -> dict[str, tuple[int, str]]:
    """Best collected Radar position per offer key, with the ranking's label."""
    wanted = {o.key: _site_candidates(o.key) for o in offers if o.kind in ("site", "loja")}
    domains = {d for ds in wanted.values() for d in ds}
    if not domains:
        return {}
    best: dict[str, tuple[int, str]] = {}
    rows = db.execute(select(SourceSite.domain, SourceSite.rank, Source.term)
                      .join(Source, Source.id == SourceSite.source_id).where(SourceSite.domain.in_(domains)))
    for domain, rank, term in rows:
        if domain not in best or rank < best[domain][0]:
            ranking, _ = parse_site_term(term)
            best[domain] = (rank, SITE_RANKINGS.get(ranking, ranking))
    found: dict[str, tuple[int, str]] = {}
    for key, candidates in wanted.items():
        hits = [best[d] for d in candidates if d in best]
        if hits:
            found[key] = min(hits)
    return found


def _creative_rank(creative: Creative) -> float:
    return creative.score.score if creative.score else 0.0


def _build_offer(key: str, ads: list[Ad], today: date) -> OfferOut:
    pages: Counter[str] = Counter(a.page_id for a in ads if a.page_id)
    names = {a.page_id: a.page.name for a in ads if a.page}
    creatives = {c.id: c for a in ads for c in a.creatives}
    top_page = names.get(pages.most_common(1)[0][0]) if pages else None
    first = ads[0]
    days = days_running(ads, today)
    previews = sorted(creatives.values(), key=_creative_rank, reverse=True)[:MAX_PREVIEWS]
    ad_by_creative = {c.id: a for a in ads for c in a.creatives}
    duplicates = count_duplicates(ads)
    url = Counter(a.link_url for a in ads if a.link_url).most_common(1)
    return OfferOut(
        key=key,
        label=offer_label(key, first.offer_kind or "site", first.offer_platform, top_page),
        kind=first.offer_kind or "site",
        platform=first.offer_platform,
        url=url[0][0] if url else None,
        score=offer_score(len(pages), duplicates, len(creatives), days),
        advertisers=len(pages),
        ads=duplicates,
        creatives=len(creatives),
        days_active=days,
        first_seen_at=min(a.first_seen_at for a in ads),
        top_advertisers=[
            OfferAdvertiser(page_id=pid, name=names.get(pid), ads=n) for pid, n in pages.most_common(MAX_ADVERTISERS)
        ],
        previews=[
            OfferPreview(
                creative_id=c.id,
                media_type=c.media_type,
                image=media_path(c.local_path, c.thumbnail_url),
                text=ad_by_creative[c.id].body or ad_by_creative[c.id].title,
            )
            for c in previews
        ],
    )


SORT_KEYS = {
    "score": lambda o: o.score,
    "platforms": lambda o: (o.platforms, o.score),
    "advertisers": lambda o: (o.advertisers, o.score),
    "ads": lambda o: (o.ads, o.score),
    "creatives": lambda o: (o.creatives, o.score),
    "days_active": lambda o: (o.days_active, o.score),
    "recent": lambda o: o.first_seen_at,
}


@router.get("", response_model=OfferPage)
def list_offers(
    q: str | None = None,
    key: str | None = Query(None, description="Uma oferta exata (offer_key)"),
    kind: OfferKind | None = None,
    exclude_kind: list[OfferKind] = Query([]),
    platform: str | None = None,
    search_id: int | None = None,
    collection_id: int | None = None,
    min_advertisers: int | None = Query(None, ge=0),
    min_ads: int | None = Query(None, ge=0),
    multi_platform: bool = Query(False, description="Só ofertas que também aparecem no TikTok, no YouTube ou num ranking de sites"),
    active_only: bool = True,
    include_brands: bool = Query(False, description="Inclui páginas de marcas grandes, que afiliados não promovem"),
    scope: Literal["mine", "all"] = Query("mine", description="mine = só anúncios das buscas do usuário"),
    sort: OfferSort = "score",
    limit: int = Query(30, ge=1, le=EXPORT_LIMIT),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    stmt = select(Ad).where(Ad.offer_key.is_not(None)).options(
        selectinload(Ad.page), selectinload(Ad.creatives).selectinload(Creative.score)
    )
    if active_only:
        cutoff = datetime.now(timezone.utc) - timedelta(days=get_settings().stale_ad_days)
        stmt = stmt.where(Ad.is_active.is_(True), Ad.last_seen_at >= cutoff)
    if key:
        stmt = stmt.where(Ad.offer_key == key)
    if kind:
        stmt = stmt.where(Ad.offer_kind == kind)
    if exclude_kind:
        stmt = stmt.where(Ad.offer_kind.not_in(exclude_kind))
    if platform:
        stmt = stmt.where(Ad.offer_platform == platform)
    if search_id:
        source_id = user_search_source(user.id, search_id)
        stmt = stmt.where(Ad.ad_archive_id.in_(select(SourceAd.ad_archive_id).where(SourceAd.source_id == source_id)))
    elif scope == "mine" and not (key or collection_id):
        stmt = stmt.where(Ad.ad_archive_id.in_(
            select(SourceAd.ad_archive_id).where(SourceAd.source_id.in_(user_source_ids(user.id)))
        ))
    if collection_id:
        stmt = stmt.where(Ad.offer_key.in_(
            select(CollectionOffer.offer_key).where(
                CollectionOffer.collection_id == collection_id,
                CollectionOffer.collection_id.in_(user_collection_ids(user)),
            )
        ))
    if q:
        like = f"%{q.strip()}%"
        page_ids = select(Page.page_id).where(Page.name.ilike(like))
        matching = select(Ad.offer_key).where(
            or_(Ad.offer_key.ilike(like), Ad.link_url.ilike(like), Ad.body.ilike(like),
                Ad.title.ilike(like), Ad.page_id.in_(page_ids))
        )
        stmt = stmt.where(Ad.offer_key.in_(matching))

    hide_brands = not (include_brands or key or collection_id)
    groups: dict[str, list[Ad]] = {}
    brand_keys: set[str] = set()
    for ad in db.scalars(stmt):
        if hide_brands and ad.page and ad.page.big_brand:
            brand_keys.add(ad.offer_key)
            continue
        groups.setdefault(ad.offer_key, []).append(ad)

    today = date.today()
    offers = [_build_offer(key, ads, today) for key, ads in groups.items()]
    videos, tiktok = _cross_platform_counts(db, list(groups))
    site_ranks = _site_ranks(db, offers)
    for offer in offers:
        offer.videos = videos.get(offer.key, 0)
        offer.tiktok_ads = tiktok.get(offer.key, 0)
        if offer.key in site_ranks:
            offer.site_rank, offer.site_ranking = site_ranks[offer.key]
        offer.platforms = 1 + (offer.videos > 0) + (offer.tiktok_ads > 0) + (offer.site_rank is not None)
        if offer.platforms > 1:
            offer.score = round(offer.score + PLATFORM_BONUS * (offer.platforms - 1), 4)
    if multi_platform:
        offers = [o for o in offers if o.platforms > 1]
    if min_advertisers is not None:
        offers = [o for o in offers if o.advertisers >= min_advertisers]
    if min_ads is not None:
        offers = [o for o in offers if o.ads >= min_ads]
    offers.sort(key=SORT_KEYS[sort], reverse=True)

    platforms = sorted(p for p in db.scalars(select(Ad.offer_platform).distinct()) if p)
    page = offers[offset:offset + limit]
    by_key = {o.key: o for o in page}
    saved = db.execute(
        select(CollectionOffer.offer_key, CollectionOffer.collection_id).where(
            CollectionOffer.offer_key.in_(by_key), CollectionOffer.collection_id.in_(user_collection_ids(user))
        )
    )
    for offer_key, cid in saved:
        by_key[offer_key].collection_ids.append(cid)
    return OfferPage(total=len(offers), items=page, platforms=platforms, heat=offer_heat(offers),
                     hidden_brands=len(brand_keys - groups.keys()))


def offer_heat(rows) -> ScoreHeat:
    """Score and metric cutoffs for offers or sites (same four counts; sites swap creatives for products)."""
    scores = [r.score for r in rows]
    columns = {name: [getattr(r, name) for r in rows]
               for name in ("advertisers", "ads", "creatives", "products", "days_active") if rows and hasattr(rows[0], name)}
    return ScoreHeat(
        hot=rank_cutoff(scores, HOT_SHARE),
        warm=rank_cutoff(scores, WARM_SHARE),
        metrics=metric_cutoffs(columns, {"advertisers": 2, "ads": 2, "creatives": 2, "products": 2,
                                         "days_active": MIN_DAYS_ACTIVE}),
    )


OFFER_CSV = ["oferta", "chave", "tipo", "plataforma", "url", "score", "anunciantes", "anuncios", "criativos",
             "dias_no_ar", "videos_youtube", "anuncios_tiktok", "principais_anunciantes", "primeira_vez"]


@router.get("/export.csv")
def export_offers(page: OfferPage = Depends(list_offers)):
    return csv_response("ofertas.csv", OFFER_CSV, (
        [o.label, o.key, o.kind, o.platform, o.url, o.score, o.advertisers, o.ads, o.creatives, o.days_active,
         o.videos, o.tiktok_ads, ", ".join(a.name or a.page_id for a in o.top_advertisers),
         o.first_seen_at.date().isoformat()]
        for o in page.items
    ))

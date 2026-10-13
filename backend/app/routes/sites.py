"""Sales sites: the advertisers' own domains behind the collected ads, grouped by site and niche.

An offer on a site ("site") or a store product ("loja", "host/produto") belongs to the site's host.
Checkout platforms, marketplaces, apps and chat links are not the advertiser's site and are left out.
Score: same formula as offers, on the whole site (all of its products together).
"""

from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth import current_user
from app.config import get_settings
from app.db import get_db
from app.models import Ad, Creative, SourceAd, TikTokAd, User, Video
from app.csv_export import EXPORT_LIMIT, csv_response
from app.pipeline.niche import NICHES
from app.pipeline.scoring import count_duplicates, days_running
from app.pipeline.sources import SCOPE_HELP, resolve_scope, user_search_source, user_source_ids
from app.routes.collections import collections_by_ref, saved_refs
from app.routes.offers import offer_heat, offer_score
from app.schemas import OfferAdvertiser, OfferPreview, SiteOut, SitePage
from app.serializers import media_path

router = APIRouter(prefix="/api/sites", tags=["sites"])

SiteSort = Literal["score", "advertisers", "ads", "products", "days_active", "recent"]
SITE_KINDS = ("site", "loja")
# Link hubs, shorteners and social/content hosts: never the advertiser's sales site.
NOT_SALES_SITES = (
    "linktr.ee", "bit.ly", "beacons.ai", "linkin.bio", "tinyurl.com", "google.com", "forms.gle", "youtube.com",
    "youtu.be", "tiktok.com", "t.me", "telegram.me", "x.com", "twitter.com", "linkedin.com", "pinterest.com",
    "threads.net", "spotify.com", "canva.site", "wix.com", "blogspot.com",
)
MAX_PREVIEWS = 4
MAX_ADVERTISERS = 3


def site_domain(offer_key: str | None) -> str | None:
    if not offer_key or ":" in offer_key:
        return None
    host = offer_key.split("/")[0]
    if "." not in host or any(host == h or host.endswith("." + h) for h in NOT_SALES_SITES):
        return None
    return host


def _other_platforms(db: Session, domains: set[str]) -> tuple[Counter[str], Counter[str]]:
    """TikTok top ads and YouTube videos pointing at each site."""
    tiktok: Counter[str] = Counter()
    videos: Counter[str] = Counter()
    for model, counts in ((TikTokAd, tiktok), (Video, videos)):
        for key in db.scalars(select(model.offer_key).where(model.offer_key.is_not(None), model.offer_kind.in_(SITE_KINDS))):
            domain = site_domain(key)
            if domain in domains:
                counts[domain] += 1
    return tiktok, videos


def _creative_rank(creative: Creative) -> float:
    return creative.score.score if creative.score else 0.0


def _build_site(domain: str, ads: list[Ad], today: date) -> SiteOut:
    pages: Counter[str] = Counter(a.page_id for a in ads if a.page_id)
    names = {a.page_id: a.page.name for a in ads if a.page}
    creatives = {c.id: c for a in ads for c in a.creatives}
    niches = Counter(c.niche for c in creatives.values() if c.niche)
    platforms = Counter(a.offer_platform for a in ads if a.offer_platform)
    previews = sorted(creatives.values(), key=_creative_rank, reverse=True)[:MAX_PREVIEWS]
    ad_by_creative = {c.id: a for a in ads for c in a.creatives}
    duplicates = count_duplicates(ads)
    days = days_running(ads, today)
    url = Counter(a.link_url for a in ads if a.link_url).most_common(1)
    return SiteOut(
        domain=domain,
        url=url[0][0] if url else f"https://{domain}",
        niche=niches.most_common(1)[0][0] if niches else None,
        platform=platforms.most_common(1)[0][0] if platforms else None,
        score=offer_score(len(pages), duplicates, len(creatives), days),
        advertisers=len(pages),
        ads=duplicates,
        creatives=len(creatives),
        products=len({a.offer_key for a in ads}),
        days_active=days,
        first_seen_at=min(a.first_seen_at for a in ads),
        last_seen_at=max(a.last_seen_at for a in ads),
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
    "score": lambda s: s.score,
    "advertisers": lambda s: (s.advertisers, s.score),
    "ads": lambda s: (s.ads, s.score),
    "products": lambda s: (s.products, s.score),
    "days_active": lambda s: (s.days_active, s.score),
    "recent": lambda s: s.first_seen_at,
}


@router.get("", response_model=SitePage)
def list_sites(
    q: str | None = None,
    niche: str | None = None,
    search_id: int | None = None,
    collection_id: int | None = None,
    scope: Literal["mine", "all"] | None = Query(None, description=SCOPE_HELP),
    active_only: bool = True,
    include_brands: bool = Query(False, description="Inclui páginas de marcas grandes"),
    sort: SiteSort = "score",
    limit: int = Query(30, ge=1, le=EXPORT_LIMIT),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    scope = resolve_scope(db, user.id, scope)
    stmt = select(Ad).where(Ad.offer_kind.in_(SITE_KINDS), Ad.offer_key.is_not(None)).options(
        selectinload(Ad.page), selectinload(Ad.creatives).selectinload(Creative.score)
    )
    if active_only:
        cutoff = datetime.now(timezone.utc) - timedelta(days=get_settings().stale_ad_days)
        stmt = stmt.where(Ad.is_active.is_(True), Ad.last_seen_at >= cutoff)
    if search_id:
        source_id = user_search_source(user.id, search_id)
        stmt = stmt.where(Ad.ad_archive_id.in_(select(SourceAd.ad_archive_id).where(SourceAd.source_id == source_id)))
    elif scope == "mine" and not collection_id:
        stmt = stmt.where(Ad.ad_archive_id.in_(
            select(SourceAd.ad_archive_id).where(SourceAd.source_id.in_(user_source_ids(user.id)))
        ))
    saved = set(db.scalars(saved_refs(collection_id, "site", user))) if collection_id else None

    groups: dict[str, list[Ad]] = {}
    brand_sites: set[str] = set()
    for ad in db.scalars(stmt):
        domain = site_domain(ad.offer_key)
        if not domain or (saved is not None and domain not in saved):
            continue
        if not (include_brands or collection_id) and ad.page and ad.page.big_brand:
            brand_sites.add(domain)
            continue
        groups.setdefault(domain, []).append(ad)

    today = date.today()
    sites = [_build_site(domain, ads, today) for domain, ads in groups.items()]
    if niche:
        sites = [s for s in sites if s.niche == niche]
    if q:
        needle = q.strip().lower()
        sites = [s for s in sites if needle in s.domain
                 or any(needle in (a.name or "").lower() for a in s.top_advertisers)]

    tiktok, videos = _other_platforms(db, {s.domain for s in sites})
    for site in sites:
        site.tiktok_ads = tiktok.get(site.domain, 0)
        site.videos = videos.get(site.domain, 0)
    sites.sort(key=SORT_KEYS[sort], reverse=True)
    page = sites[offset:offset + limit]
    saved_in = collections_by_ref(db, "site", [s.domain for s in page], user)
    for site in page:
        site.collection_ids = saved_in.get(site.domain, [])
    return SitePage(total=len(sites), items=page, heat=offer_heat(sites),
                    hidden_brands=len(brand_sites - groups.keys()), scope=scope)


SITE_CSV = ["site", "url", "nicho", "plataforma", "score", "anunciantes", "anuncios", "criativos", "produtos",
            "dias_no_ar", "anuncios_tiktok", "videos_youtube", "principais_anunciantes", "primeira_vez", "ultima_vez"]


@router.get("/export.csv")
def export_sites(page: SitePage = Depends(list_sites)):
    return csv_response("sites-de-venda.csv", SITE_CSV, (
        [s.domain, s.url, NICHES.get(s.niche or "", {}).get("label", s.niche), s.platform, s.score, s.advertisers,
         s.ads, s.creatives, s.products, s.days_active, s.tiktok_ads, s.videos,
         ", ".join(a.name or a.page_id for a in s.top_advertisers),
         s.first_seen_at.date().isoformat(), s.last_seen_at.date().isoformat()]
        for s in page.items
    ))

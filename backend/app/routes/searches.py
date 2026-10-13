import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import current_user
from app.collectors.radar import CATEGORIES as SITE_CATEGORIES, MAX_LIMIT as SITE_MAX, RANKINGS as SITE_RANKINGS
from app.collectors.radar import source_term as site_source_term
from app.collectors.tiktok_ads import INDUSTRIES as TIKTOK_INDUSTRIES, PREFIX as TIKTOK_PREFIX
from app.collectors.youtube import NICHE_PREFIX
from app.config import get_settings
from app.db import get_db
from app.jobs import enqueue_source
from app.models import AdCreative, Page, Run, Search, SourceAd, SourceSite, SourceTikTokAd, SourceVideo, User
from app.pipeline.niche import NICHES
from app.pipeline.sources import find_or_create_source, is_fresh, sync_source
from app.schemas import RunOut, SearchCreate, SearchOut, SearchUpdate

router = APIRouter(prefix="/api", tags=["searches"])


def _search_out(db: Session, search: Search, reused: bool = False) -> SearchOut:
    source = search.source
    latest = db.scalar(select(Run).where(Run.source_id == source.id).order_by(Run.id.desc()).limit(1))
    if source.collector == "youtube":
        creatives = db.scalar(select(func.count()).select_from(SourceVideo).where(SourceVideo.source_id == source.id))
    elif source.collector == "tiktok":
        creatives = db.scalar(select(func.count()).select_from(SourceTikTokAd).where(SourceTikTokAd.source_id == source.id))
    elif source.collector == "sites":
        creatives = db.scalar(select(func.count()).select_from(SourceSite).where(SourceSite.source_id == source.id))
    else:
        creatives = db.scalar(
            select(func.count(func.distinct(AdCreative.creative_id)))
            .join(SourceAd, SourceAd.ad_archive_id == AdCreative.ad_archive_id)
            .where(SourceAd.source_id == source.id)
        )
    return SearchOut(
        id=search.id,
        term=search.term,
        page_id=source.page_id,
        country=source.country,
        language=source.language,
        media_type=source.media_type,
        niche=search.niche,
        source=source.collector,
        max_ads=search.max_ads,
        refresh_hours=search.refresh_hours,
        is_active=search.is_active,
        last_run_at=source.last_run_at,
        created_at=search.created_at,
        latest_run=RunOut.model_validate(latest) if latest else None,
        creatives_count=creatives or 0,
        monitored_since=source.created_at,
        reused=reused,
    )


def _get_search(db: Session, search_id: int, user: User) -> Search:
    search = db.get(Search, search_id)
    if search is None or search.user_id != user.id:
        raise HTTPException(404, "Busca não encontrada")
    return search


# YouTube region filtering does not restrict language: a "Forex" search in BR otherwise returns Indian streams.
COUNTRY_LANGUAGE = {"BR": "pt", "PT": "pt", "AO": "pt", "MZ": "pt", "US": "en", "GB": "en", "CA": "en", "AU": "en",
                    "ES": "es", "MX": "es", "AR": "es", "CO": "es", "CL": "es", "PE": "es", "FR": "fr", "IT": "it",
                    "DE": "de"}


def _check_niche(niche: str | None) -> None:
    if niche and niche not in NICHES:
        raise HTTPException(422, f"Nicho desconhecido: {niche}")


@router.get("/searches", response_model=list[SearchOut])
def list_searches(db: Session = Depends(get_db), user: User = Depends(current_user)):
    searches = db.scalars(select(Search).where(Search.user_id == user.id).order_by(Search.id.desc()))
    return [_search_out(db, s) for s in searches]


def parse_page_id(value: str) -> str | None:
    value = value.strip()
    if value.isdigit():
        return value
    match = re.search(r"[?&](?:view_all_page_id|id)=(\d+)", value)
    return match.group(1) if match else None


@router.post("/searches", response_model=SearchOut, status_code=201)
def create_search(payload: SearchCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    _check_niche(payload.niche)
    term = " ".join(payload.term.split())
    page_id = None
    source_term = None
    if payload.source == "youtube":
        if not get_settings().youtube_api_key:
            raise HTTPException(503, "Busca no YouTube desativada: falta configurar YOUTUBE_API_KEY no servidor.")
        if not term and not payload.niche:
            raise HTTPException(422, "Informe um tema ou escolha um nicho para buscar no YouTube.")
        if not term:
            source_term = f"{NICHE_PREFIX}{payload.niche}"
            term = f"Nicho: {NICHES[payload.niche]['label']}"
            # The niche is the query itself; filtering results by it again would hide off-label hits.
            payload.niche = None
        payload.page = None
        payload.media_type = "video"
        payload.language = payload.language or COUNTRY_LANGUAGE.get(payload.country.upper())
    if payload.source == "tiktok":
        industry = payload.tiktok_industry
        if industry is not None and industry not in TIKTOK_INDUSTRIES:
            raise HTTPException(422, f"Nicho do TikTok desconhecido: {industry}")
        source_term = f"{TIKTOK_PREFIX}{industry or 'all'}"
        term = f"TikTok Ads: {TIKTOK_INDUSTRIES[industry] if industry else 'todos os nichos'}"
        payload.page = None
        payload.niche = None
        payload.media_type = "video"
        payload.language = payload.language or COUNTRY_LANGUAGE.get(payload.country.upper())
    if payload.source == "sites":
        if not get_settings().cloudflare_api_token:
            raise HTTPException(503, "Busca de sites desativada: falta configurar CLOUDFLARE_API_TOKEN no servidor.")
        category = payload.site_category or None
        if category is not None and category not in SITE_CATEGORIES:
            raise HTTPException(422, f"Categoria de site desconhecida: {category}")
        source_term = site_source_term(payload.site_ranking, category)
        label = SITE_CATEGORIES[category] if category else "todas as categorias"
        term = f"Sites: {label} ({SITE_RANKINGS[payload.site_ranking].lower()})"
        payload.page = None
        payload.niche = None
        payload.language = None
        payload.media_type = "all"
        payload.max_ads = min(payload.max_ads, SITE_MAX)
    if payload.page and payload.page.strip():
        page_id = parse_page_id(payload.page)
        if page_id is None:
            raise HTTPException(
                422,
                "Não encontrei o ID da página nesse link. Abra a página na Biblioteca de Anúncios e cole o link "
                "que contém view_all_page_id=..., ou cole o ID numérico da página.",
            )
        if not term:
            page = db.get(Page, page_id)
            term = (page.name if page and page.name else None) or page_id
    elif not term:
        raise HTTPException(422, "Informe um tema/palavra-chave ou uma página.")

    source, created = find_or_create_source(
        db, term=source_term or term, page_id=page_id, country=payload.country, language=payload.language,
        media_type=payload.media_type, collector=payload.source,
    )
    search = Search(user_id=user.id, source_id=source.id, term=term, niche=payload.niche, max_ads=payload.max_ads,
                    refresh_hours=payload.refresh_hours)
    db.add(search)
    db.flush()
    sync_source(db, source)
    db.commit()

    reused = not created and is_fresh(db, source)
    if payload.run_now and not reused:
        enqueue_source(db, source)
    return _search_out(db, search, reused=reused)


@router.get("/searches/{search_id}", response_model=SearchOut)
def get_search(search_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return _search_out(db, _get_search(db, search_id, user))


@router.patch("/searches/{search_id}", response_model=SearchOut)
def update_search(search_id: int, payload: SearchUpdate, db: Session = Depends(get_db),
                  user: User = Depends(current_user)):
    search = _get_search(db, search_id, user)
    changes = payload.model_dump(exclude_unset=True)
    _check_niche(changes.get("niche"))
    for key, value in changes.items():
        setattr(search, key, value)
    db.flush()
    sync_source(db, search.source)
    db.commit()
    return _search_out(db, search)


@router.delete("/searches/{search_id}", status_code=204)
def delete_search(search_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    search = _get_search(db, search_id, user)
    source = search.source
    db.delete(search)
    db.flush()
    sync_source(db, source)
    db.commit()


@router.post("/searches/{search_id}/run", response_model=RunOut)
def run_search_now(search_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    source = _get_search(db, search_id, user).source
    if is_fresh(db, source):
        raise HTTPException(429, "Esta busca já foi coletada nas últimas 24h. Os criativos dessa coleta continuam disponíveis.")
    return enqueue_source(db, source)


@router.get("/searches/{search_id}/runs", response_model=list[RunOut])
def list_runs(search_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    source_id = _get_search(db, search_id, user).source_id
    return list(db.scalars(select(Run).where(Run.source_id == source_id).order_by(Run.id.desc()).limit(20)))


@router.get("/runs/{run_id}", response_model=RunOut)
def get_run(run_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    run = db.get(Run, run_id)
    owns = run is not None and db.scalar(
        select(Search.id).where(Search.source_id == run.source_id, Search.user_id == user.id).limit(1)
    )
    if not owns:
        raise HTTPException(404, "Execução não encontrada")
    return run

"""Browser extension. Free with an e-mail (filters and downloads); subscribers also send ads and favorites to the app."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import (
    LoginThrottle,
    access_problem,
    extension_user,
    find_user,
    issue_session,
    login_throttle,
    normalize_email,
    verify_password,
)
from app.collectors.base import SearchQuery
from app.collectors.library_scraper import parse_ad_node, query_from_url
from app.config import get_settings
from app.db import get_db
from app.models import AdCreative, Collection, CollectionItem, ExtensionLead, Run, Search, Source, SourceAd, User, utcnow
from app.pipeline.ingest import ingest_ads
from app.pipeline.sources import find_or_create_source, sync_source
from app.routes.collections import DEFAULT_COLLECTION, ensure_default_collection
from app.schemas import (
    ExtensionAccountOut,
    ExtensionAdsIn,
    ExtensionAdsOut,
    ExtensionFavoriteIn,
    ExtensionFavoriteOut,
    ExtensionLeadIn,
    LoginIn,
)

router = APIRouter(prefix="/api/extension", tags=["extension"])
RUN_TITLE = "Mineração avançada pela extensão"
MAX_LOG_CHARS = 20_000
lead_throttle = LoginThrottle()


def _ip(request: Request) -> str:
    return f"ip:{request.client.host if request.client else '-'}"


def _upgrade_url() -> str:
    settings = get_settings()
    return settings.extension_upgrade_url or settings.app_url


def _touch_lead(db: Session, email: str) -> None:
    lead = db.get(ExtensionLead, email)
    if lead is None:
        db.add(ExtensionLead(email=email))
    else:
        lead.last_seen_at = utcnow()
    db.commit()


@router.post("/lead", response_model=ExtensionAccountOut)
def free_access(payload: ExtensionLeadIn, request: Request, db: Session = Depends(get_db)):
    """Unlocks the free plan. Says nothing about whether the e-mail has an account."""
    if lead_throttle.blocked(_ip(request)):
        raise HTTPException(429, "Muitos pedidos. Aguarde alguns minutos e tente de novo.")
    lead_throttle.fail(_ip(request))
    email = normalize_email(payload.email)
    _touch_lead(db, email)
    return ExtensionAccountOut(email=email, subscriber=False, upgrade_url=_upgrade_url())


@router.post("/login", response_model=ExtensionAccountOut)
def subscriber_login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    keys = (_ip(request), f"email:{email}")
    if login_throttle.blocked(*keys):
        raise HTTPException(429, "Muitas tentativas de login. Aguarde alguns minutos e tente de novo.")
    user = find_user(db, email)
    if user is None or not verify_password(payload.password, user.password_hash):
        login_throttle.fail(*keys)
        raise HTTPException(401, "E-mail ou senha incorretos.")
    problem = access_problem(user)
    if problem:
        raise HTTPException(403, f"{problem} Renove para enviar ao app; sem senha a extensão segue no plano grátis.")
    login_throttle.clear(f"email:{email}")
    _touch_lead(db, email)
    return ExtensionAccountOut(email=user.email, name=user.name, subscriber=True, token=issue_session(db, user),
                               upgrade_url=_upgrade_url())


@router.get("/me", response_model=ExtensionAccountOut)
def whoami(db: Session = Depends(get_db), user: User = Depends(extension_user)):
    _touch_lead(db, user.email)
    return ExtensionAccountOut(email=user.email, name=user.name, subscriber=True, upgrade_url=_upgrade_url())


def _source_for(db: Session, query: SearchQuery, term: str) -> Source:
    source, _ = find_or_create_source(db, term=term, page_id=query.page_id, country=query.country,
                                      language=query.language, media_type=query.media_type, collector="hybrid")
    return source


def _user_search(db: Session, user: User, source: Source, term: str) -> Search:
    search = db.scalar(select(Search).where(Search.user_id == user.id, Search.source_id == source.id).limit(1))
    if search is None:
        search = Search(user_id=user.id, source_id=source.id, term=term)
        db.add(search)
        db.flush()
        sync_source(db, source)
    return search


def _session_run(db: Session, source_id: int, run_id: int | None) -> Run:
    run = db.get(Run, run_id) if run_id else None
    if run is None or run.source_id != source_id or not (run.log or "").startswith(RUN_TITLE):
        run = Run(source_id=source_id, status="done", started_at=utcnow(), ads_found=0, creatives_found=0,
                  log=RUN_TITLE)
        db.add(run)
        db.flush()
    return run


def _query(url: str) -> SearchQuery:
    query = query_from_url(url)
    if query is None:
        raise HTTPException(422, "Abra uma busca por palavra-chave ou página na Biblioteca de Anúncios.")
    return query


@router.post("/ads", response_model=ExtensionAdsOut)
def receive_ads(payload: ExtensionAdsIn, db: Session = Depends(get_db), user: User = Depends(extension_user)):
    query = _query(payload.url)
    ads = {ad.ad_archive_id: ad for ad in (parse_ad_node(node) for node in payload.nodes) if ad}
    if query.page_id:
        ads = {key: ad for key, ad in ads.items() if ad.page_id == query.page_id}
        term = next((ad.page_name for ad in ads.values() if ad.page_name), None) or query.page_id
    else:
        term = query.term

    source = _source_for(db, query, term)
    search = _user_search(db, user, source, term)
    run = _session_run(db, source.id, payload.run_id)
    known = set(db.scalars(select(SourceAd.ad_archive_id).where(
        SourceAd.source_id == source.id, SourceAd.ad_archive_id.in_(list(ads)),
    ))) if ads else set()
    new = len(ads) - len(known)
    db.commit()

    if ads:
        _, creative_ids = ingest_ads(db, source, list(ads.values()), log=lambda _: None)
        run.ads_found += len(ads)
        run.creatives_found += len(creative_ids)
        lines = f"{run.log.removeprefix(RUN_TITLE)}\n{datetime.now():%H:%M:%S} +{len(ads)} anúncios ({new} novos)"
        run.log = RUN_TITLE + lines[-MAX_LOG_CHARS:]
    run.finished_at = source.last_run_at = utcnow()
    db.commit()

    total = db.scalar(select(func.count()).select_from(SourceAd).where(SourceAd.source_id == source.id)) or 0
    return ExtensionAdsOut(run_id=run.id, search_id=search.id, term=search.term, received=len(ads), new=new,
                           total=total)


@router.post("/favorite", response_model=ExtensionFavoriteOut)
def favorite(payload: ExtensionFavoriteIn, db: Session = Depends(get_db), user: User = Depends(extension_user)):
    """Saves one Ad Library ad straight into the user's Favoritos, collecting it first if needed."""
    query = _query(payload.url)
    ad = parse_ad_node(payload.node)
    if ad is None:
        raise HTTPException(422, "Não reconheci esse anúncio. Role a página um pouco e tente de novo.")
    term = (ad.page_name or query.page_id) if query.page_id else query.term
    source = _source_for(db, query, term)
    _user_search(db, user, source, term)
    db.commit()
    ingest_ads(db, source, [ad], log=lambda _: None)

    creative_id = db.scalar(select(AdCreative.creative_id).where(AdCreative.ad_archive_id == ad.ad_archive_id).limit(1))
    if creative_id is None:
        raise HTTPException(422, "Não consegui salvar o criativo desse anúncio.")
    ensure_default_collection(db, user)
    collection_id = db.scalar(select(Collection.id).where(Collection.user_id == user.id,
                                                          Collection.name == DEFAULT_COLLECTION))
    if db.get(CollectionItem, (collection_id, creative_id)) is None:
        db.add(CollectionItem(collection_id=collection_id, creative_id=creative_id))
    db.commit()
    return ExtensionFavoriteOut(creative_id=creative_id, collection_id=collection_id)

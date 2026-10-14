"""Browser extension. Free with an e-mail (filters and downloads); subscribers also send ads and favorites to the app.

Besides the Ad Library it works on YouTube searches and on TikTok's Creative Center, sending what the user's own
browser loads: YouTube video ids (statistics then cost ~2 API units per 50 instead of 100 per search page) and
Top Ads listings with their details.
"""

import re
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
from app.collectors.tiktok_ads import INDUSTRIES, KEYWORD_PREFIX, PREFIX, industry_from_param, parse_material
from app.collectors.youtube import YouTubeError, fetch_videos
from app.config import get_settings
from app.db import get_db
from app.models import (
    AdCreative,
    Collection,
    CollectionItem,
    CollectionRef,
    ExtensionLead,
    Run,
    Search,
    Source,
    SourceAd,
    SourceTikTokAd,
    SourceVideo,
    TikTokAd,
    User,
    Video,
    utcnow,
)
from app.pipeline.ingest import ingest_ads
from app.pipeline.sources import find_or_create_source, sync_source
from app.pipeline.tiktok_ingest import apply_details, ingest_tiktok_ads, known_ids, score_tiktok_ad
from app.pipeline.video_ingest import ingest_videos
from app.routes.collections import DEFAULT_COLLECTION, _ref_exists, ensure_default_collection
from app.routes.searches import COUNTRY_LANGUAGE
from app.schemas import (
    ExtensionAccountOut,
    ExtensionAdsIn,
    ExtensionAdsOut,
    ExtensionCollectOut,
    ExtensionFavoriteIn,
    ExtensionFavoriteOut,
    ExtensionLeadIn,
    ExtensionSaveIn,
    ExtensionTikTokDetailsIn,
    ExtensionTikTokIn,
    ExtensionYouTubeIn,
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


def _record(run: Run, source: Source, received: int, new: int, unit: str, creatives: int) -> None:
    run.ads_found += received
    run.creatives_found += creatives
    lines = f"{run.log.removeprefix(RUN_TITLE)}\n{datetime.now():%H:%M:%S} +{received} {unit} ({new} novos)"
    run.log = RUN_TITLE + lines[-MAX_LOG_CHARS:]
    run.finished_at = source.last_run_at = utcnow()


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
        _record(run, source, len(ads), new, "anúncios", len(creative_ids))
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


@router.post("/save", response_model=ExtensionFavoriteOut)
def save_ref(payload: ExtensionSaveIn, db: Session = Depends(get_db), user: User = Depends(extension_user)):
    """Puts a YouTube video or a TikTok ad the extension already sent into Favoritos."""
    if not _ref_exists(db, payload.kind, payload.ref):
        raise HTTPException(404, "Envie o item para o Garimppu antes de favoritar.")
    ensure_default_collection(db, user)
    collection_id = db.scalar(select(Collection.id).where(Collection.user_id == user.id,
                                                          Collection.name == DEFAULT_COLLECTION))
    if db.get(CollectionRef, (collection_id, payload.kind, payload.ref)) is None:
        db.add(CollectionRef(collection_id=collection_id, kind=payload.kind, ref=payload.ref))
    db.commit()
    return ExtensionFavoriteOut(creative_id=0, collection_id=collection_id)


_VIDEO_ID = re.compile(r"[\w-]{11}")


@router.post("/youtube", response_model=ExtensionCollectOut)
def receive_videos(payload: ExtensionYouTubeIn, db: Session = Depends(get_db), user: User = Depends(extension_user)):
    api_key = get_settings().youtube_api_key
    if not api_key:
        raise HTTPException(503, "O YouTube ainda não está configurado no Garimppu.")
    term = " ".join(payload.term.split())
    country = payload.country.upper()
    language = COUNTRY_LANGUAGE.get(country)
    source, _ = find_or_create_source(db, term=term, page_id=None, country=country, language=language,
                                      media_type="video", collector="youtube")
    search = _user_search(db, user, source, term)
    run = _session_run(db, source.id, payload.run_id)
    db.commit()

    ids = list(dict.fromkeys(i for i in payload.ids if _VIDEO_ID.fullmatch(i)))
    try:
        videos = fetch_videos(ids, language=language, api_key=api_key) if ids else []
    except YouTubeError as exc:
        raise HTTPException(502, str(exc))
    received, new = ingest_videos(db, source, videos, log=lambda _: None, prune=False) if videos else (0, 0)
    _record(run, source, received, new, "vídeos", new)
    db.commit()

    total = db.scalar(select(func.count()).select_from(SourceVideo).where(SourceVideo.source_id == source.id)) or 0
    rows = list(db.scalars(select(Video).where(Video.id.in_([f"youtube:{i}" for i in ids]))))
    notas = {v.external_id: v.score for v in rows}
    stats = {v.external_id: {"likes": v.likes, "comments": v.comments} for v in rows}
    return ExtensionCollectOut(run_id=run.id, search_id=search.id, term=search.term, received=received, new=new,
                               total=total, notas=notas, stats=stats)


@router.post("/tiktok", response_model=ExtensionCollectOut)
def receive_tiktok(payload: ExtensionTikTokIn, db: Session = Depends(get_db), user: User = Depends(extension_user)):
    country = payload.country.upper()
    keyword = " ".join((payload.keyword or "").split()) or None
    industry = None if keyword else industry_from_param(payload.industry)
    if keyword:
        source_term, term = f"{KEYWORD_PREFIX}{keyword}", f'TikTok Ads: "{keyword}"'
    else:
        source_term = f"{PREFIX}{industry or 'all'}"
        term = f"TikTok Ads: {INDUSTRIES[industry] if industry else 'todos os nichos'}"
    source, _ = find_or_create_source(db, term=source_term, page_id=None, country=country,
                                      language=COUNTRY_LANGUAGE.get(country), media_type="video", collector="tiktok")
    search = _user_search(db, user, source, term)
    run = _session_run(db, source.id, payload.run_id)
    db.commit()

    ads = {}
    for item in payload.materials:
        try:
            ad = parse_material(item)
        except (KeyError, TypeError, ValueError):
            continue
        ads[ad.id] = ad
    received, new = ingest_tiktok_ads(db, source, list(ads.values()), log=lambda _: None, prune=False) if ads else (0, 0)
    _record(run, source, received, new, "anúncios do TikTok", new)
    db.commit()

    total = db.scalar(select(func.count()).select_from(SourceTikTokAd).where(SourceTikTokAd.source_id == source.id)) or 0
    detailed = known_ids(db, list(ads))
    rows = list(db.scalars(select(TikTokAd).where(TikTokAd.id.in_(list(ads)))))
    notas = {ad.id: ad.score for ad in rows}
    stats = {
        ad.id: {"likes": ad.likes, "comments": ad.comments, "shares": ad.shares, "ctr": ad.ctr_rank}
        for ad in rows
    }
    return ExtensionCollectOut(run_id=run.id, search_id=search.id, term=search.term, received=received, new=new,
                               total=total, notas=notas, stats=stats, need_detail=[i for i in ads if i not in detailed])


@router.post("/tiktok/details", response_model=dict[str, float])
def receive_tiktok_details(payload: ExtensionTikTokDetailsIn, db: Session = Depends(get_db),
                           user: User = Depends(extension_user)):
    """Comments, shares and landing page the Creative Center page fetched for ads the app had without them."""
    by_id = {d.id: d for d in payload.details}
    notas = {}
    for ad in db.scalars(select(TikTokAd).where(TikTokAd.id.in_(list(by_id)))):
        detail = by_id[ad.id]
        apply_details(ad, detail.comment, detail.share, detail.landing_page)
        score_tiktok_ad(ad)
        notas[ad.id] = ad.score
    db.commit()
    return notas

"""Advanced mining: the browser extension sends the ads the user scrolls through on the Ad Library."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import current_user, extension_user, new_extension_token
from app.collectors.library_scraper import parse_ad_node, query_from_url
from app.db import get_db
from app.models import ExtensionToken, Run, Search, SourceAd, User, utcnow
from app.pipeline.ingest import ingest_ads
from app.pipeline.sources import find_or_create_source, sync_source
from app.schemas import ExtensionAdsIn, ExtensionAdsOut, ExtensionTokenOut

router = APIRouter(prefix="/api/extension", tags=["extension"])
RUN_TITLE = "Mineração avançada pela extensão"
MAX_LOG_CHARS = 20_000


@router.get("/token", response_model=ExtensionTokenOut)
def token_status(db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.scalar(select(ExtensionToken).where(ExtensionToken.user_id == user.id))
    return ExtensionTokenOut(created_at=row.created_at, last_used_at=row.last_used_at) if row else ExtensionTokenOut()


@router.post("/token", response_model=ExtensionTokenOut)
def create_token(db: Session = Depends(get_db), user: User = Depends(current_user)):
    token = new_extension_token(db, user)
    return ExtensionTokenOut(token=token, created_at=utcnow())


@router.get("/me")
def whoami(user: User = Depends(extension_user)):
    return {"email": user.email, "name": user.name}


def _user_search(db: Session, user: User, source, term: str) -> Search:
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


@router.post("/ads", response_model=ExtensionAdsOut)
def receive_ads(payload: ExtensionAdsIn, db: Session = Depends(get_db), user: User = Depends(extension_user)):
    query = query_from_url(payload.url)
    if query is None:
        raise HTTPException(422, "Abra uma busca por palavra-chave ou página na Biblioteca de Anúncios.")
    ads = {ad.ad_archive_id: ad for ad in (parse_ad_node(node) for node in payload.nodes) if ad}
    if query.page_id:
        ads = {key: ad for key, ad in ads.items() if ad.page_id == query.page_id}
        name = next((ad.page_name for ad in ads.values() if ad.page_name), None)
        term = name or query.page_id
    else:
        term = query.term

    source, _ = find_or_create_source(db, term=term, page_id=query.page_id, country=query.country,
                                      language=query.language, media_type=query.media_type, collector="hybrid")
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

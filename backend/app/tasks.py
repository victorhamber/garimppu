"""Job bodies. Must stay importable by an RQ worker (no FastAPI dependencies)."""

import asyncio
import logging
import sys
from datetime import datetime, timezone

from sqlalchemy import select

from app.collectors.base import RawAd, SearchQuery
from app.collectors.google_trends import TrendsError, collect_trends
from app.collectors.library_scraper import scrape_library
from app.collectors.official_api import OfficialApiError, fetch_official
from app.collectors.radar import RadarError, collect_sites
from app.collectors.tiktok_ads import TikTokError, collect_tiktok_ads, session_headers
from app.collectors.youtube import YouTubeError, collect_videos
from app.config import get_settings
from app.db import SessionLocal
from app.models import Creative, Run
from app.pipeline.ingest import ingest_ads
from app.pipeline.normalize import merge_sources
from app.pipeline.scoring import recompute_scores
from app.pipeline.site_ingest import ingest_sites
from app.pipeline.sources import last_good_run
from app.pipeline.trends_ingest import ingest_trends
from app.pipeline.tiktok_ingest import ingest_tiktok_ads, known_ids
from app.pipeline.video_ingest import ingest_videos, rescore_videos

logger = logging.getLogger(__name__)
MAX_LOG_CHARS = 20_000


def _run_async(coro):
    # Playwright needs subprocess support, which on Windows only the Proactor loop has.
    if sys.platform == "win32":
        with asyncio.Runner(loop_factory=asyncio.ProactorEventLoop) as runner:
            return runner.run(coro)
    return asyncio.run(coro)


class EmptyCollection(Exception):
    pass


def run_source(run_id: int) -> None:
    db = SessionLocal()
    run = db.get(Run, run_id)
    if run is None:
        db.close()
        return
    source = run.source
    previous = last_good_run(db, source)
    lines: list[str] = []

    def log(message: str) -> None:
        logger.info("[coleta %s] %s", source.id, message)
        lines.append(f"{datetime.now():%H:%M:%S} {message}")
        run.log = "\n".join(lines)[-MAX_LOG_CHARS:]
        db.commit()

    run.status = "running"
    run.started_at = datetime.now(timezone.utc)
    db.commit()

    try:
        if source.collector == "youtube":
            run.ads_found, run.creatives_found = _collect_youtube(db, source, log)
            run.status = "done"
            log(f"Concluído: {run.ads_found} vídeos, {run.creatives_found} novos")
            return
        if source.collector == "tiktok":
            run.ads_found, run.creatives_found = _collect_tiktok(db, source, log)
            run.status = "done"
            log(f"Concluído: {run.ads_found} anúncios do TikTok, {run.creatives_found} novos")
            return
        if source.collector == "trends":
            trends = collect_trends(source.country, log)
            run.ads_found, run.creatives_found = ingest_trends(db, source, trends, log)
            run.status = "done"
            log(f"Concluído: {run.ads_found} buscas em alta, {run.creatives_found} novas")
            return
        if source.collector == "sites":
            run.ads_found, run.creatives_found = _collect_sites(db, source, log)
            run.status = "done"
            log(f"Concluído: {run.ads_found} sites, {run.creatives_found} novos")
            return
        query = SearchQuery(term=source.term, country=source.country, language=source.language,
                            media_type=source.media_type, max_ads=source.max_ads, page_id=source.page_id)
        scraped: list[RawAd] = []
        official: list[RawAd] = []

        if source.collector in ("scraper", "hybrid"):
            try:
                scraped = _run_async(scrape_library(query, log))
            except Exception as exc:
                if source.collector == "scraper":
                    raise
                log(f"Scraper falhou: {exc!r}")

        if source.collector in ("api", "hybrid"):
            if not get_settings().meta_access_token and source.collector == "hybrid":
                log("API oficial ignorada: META_ACCESS_TOKEN não configurado")
            else:
                try:
                    official = fetch_official(query, log)
                except OfficialApiError as exc:
                    if source.collector == "api":
                        raise
                    log(f"API oficial indisponível: {exc}")

        merged = merge_sources(scraped, official)
        if source.page_id:
            merged = [ad for ad in merged if ad.page_id == source.page_id]
            name = next((ad.page_name for ad in merged if ad.page_name), None)
            if name and source.term == source.page_id:
                source.term = name
                for search in source.searches:
                    if search.term == source.page_id:
                        search.term = name
        log(f"{len(merged)} anúncios únicos após mesclar as fontes")

        alert_floor = get_settings().empty_run_alert_min_ads
        if not merged and previous is not None and previous.ads_found >= alert_floor:
            raise EmptyCollection(
                f"Nenhum anúncio retornado, mas a coleta anterior trouxe {previous.ads_found}. "
                "A Biblioteca de Anúncios pode ter mudado de formato ou bloqueado o acesso."
            )
        ads_count, creative_ids = ingest_ads(db, source, merged, log)

        run.ads_found = ads_count
        run.creatives_found = len(creative_ids)
        run.status = "done"
        log(f"Concluído: {ads_count} anúncios, {len(creative_ids)} criativos")
    except (EmptyCollection, YouTubeError, TikTokError, RadarError, TrendsError) as exc:
        db.rollback()
        log(str(exc))
        run.status = "error"
        run.error = str(exc)
    except Exception as exc:
        db.rollback()
        logger.exception("Coleta %s falhou", source.id)
        run.status = "error"
        run.error = repr(exc)[:2000]
    finally:
        run.finished_at = datetime.now(timezone.utc)
        source.last_run_at = run.finished_at
        db.commit()
        db.close()


def _collect_youtube(db, source, log) -> tuple[int, int]:
    settings = get_settings()
    if not settings.youtube_api_key:
        raise YouTubeError("YOUTUBE_API_KEY não configurada no servidor.")
    videos, _ = collect_videos(
        source.term, country=source.country, language=source.language,
        max_results=min(source.max_ads, settings.youtube_max_results),
        window_days=settings.youtube_window_days, api_key=settings.youtube_api_key, log=log,
    )
    return ingest_videos(db, source, videos, log)


def _collect_tiktok(db, source, log) -> tuple[int, int]:
    log("Abrindo o Creative Center do TikTok")
    headers = _run_async(session_headers(source.country))
    ads = collect_tiktok_ads(
        source.term, country=source.country, language=source.language,
        max_results=min(source.max_ads, get_settings().tiktok_max_results),
        known=lambda ids: known_ids(db, ids), log=log, headers=headers,
    )
    return ingest_tiktok_ads(db, source, ads, log)


def _collect_sites(db, source, log) -> tuple[int, int]:
    token = get_settings().cloudflare_api_token
    if not token:
        raise RadarError("CLOUDFLARE_API_TOKEN não configurado no servidor.")
    sites = collect_sites(source.term, country=source.country, max_results=source.max_ads, token=token, log=log)
    return ingest_sites(db, source, sites, log)


def rescore_all() -> int:
    """Daily refresh so longevity/growth stay current even for searches not re-run."""
    db = SessionLocal()
    try:
        ids = list(db.scalars(select(Creative.id)))
        count = recompute_scores(db, ids)
        db.commit()
        return count + rescore_videos(db)
    finally:
        db.close()

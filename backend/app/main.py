import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.auth import current_user, purge_expired_sessions
from app.config import get_settings
from app.create_admin import sync_env_admin
from app.db import SessionLocal
from app.jobs import fail_orphaned_runs
from app.routes import admin, auth, collections, creatives, offers, pages, searches, webhooks

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    with SessionLocal() as db:
        fail_orphaned_runs(db)
        purge_expired_sessions(db)
        sync_env_admin(db)
    scheduler = None
    if settings.enable_scheduler:
        from app.scheduler import start_background_scheduler

        scheduler = start_background_scheduler()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(title="Garimppu", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys([*settings.cors_origins, settings.app_url.rstrip("/")])),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")

app.include_router(auth.router)
app.include_router(webhooks.router)
app.include_router(admin.router)
licensed = [Depends(current_user)]
for router in (searches.router, creatives.router, offers.router, pages.router, collections.router):
    app.include_router(router, dependencies=licensed)


@app.get("/api/health")
def health():
    return {"status": "ok"}

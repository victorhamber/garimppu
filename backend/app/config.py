import logging
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{(BASE_DIR / 'data' / 'miner.db').as_posix()}"
    # Without REDIS_URL, jobs run in a background thread inside the API process.
    redis_url: str | None = None
    media_dir: Path = BASE_DIR / "data" / "media"
    cors_origins: list[str] = ["http://localhost:3000"]

    meta_access_token: str | None = None
    meta_graph_version: str = "v21.0"

    # YouTube Data API v3 key (Google Cloud). The free quota is 10,000 units/day; a search page costs 100.
    youtube_api_key: str | None = None
    youtube_window_days: int = 30  # only videos published this recently are collected
    youtube_max_results: int = 150
    tiktok_max_results: int = 200
    # Cloudflare API token with Account > Radar > Read, for the most visited / rising sites rankings.
    cloudflare_api_token: str | None = None

    scraper_headless: bool = True
    scraper_min_delay: float = 1.5
    scraper_max_delay: float = 3.5
    scraper_max_idle_scrolls: int = 6
    scraper_timeout_seconds: int = 600

    download_videos: bool = False
    max_video_mb: int = 50

    dedupe_hamming_threshold: int = 6
    stale_ad_days: int = 7

    enable_scheduler: bool = True
    scheduler_interval_minutes: int = 15

    # Shared collection: one source per canonical query, refreshed for all of its searches.
    min_refresh_hours: int = 24
    fresh_hours: int = 24  # a new search on a source collected this recently reuses it without a run
    trends_refresh_hours: int = 1  # Google Trends' feed only lists the last few hours of trending searches
    max_runs_per_hour: int = 6  # global budget of Ad Library collections
    empty_run_alert_min_ads: int = 20  # a run returning 0 after one with this many is treated as broken

    # Accounts. In production set COOKIE_SECURE=true and serve app and API under the same site
    # (e.g. app.garimppu.com and api.garimppu.com) so the session cookie travels with API calls.
    app_url: str = "http://localhost:3000"
    # Where the free extension sends people to subscribe; defaults to the app.
    extension_upgrade_url: str | None = None
    api_public_url: str = "http://localhost:8000"
    session_days: int = 30
    cookie_secure: bool = False
    cookie_domain: str | None = None
    # When both are set, the API makes sure this admin exists with this password on every start.
    admin_email: str | None = None
    admin_password: str | None = None
    login_max_attempts: int = 10  # per IP and per e-mail within login_window_minutes
    login_window_minutes: int = 15

    # Purchase webhook (Hotmart, Kiwify, Cakto). Disabled until a secret is set.
    webhook_secret: str | None = None
    # Product/offer IDs that grant a license; empty accepts every product the platform notifies.
    webhook_product_ids: list[str] = []

    # Access e-mails. Without SMTP_HOST, the admin panel shows the temporary password instead.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_tls: bool = True

    @field_validator("database_url")
    @classmethod
    def _psycopg_driver(cls, url: str) -> str:
        # EasyPanel and most hosts hand out postgres:// URLs; SQLAlchemy needs the driver spelled out.
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url.removeprefix(prefix)
        return url


logging.getLogger("httpx").setLevel(logging.WARNING)


@lru_cache
def get_settings() -> Settings:
    return Settings()

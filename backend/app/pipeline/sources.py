"""Canonical identity of an Ad Library query and the settings it inherits from its searches."""

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Run, Search, Source

_QUOTES = str.maketrans({"\u201c": '"', "\u201d": '"', "\u201e": '"', "\u00ab": '"', "\u00bb": '"'})


def normalize_term(term: str) -> str:
    """Case and spacing never change what the Ad Library returns; quotes and accents can."""
    return re.sub(r"\s+", " ", term.translate(_QUOTES)).strip().casefold()


def source_key(*, term: str, page_id: str | None, country: str, language: str | None, media_type: str,
               collector: str = "hybrid") -> str:
    scope = f"{country.upper()}:{(language or '*').lower()}:{media_type}"
    if collector == "youtube":
        return f"yt:{country.upper()}:{(language or '*').lower()}:{normalize_term(term)}"
    if collector == "tiktok":
        return f"tt:{country.upper()}:{(language or '*').lower()}:{normalize_term(term)}"
    if collector == "sites":
        return f"st:{country.upper()}:{term}"
    if page_id:
        return f"page:{scope}:{page_id}"
    return f"kw:{scope}:{normalize_term(term)}"


def find_or_create_source(db: Session, *, term: str, page_id: str | None, country: str,
                          language: str | None, media_type: str, collector: str) -> tuple[Source, bool]:
    key = source_key(term=term, page_id=page_id, country=country, language=language, media_type=media_type,
                     collector=collector)
    source = db.scalar(select(Source).where(Source.key == key))
    if source is not None:
        return source, False
    source = Source(key=key, term=term, page_id=page_id, country=country.upper(), language=language,
                    media_type=media_type, collector=collector)
    db.add(source)
    db.flush()
    return source, True


def user_source_ids(user_id: int):
    """Sources the user subscribes to: what "Minhas buscas" covers."""
    return select(Search.source_id).where(Search.user_id == user_id)


def user_search_source(user_id: int, search_id: int):
    """The source behind one of the user's searches (empty for someone else's search)."""
    return select(Search.source_id).where(Search.id == search_id, Search.user_id == user_id).scalar_subquery()


def following(search: Search) -> bool:
    """A search drives collection only while it is on and its owner's license grants access."""
    return search.is_active and search.user is not None and search.user.has_access


def sync_source(db: Session, source: Source) -> None:
    """Most demanding active search wins: largest max_ads, most frequent refresh (with a floor)."""
    active = [s for s in db.scalars(select(Search).where(Search.source_id == source.id)) if following(s)]
    if active:
        source.max_ads = max(s.max_ads for s in active)
    refreshes = [s.refresh_hours for s in active if s.refresh_hours]
    source.refresh_hours = max(min(refreshes), get_settings().min_refresh_hours) if refreshes else None


def as_utc(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def last_good_run(db: Session, source: Source) -> Run | None:
    return db.scalar(
        select(Run).where(Run.source_id == source.id, Run.status == "done").order_by(Run.id.desc()).limit(1)
    )


def is_fresh(db: Session, source: Source) -> bool:
    run = last_good_run(db, source)
    finished = as_utc(run.finished_at) if run else None
    return finished is not None and datetime.now(timezone.utc) - finished < timedelta(
        hours=get_settings().fresh_hours
    )

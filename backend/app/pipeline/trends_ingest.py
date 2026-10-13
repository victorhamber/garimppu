"""Stores Google Trends trending searches: one row per term and country, a daily traffic snapshot and the niche."""

from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.collectors.google_trends import RawTrend
from app.models import Source, SourceTrend, TrendKeyword, TrendSnapshot, utcnow
from app.pipeline.niche import NicheSignals, classify_signals


def term_key(term: str) -> str:
    return " ".join(term.split()).casefold()[:255]


def trend_niche(term: str, news: list[dict[str, str]]) -> str | None:
    return classify_signals(NicheSignals(texts=[term, *(n.get("title") for n in news)]))


def ingest_trends(db: Session, source: Source, raw_trends: list[RawTrend],
                  log: Callable[[str], None]) -> tuple[int, int]:
    """Returns (terms in this collection, terms never seen before in this country)."""
    now = utcnow()
    today = now.date()
    geo = source.country.upper()
    unique = {term_key(raw.term): raw for raw in raw_trends}
    linked = set(db.scalars(select(SourceTrend.keyword_id).where(SourceTrend.source_id == source.id)))
    new = 0
    seen: list[TrendKeyword] = []
    for key, raw in unique.items():
        keyword = db.scalar(select(TrendKeyword).where(TrendKeyword.geo == geo, TrendKeyword.term_key == key))
        if keyword is None:
            keyword = TrendKeyword(geo=geo, term=raw.term[:255], term_key=key, sightings=0, first_seen_at=now)
            db.add(keyword)
            new += 1
        keyword.term = raw.term[:255]
        keyword.traffic = raw.traffic
        if raw.traffic is not None:
            keyword.peak_traffic = max(keyword.peak_traffic or 0, raw.traffic)
        keyword.sightings = (keyword.sightings or 0) + 1
        keyword.last_seen_at = now
        if raw.news:
            keyword.news = raw.news
        if raw.picture_url:
            keyword.picture_url = raw.picture_url
        keyword.niche = trend_niche(raw.term, keyword.news or []) or keyword.niche
        seen.append(keyword)
    db.flush()

    for keyword in seen:
        snapshot = db.get(TrendSnapshot, (keyword.id, today))
        if snapshot is None:
            db.add(TrendSnapshot(keyword_id=keyword.id, day=today, traffic=keyword.traffic))
        elif keyword.traffic is not None:
            snapshot.traffic = max(snapshot.traffic or 0, keyword.traffic)
        if keyword.id not in linked:
            db.add(SourceTrend(source_id=source.id, keyword_id=keyword.id))
    db.commit()

    with_niche = sum(1 for k in seen if k.niche)
    log(f"{len(seen)} buscas em alta salvas ({new} novas, {with_niche} com nicho identificado)")
    return len(seen), new

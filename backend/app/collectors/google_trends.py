"""Google Trends "trending now": what a country is suddenly searching for, from Google's official public RSS feed.

The feed lists only the latest ~10 trends (the last few hours), each with an approximate search volume ("20000+")
and the news stories behind it, so trends sources are collected every hour and keep their history.
"""

import re
import xml.etree.ElementTree as ET
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from email.utils import parsedate_to_datetime

import httpx

FEED = "https://trends.google.com/trending/rss"
PREFIX = "trends:"
NS = {"ht": "https://trends.google.com/trending/rss"}
MAX_NEWS = 3
USER_AGENT = "Garimppu/1.0 (+https://app.garimppu.com)"


class TrendsError(Exception):
    pass


@dataclass
class RawTrend:
    term: str
    traffic: int | None
    published_at: datetime | None
    picture_url: str | None
    news: list[dict[str, str]] = field(default_factory=list)


def source_term(geo: str) -> str:
    return f"{PREFIX}{geo.upper()}"


def parse_traffic(value: str | None) -> int | None:
    """"20000+", "50K+", "2M+" or "50 mil+" -> 20000, 50000, 2000000, 50000."""
    if not value:
        return None
    text = value.strip().lower().replace(".", "").replace(",", "").rstrip("+").strip()
    match = re.fullmatch(r"(\d+)\s*(k|m|mil|mi)?", text)
    if not match:
        return None
    number = int(match.group(1))
    return number * {"k": 1_000, "mil": 1_000, "m": 1_000_000, "mi": 1_000_000}.get(match.group(2) or "", 1)


def _text(node: ET.Element, path: str) -> str | None:
    found = node.find(path, NS)
    return found.text.strip() if found is not None and found.text and found.text.strip() else None


def parse_feed(xml: bytes | str) -> list[RawTrend]:
    trends: list[RawTrend] = []
    for item in ET.fromstring(xml).iter("item"):
        term = _text(item, "title")
        if not term:
            continue
        published = _text(item, "pubDate")
        news = []
        for story in item.findall("ht:news_item", NS)[:MAX_NEWS]:
            title, url = _text(story, "ht:news_item_title"), _text(story, "ht:news_item_url")
            if title and url:
                news.append({"title": title, "url": url, "source": _text(story, "ht:news_item_source") or ""})
        trends.append(RawTrend(
            term=" ".join(term.split()),
            traffic=parse_traffic(_text(item, "ht:approx_traffic")),
            published_at=parsedate_to_datetime(published) if published else None,
            picture_url=_text(item, "ht:picture"),
            news=news,
        ))
    return trends


def collect_trends(geo: str, log: Callable[[str], None], http: httpx.Client | None = None) -> list[RawTrend]:
    client = http or httpx.Client(timeout=30, headers={"user-agent": USER_AGENT})
    try:
        response = client.get(FEED, params={"geo": geo.upper()})
    except httpx.HTTPError as exc:
        raise TrendsError(f"Não foi possível acessar o Google Trends: {exc}") from exc
    finally:
        if http is None:
            client.close()
    if response.status_code != 200:
        raise TrendsError(f"Google Trends respondeu {response.status_code} para o país {geo.upper()}.")
    try:
        trends = parse_feed(response.content)
    except ET.ParseError as exc:
        raise TrendsError("O feed do Google Trends veio num formato inesperado.") from exc
    log(f"Google Trends ({geo.upper()}): {len(trends)} buscas em alta agora")
    return trends

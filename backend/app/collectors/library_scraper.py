"""Collector for the public Ad Library page (facebook.com/ads/library).

The page loads results through internal GraphQL calls; instead of reading the DOM we
intercept those responses (and the JSON embedded in the first HTML load) and pick any
object that looks like an ad (has ``ad_archive_id`` and ``snapshot``). All knowledge of
Meta's payload shape lives in ``parse_ad_node`` / ``extract_ad_nodes``.
"""

import asyncio
import json
import logging
import random
import re
import time
from collections.abc import Callable, Iterator
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import urlencode

from app.collectors.base import RawAd, SearchQuery
from app.config import get_settings

logger = logging.getLogger(__name__)

LIBRARY_URL = "https://www.facebook.com/ads/library/"
_JSON_SCRIPT_RE = re.compile(r'<script type="application/json"[^>]*>(.*?)</script>', re.S)
_TEMPLATE_RE = re.compile(r"\{\{[^}]*\}\}")
_COOKIE_BUTTONS = [
    "Permitir todos os cookies",
    "Recusar cookies opcionais",
    "Allow all cookies",
    "Decline optional cookies",
    "Only allow essential cookies",
]


def build_search_url(query: SearchQuery) -> str:
    params = {
        "active_status": "active",
        "ad_type": "all",
        "country": query.country.upper(),
        "media_type": query.media_type if query.media_type in {"image", "video"} else "all",
    }
    if query.page_id:
        params["search_type"] = "page"
        params["view_all_page_id"] = query.page_id
    else:
        term = query.term.strip()
        exact = len(term) > 1 and term.startswith('"') and term.endswith('"')
        params["q"] = term.strip('"') if exact else term
        params["search_type"] = "keyword_exact_phrase" if exact else "keyword_unordered"
    if query.language:
        params["content_languages[0]"] = query.language
    return f"{LIBRARY_URL}?{urlencode(params)}"


def _loads_lenient(text: str) -> Iterator[Any]:
    text = text.strip()
    if text.startswith("for (;;);"):
        text = text[len("for (;;);"):]
    try:
        yield json.loads(text)
        return
    except ValueError:
        pass
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                yield json.loads(line)
            except ValueError:
                continue


def extract_ad_nodes(payload: Any) -> Iterator[dict]:
    stack = [payload]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            if "ad_archive_id" in item and isinstance(item.get("snapshot"), dict):
                yield item
                continue
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)


def extract_ad_nodes_from_text(text: str) -> Iterator[dict]:
    for payload in _loads_lenient(text):
        yield from extract_ad_nodes(payload)


def extract_ad_nodes_from_html(html: str) -> Iterator[dict]:
    for match in _JSON_SCRIPT_RE.finditer(html):
        if "ad_archive_id" in match.group(1):
            yield from extract_ad_nodes_from_text(match.group(1))


def _ts_to_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc).date()
    except (TypeError, ValueError, OSError):
        return None


def _text(value: Any) -> str | None:
    if isinstance(value, dict):
        value = value.get("text") or (value.get("markup") or {}).get("__html")
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return None


def _first_real_text(*values: Any) -> str | None:
    """First text that isn't only dynamic-catalog placeholders like ``{{product.brand}}``."""
    fallback = None
    for value in values:
        text = _text(value)
        if not text:
            continue
        if _TEMPLATE_RE.sub("", text).strip():
            return text
        fallback = fallback or text
    return fallback


def parse_ad_node(node: dict) -> RawAd | None:
    ad_id = node.get("ad_archive_id")
    if not ad_id:
        return None
    snap = node.get("snapshot") or {}
    cards = snap.get("cards") or []
    first_card = cards[0] if cards else {}

    images: list[str] = []
    videos: list[str] = []
    previews: list[str] = []
    for img in snap.get("images") or []:
        url = img.get("original_image_url") or img.get("resized_image_url")
        if url:
            images.append(url)
    for vid in snap.get("videos") or []:
        url = vid.get("video_hd_url") or vid.get("video_sd_url")
        if url:
            videos.append(url)
        if vid.get("video_preview_image_url"):
            previews.append(vid["video_preview_image_url"])
    for card in cards:
        url = card.get("original_image_url") or card.get("resized_image_url")
        if url:
            images.append(url)
        vurl = card.get("video_hd_url") or card.get("video_sd_url")
        if vurl:
            videos.append(vurl)
        if card.get("video_preview_image_url"):
            previews.append(card["video_preview_image_url"])

    return RawAd(
        ad_archive_id=str(ad_id),
        source="scraper",
        page_id=str(node.get("page_id") or snap.get("page_id") or "") or None,
        page_name=node.get("page_name") or snap.get("page_name"),
        page_profile_picture_url=snap.get("page_profile_picture_url"),
        page_like_count=snap.get("page_like_count"),
        page_categories=[str(c) for c in snap.get("page_categories") or [] if c],
        body=_first_real_text(snap.get("body"), *(c.get("body") for c in cards)),
        title=_first_real_text(snap.get("title"), *(c.get("title") for c in cards)),
        caption=_first_real_text(snap.get("caption"), *(c.get("caption") for c in cards)),
        cta_text=snap.get("cta_text") or first_card.get("cta_text"),
        link_url=snap.get("link_url") or first_card.get("link_url"),
        display_format=snap.get("display_format"),
        start_date=_ts_to_date(node.get("start_date")),
        end_date=_ts_to_date(node.get("end_date")),
        is_active=bool(node.get("is_active", True)),
        platforms=[str(p).lower() for p in node.get("publisher_platform") or []],
        collation_id=str(node["collation_id"]) if node.get("collation_id") else None,
        collation_count=node.get("collation_count"),
        image_urls=images,
        video_urls=videos,
        video_preview_urls=previews,
        snapshot_url=f"{LIBRARY_URL}?id={ad_id}",
    )


async def _dismiss_cookie_banner(page) -> None:
    for label in _COOKIE_BUTTONS:
        try:
            button = page.get_by_role("button", name=label)
            if await button.count():
                await button.first.click(timeout=2000)
                return
        except Exception:
            continue


async def _scroll(page, idle: int) -> None:
    """Bottom of the page; when nothing new came, back up a little first so the infinite list re-triggers."""
    if idle:
        await page.evaluate("window.scrollBy(0, -1200)")
        await asyncio.sleep(0.5)
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    await page.mouse.wheel(0, 2500)


async def scrape_library(query: SearchQuery, log: Callable[[str], None] = logger.info,
                         known: set[str] | frozenset[str] = frozenset()) -> list[RawAd]:
    """Scrolls until ``max_ads`` ads not in ``known`` came in; known ads seen on the way are returned too."""
    from playwright.async_api import async_playwright

    settings = get_settings()
    found: dict[str, RawAd] = {}
    pending: list[asyncio.Task] = []

    def new_count() -> int:
        return sum(1 for ad_id in found if ad_id not in known)

    def ingest(nodes: Iterator[dict]) -> None:
        for node in nodes:
            ad = parse_ad_node(node)
            if ad and ad.ad_archive_id not in found:
                found[ad.ad_archive_id] = ad

    async def handle_response(response) -> None:
        if "graphql" not in response.url or response.request.method != "POST":
            return
        try:
            text = await response.text()
        except Exception:
            return
        if "ad_archive_id" in text:
            ingest(extract_ad_nodes_from_text(text))

    url = build_search_url(query)
    log(f"Abrindo {url}")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=settings.scraper_headless)
        context = await browser.new_context(
            locale="pt-BR",
            viewport={"width": 1366, "height": 900},
        )
        page = await context.new_page()
        page.on("response", lambda r: pending.append(asyncio.create_task(handle_response(r))))
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
            await _dismiss_cookie_banner(page)
            await asyncio.sleep(random.uniform(2.5, 4.0))
            ingest(extract_ad_nodes_from_html(await page.content()))
            if known:
                log(f"Carga inicial: {len(found)} anúncios ({new_count()} novos; esta busca já tem {len(known)})")
            else:
                log(f"Carga inicial: {len(found)} anúncios")

            deadline = time.monotonic() + settings.scraper_timeout_seconds
            idle = 0
            scrolls = 0
            while new_count() < query.max_ads:
                if time.monotonic() > deadline:
                    log("Tempo limite do scraper atingido")
                    break
                if idle >= settings.scraper_max_idle_scrolls:
                    log(f"A Biblioteca parou de mandar anúncios após {scrolls} rolagens")
                    if "login" in page.url:
                        log(f"A página pediu login: {page.url}")
                    break
                before = len(found)
                await _scroll(page, idle)
                scrolls += 1
                # Each empty scroll waits longer: slow pages often answer on the second or third try.
                await asyncio.sleep(random.uniform(settings.scraper_min_delay, settings.scraper_max_delay) + idle)
                if pending:
                    await asyncio.gather(*pending, return_exceptions=True)
                    pending.clear()
                idle = idle + 1 if len(found) == before else 0
                if len(found) != before:
                    log(f"{len(found)} anúncios vistos, {new_count()} novos")
        finally:
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)
            await context.close()
            await browser.close()

    fresh = [ad for ad in found.values() if ad.ad_archive_id not in known][: query.max_ads]
    seen = [ad for ad in found.values() if ad.ad_archive_id in known]
    log(f"Scraper finalizado: {len(fresh)} anúncios novos" + (f", {len(seen)} já conhecidos" if known else ""))
    return fresh + seen

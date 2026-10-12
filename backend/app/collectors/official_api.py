"""Collector for the official Ad Library API (Graph API ``/ads_archive``).

Commercial ads are only returned for ads delivered in the EU (plus political/issue ads
everywhere), so for Brazil this mostly complements the scraper.
"""

import json
import logging
import re
import time
from collections.abc import Callable
from datetime import date

import httpx

from app.collectors.base import RawAd, SearchQuery
from app.config import get_settings

logger = logging.getLogger(__name__)

FIELDS = ",".join(
    [
        "id",
        "page_id",
        "page_name",
        "ad_creative_bodies",
        "ad_creative_link_titles",
        "ad_creative_link_captions",
        "ad_creative_link_descriptions",
        "ad_delivery_start_time",
        "ad_delivery_stop_time",
        "ad_snapshot_url",
        "publisher_platforms",
        "languages",
    ]
)
RATE_LIMIT_CODES = {4, 17, 32, 613, 80000, 80004}
MAX_RETRIES = 5
USAGE_THRESHOLD = 85


class OfficialApiError(RuntimeError):
    pass


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _max_usage(headers: httpx.Headers) -> float:
    usage = 0.0
    for header in ("x-app-usage", "x-ad-account-usage", "x-business-use-case-usage"):
        raw = headers.get(header)
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except ValueError:
            continue
        entries = [data] if header != "x-business-use-case-usage" else [
            e for items in data.values() for e in items
        ]
        for entry in entries:
            for key in ("call_count", "total_time", "total_cputime", "acc_id_util_pct"):
                if isinstance(entry.get(key), (int, float)):
                    usage = max(usage, float(entry[key]))
    return usage


def _first(values: list[str] | None) -> str | None:
    return values[0].strip() if values else None


def parse_api_ad(item: dict) -> RawAd:
    stop = _parse_date(item.get("ad_delivery_stop_time"))
    snapshot_url = item.get("ad_snapshot_url")
    if snapshot_url:
        snapshot_url = re.sub(r"[&?]access_token=[^&]+", "", snapshot_url)
    return RawAd(
        ad_archive_id=str(item["id"]),
        source="api",
        page_id=item.get("page_id"),
        page_name=item.get("page_name"),
        body=_first(item.get("ad_creative_bodies")),
        title=_first(item.get("ad_creative_link_titles")),
        caption=_first(item.get("ad_creative_link_captions")),
        start_date=_parse_date(item.get("ad_delivery_start_time")),
        end_date=stop,
        is_active=stop is None or stop >= date.today(),
        platforms=[p.lower() for p in item.get("publisher_platforms") or []],
        snapshot_url=snapshot_url,
    )


def fetch_official(query: SearchQuery, log: Callable[[str], None] = logger.info) -> list[RawAd]:
    settings = get_settings()
    if not settings.meta_access_token:
        raise OfficialApiError("META_ACCESS_TOKEN não configurado")

    params: dict[str, str | int] = {
        "access_token": settings.meta_access_token,
        "ad_reached_countries": json.dumps([query.country.upper()]),
        "ad_active_status": "ACTIVE",
        "ad_type": "ALL",
        "media_type": query.media_type.upper() if query.media_type in {"image", "video"} else "ALL",
        "fields": FIELDS,
        "limit": 100,
    }
    if query.page_id:
        params["search_page_ids"] = json.dumps([query.page_id])
    else:
        term = query.term.strip()
        exact = len(term) > 1 and term.startswith('"') and term.endswith('"')
        params["search_terms"] = term.strip('"')
        params["search_type"] = "KEYWORD_EXACT_PHRASE" if exact else "KEYWORD_UNORDERED"
    if query.language:
        params["languages"] = json.dumps([query.language])

    url: str | None = f"https://graph.facebook.com/{settings.meta_graph_version}/ads_archive"
    ads: dict[str, RawAd] = {}
    with httpx.Client(timeout=60) as client:
        while url and len(ads) < query.max_ads:
            data = _get_with_backoff(client, url, params, log)
            for item in data.get("data", []):
                ad = parse_api_ad(item)
                ads.setdefault(ad.ad_archive_id, ad)
            log(f"API oficial: {len(ads)} anúncios")
            url = (data.get("paging") or {}).get("next")
            params = {}  # the "next" URL already carries every parameter
    return list(ads.values())[: query.max_ads]


def _get_with_backoff(client: httpx.Client, url: str, params: dict, log: Callable[[str], None]) -> dict:
    for attempt in range(MAX_RETRIES):
        resp = client.get(url, params=params or None)
        usage = _max_usage(resp.headers)
        if usage >= USAGE_THRESHOLD:
            wait = 60 * (1 + attempt)
            log(f"Uso da API em {usage:.0f}%, aguardando {wait}s")
            time.sleep(wait)

        if resp.status_code == 200:
            return resp.json()

        try:
            error = resp.json().get("error", {})
        except ValueError:
            error = {"message": resp.text[:300]}
        code = error.get("code")
        if code in RATE_LIMIT_CODES or resp.status_code >= 500:
            wait = min(300, 15 * 2**attempt)
            log(f"API oficial limitada (código {code}), nova tentativa em {wait}s")
            time.sleep(wait)
            continue
        raise OfficialApiError(f"Erro da API oficial ({code}): {error.get('message')}")
    raise OfficialApiError("API oficial: tentativas esgotadas por limite de requisições")

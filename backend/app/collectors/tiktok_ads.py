"""TikTok Creative Center "Top Ads": high-performing auction ads, filterable by country, language and industry.

There is no public API. The page's own JSON endpoints need a session signature (user-sign + anonymous-user-id)
that the page computes in the browser, so one Playwright visit captures it and plain HTTP calls follow.
The signature is not bound to the query, only to the session.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass

import httpx
from playwright.async_api import async_playwright

from app.config import get_settings

API = "https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2"
PAGE = "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?period={period}&region={country}"
DETAIL_URL = "https://ads.tiktok.com/business/creativecenter/topads/{id}/pc/en?countryCode={country}&period={period}"
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/140.0.0.0 Safari/537.36")
SIGN_HEADERS = ("user-sign", "anonymous-user-id", "timestamp", "lang")
PAGE_SIZE = 20
# TikTok caps every listing at 500; 180 days is the only window with enough Brazilian ads per industry.
PERIOD = 180
# Two rankings per collection: proven click-through and proven reach of the creative.
ORDERS = ("ctr", "like")
REQUEST_GAP_S = 0.6
RATE_LIMITED = 40100
RATE_LIMIT_BACKOFF_S = (5, 15, None)

PREFIX = "tiktok:"
INDUSTRIES: dict[int, str] = {
    10000000000: "Educação",
    11000000000: "Veículos e transporte",
    12000000000: "Bebês, crianças e maternidade",
    13000000000: "Serviços financeiros",
    14000000000: "Beleza e cuidados pessoais",
    15000000000: "Tecnologia e eletrônicos",
    16000000000: "Eletrodomésticos",
    17000000000: "Viagens",
    18000000000: "Produtos para casa",
    19000000000: "Pets",
    20000000000: "Apps",
    21000000000: "Casa e reforma",
    22000000000: "Moda e acessórios",
    23000000000: "Notícias e entretenimento",
    24000000000: "Serviços para empresas",
    25000000000: "Jogos",
    26000000000: "Serviços pessoais",
    27000000000: "Alimentos e bebidas",
    28000000000: "Esportes e ar livre",
    29000000000: "Saúde",
    30000000000: "E-commerce",
}
OBJECTIVES = {
    "campaign_objective_traffic": "Tráfego",
    "campaign_objective_app_install": "Instalação de app",
    "campaign_objective_app_promotion": "Promoção de app",
    "campaign_objective_conversion": "Conversões",
    "campaign_objective_video_view": "Visualizações",
    "campaign_objective_reach": "Alcance",
    "campaign_objective_lead_generation": "Geração de leads",
    "campaign_objective_product_sales": "Vendas de produto",
}


class TikTokError(Exception):
    pass


@dataclass
class RawTikTokAd:
    id: str
    title: str | None
    brand: str | None
    industry_id: int | None
    objective: str | None
    ctr_rank: float | None  # percentile within the industry: 0.05 = top 5%
    likes: int
    budget: int | None  # 0 low, 1 medium, 2 high
    duration_s: float | None
    cover_url: str | None
    comments: int | None = None
    shares: int | None = None
    landing_page: str | None = None


def industry_of(term: str) -> int | None:
    """Source terms are "tiktok:<industry id>" or "tiktok:all"."""
    value = term[len(PREFIX):] if term.startswith(PREFIX) else ""
    return int(value) if value.isdigit() else None


def detail_url(ad_id: str, country: str) -> str:
    return DETAIL_URL.format(id=ad_id, country=country, period=PERIOD)


async def session_headers(country: str) -> dict[str, str]:
    headers: dict[str, str] = {}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=get_settings().scraper_headless)
        try:
            page = await (await browser.new_context(locale="en-US", user_agent=USER_AGENT)).new_page()

            def grab(request):
                if "creative_radar_api" in request.url and "user-sign" in request.headers and not headers:
                    headers.update({k: v for k, v in request.headers.items() if k in SIGN_HEADERS})

            page.on("request", grab)
            await page.goto(PAGE.format(period=PERIOD, country=country), wait_until="domcontentloaded", timeout=90_000)
            for _ in range(30):
                if headers:
                    break
                await page.wait_for_timeout(1000)
        finally:
            await browser.close()
    if not headers:
        raise TikTokError("O Creative Center do TikTok não abriu a sessão (a página pode ter mudado).")
    return headers


def _int(value) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _industry(key: str | None) -> int | None:
    return _int((key or "").removeprefix("label_")) or None


class CreativeCenterClient:
    def __init__(self, headers: dict[str, str], http: httpx.Client | None = None):
        self.http = http or httpx.Client(timeout=30)
        self.headers = {**headers, "user-agent": USER_AGENT, "referer": "https://ads.tiktok.com/"}

    def _get(self, path: str, **params) -> dict:
        for wait in RATE_LIMIT_BACKOFF_S:
            response = self.http.get(f"{API}/{path}", params=params, headers=self.headers)
            time.sleep(REQUEST_GAP_S)
            if response.status_code != 200:
                raise TikTokError(f"Creative Center respondeu {response.status_code}")
            body = response.json()
            if body.get("code") != RATE_LIMITED or wait is None:
                break
            time.sleep(wait)
        if body.get("code") != 0:
            raise TikTokError(f"Creative Center recusou a consulta: {body.get('msg')} ({body.get('code')})")
        return body.get("data") or {}

    def top_ads(self, *, country: str, language: str | None, industry: int | None, order_by: str,
                limit: int) -> list[RawTikTokAd]:
        found: list[RawTikTokAd] = []
        page = 1
        while len(found) < limit:
            params = {"period": PERIOD, "page": page, "limit": PAGE_SIZE, "order_by": order_by, "country_code": country}
            if language:
                params["ad_language"] = language
            if industry:
                params["industry"] = industry
            data = self._get("list", **params)
            for item in data.get("materials") or []:
                video = item.get("video_info") or {}
                found.append(RawTikTokAd(
                    id=str(item["id"]),
                    title=item.get("ad_title") or None,
                    brand=item.get("brand_name") or None,
                    industry_id=_industry(item.get("industry_key")),
                    objective=item.get("objective_key") or None,
                    ctr_rank=item.get("ctr"),
                    likes=_int(item.get("like")) or 0,
                    budget=_int(item.get("cost")),
                    duration_s=video.get("duration"),
                    cover_url=video.get("cover"),
                ))
            if not (data.get("pagination") or {}).get("has_more"):
                break
            page += 1
        return found[:limit]

    def fill_detail(self, ad: RawTikTokAd) -> None:
        data = self._get("detail", material_id=ad.id)
        ad.comments = _int(data.get("comment"))
        ad.shares = _int(data.get("share"))
        ad.landing_page = data.get("landing_page") or None


def collect_tiktok_ads(term: str, *, country: str, language: str | None, max_results: int,
                       known: Callable[[list[str]], set[str]], log: Callable[[str], None],
                       headers: dict[str, str]) -> list[RawTikTokAd]:
    """Top ads by CTR and by likes; details (comments, shares, landing page) only for ads not seen before."""
    industry = industry_of(term)
    client = CreativeCenterClient(headers)
    per_order = max(PAGE_SIZE, max_results // len(ORDERS))
    ads: dict[str, RawTikTokAd] = {}
    with client.http:
        for order in ORDERS:
            for ad in client.top_ads(country=country, language=language, industry=industry, order_by=order,
                                     limit=per_order):
                ads.setdefault(ad.id, ad)
        label = INDUSTRIES.get(industry, "todos os nichos") if industry else "todos os nichos"
        log(f"TikTok Top Ads ({label}, últimos {PERIOD} dias): {len(ads)} anúncios")
        detailed = known(list(ads))
        new = [ad for ad in ads.values() if ad.id not in detailed]
        for i, ad in enumerate(new, 1):
            try:
                client.fill_detail(ad)
            except TikTokError as exc:
                log(f"Detalhe do anúncio {ad.id} indisponível: {exc}")
            if i % 25 == 0:
                log(f"Detalhes: {i}/{len(new)}")
        log(f"Detalhes de {len(new)} anúncios novos coletados")
    return list(ads.values())

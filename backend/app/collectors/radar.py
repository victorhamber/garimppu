"""Cloudflare Radar domain rankings: the most visited (or fastest rising) sites of a country, per category.

Official, free API (a Cloudflare account token with the Radar read permission). It gives rank positions, not visit
counts. Category filters use Cloudflare's content subcategories, the names Radar shows on each domain.
"""

from collections.abc import Callable
from dataclasses import dataclass

import httpx

API = "https://api.cloudflare.com/client/v4/radar/ranking/top"
PREFIX = "sites:"
# Radar returns at most this many domains per ranking.
MAX_LIMIT = 100

RANKINGS = {
    "POPULAR": "Mais acessados",
    "TRENDING_RISE": "Subindo agora",
    "TRENDING_STEADY": "Crescimento constante",
}
# Cloudflare content subcategory (the value Radar filters by) -> label in the app.
CATEGORIES: dict[str, str] = {
    "Health & Fitness": "Saúde e fitness",
    "Ecommerce": "E-commerce",
    "Shopping": "Compras",
    "Auctions & Marketplaces": "Marketplaces",
    "Coupons": "Cupons e descontos",
    "Personal Finance": "Finanças pessoais",
    "Brokerage & Investing": "Investimentos e corretoras",
    "Cryptocurrency": "Criptomoedas",
    "Economy & Finance": "Economia e finanças",
    "Business": "Negócios",
    "Education": "Educação",
    "Educational Institutions": "Instituições de ensino",
    "Job Search & Careers": "Empregos e carreiras",
    "Gambling": "Apostas",
    "Gaming": "Jogos",
    "Food & Drink": "Comida e bebida",
    "Fashion": "Moda",
    "Clothing": "Roupas",
    "Home & Garden": "Casa e jardim",
    "Pets": "Pets",
    "Parenting": "Maternidade e família",
    "Dating & Relationships": "Relacionamentos",
    "Lifestyle": "Estilo de vida",
    "Hobbies & Interests": "Hobbies",
    "Religion & Spirituality": "Religião e espiritualidade",
    "Astrology": "Astrologia",
    "Travel": "Viagens",
    "Vehicles": "Veículos",
    "Real Estate": "Imóveis",
    "Sports": "Esportes",
    "News & Media": "Notícias e mídia",
    "Entertainment": "Entretenimento",
    "Video Streaming": "Streaming de vídeo",
    "Artificial Intelligence": "Inteligência artificial",
    "Technology": "Tecnologia",
}


class RadarError(Exception):
    pass


@dataclass
class RawSite:
    domain: str
    rank: int
    categories: list[str]
    pct_rank_change: float | None  # only in trending rankings


def source_term(ranking: str, category: str | None) -> str:
    return f"{PREFIX}{ranking}:{category or 'all'}"


def parse_term(term: str) -> tuple[str, str | None]:
    """Source terms are "sites:<ranking>:<category or all>"."""
    ranking, _, category = term.removeprefix(PREFIX).partition(":")
    return ranking, (None if category in ("", "all") else category)


def _error_message(response: httpx.Response) -> str:
    try:
        errors = response.json().get("errors") or []
        detail = "; ".join(str(e.get("message")) for e in errors if e.get("message"))
    except ValueError:
        detail = ""
    if response.status_code in (401, 403):
        return ("O Cloudflare recusou o token (CLOUDFLARE_API_TOKEN). Confira se ele tem a permissão "
                "Conta → Radar → Ler e se não expirou.")
    if response.status_code == 429:
        return "Limite de consultas do Cloudflare Radar atingido. Tente de novo mais tarde."
    return f"Cloudflare Radar respondeu {response.status_code}{': ' + detail if detail else ''}"


def collect_sites(term: str, *, country: str, max_results: int, token: str,
                  log: Callable[[str], None], http: httpx.Client | None = None) -> list[RawSite]:
    ranking, category = parse_term(term)
    params: dict[str, str | int] = {"rankingType": ranking, "limit": min(max_results, MAX_LIMIT), "format": "json"}
    if country:
        params["location"] = country.upper()
    if category:
        params["domainCategory"] = category
    client = http or httpx.Client(timeout=30)
    try:
        response = client.get(API, params=params, headers={"Authorization": f"Bearer {token}"})
    finally:
        if http is None:
            client.close()
    if response.status_code != 200:
        raise RadarError(_error_message(response))
    result = response.json().get("result") or {}
    rows = next((v for k, v in result.items() if k.startswith("top_") and isinstance(v, list)), [])
    sites = [
        RawSite(
            domain=str(row["domain"]).lower(),
            rank=int(row["rank"]),
            categories=[c["name"] for c in row.get("categories") or [] if c.get("name")],
            pct_rank_change=row.get("pctRankChange"),
        )
        for row in rows if row.get("domain") and row.get("rank") is not None
    ]
    label = CATEGORIES.get(category, category) if category else "todas as categorias"
    log(f"Cloudflare Radar ({RANKINGS.get(ranking, ranking)}, {label}, {country.upper()}): {len(sites)} sites")
    return sites

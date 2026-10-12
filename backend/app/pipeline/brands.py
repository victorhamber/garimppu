"""Flags pages of big brands: companies an affiliate can't promote, however well their ads scale.

A page is a big brand when it has at least BIG_BRAND_MIN_LIKES likes, or when its name or any of
its offer destinations matches a known brand. Likes alone miss brand sub-pages with few followers
(Amazon Flex, Sou Motorista 99), so the lists below cover those.
"""

import re
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Ad, Page
from app.pipeline.normalize import strip_accents

BIG_BRAND_MIN_LIKES = 2_000_000

# Whole words only, so "natura" doesn't flag "produtos naturais" nor "amazon" flag "Amazônia".
BRAND_WORDS = {
    "boticario", "grupoboticario", "natura", "avon", "eudora", "uber", "app99", "99app", "99food", "rappi",
    "ifood", "amazon", "shopee", "magalu", "americanas", "renner", "riachuelo", "cea", "booking", "decolar",
    "pagbank", "cloudwalk", "itau", "bradesco", "santander", "samsung", "google", "microsoft", "nestle",
    "unilever", "ambev", "nike", "adidas",
}
# Multi-word names, matched with spaces and punctuation removed.
BRAND_COMPOUNDS = [
    "grupoboticario", "naturaavon", "loccitane", "quemdisseberenice", "voude99", "motorista99", "didiglobal",
    "lalamove", "mercadolivre", "mercadoenvios", "mercadopago", "magazineluiza", "casasbahia", "netshoes",
    "airbnb", "infinitepay", "pagseguro", "nubank", "c6bank", "picpay", "bancodobrasil", "bancointer",
    "cocacola",
]
# Domains of brands whose bare name is too common a word ("ton", "inter", "vivo").
BRAND_DOMAINS = [
    "ton.com.br", "stone.com.br", "caixa.gov.br", "vivo.com.br",
    "claro.com.br", "tim.com.br", "apple.com",
]

_SKIP_OFFERS = ("page:", "instagram:", "whatsapp:")


def matches_brand(text: str | None) -> bool:
    if not text:
        return False
    lowered = strip_accents(text.lower())
    if BRAND_WORDS & set(re.findall(r"[a-z0-9]+", lowered)):
        return True
    compact = re.sub(r"[^a-z0-9]", "", lowered)
    if any(brand in compact for brand in BRAND_COMPOUNDS):
        return True
    return any(re.search(r"(?:^|[./:])" + re.escape(domain) + r"(?:$|[/:])", lowered) for domain in BRAND_DOMAINS)


def is_big_brand(name: str | None, like_count: int | None, offer_keys: Iterable[str | None] = ()) -> bool:
    if like_count and like_count >= BIG_BRAND_MIN_LIKES:
        return True
    if matches_brand(name):
        return True
    return any(key and not key.startswith(_SKIP_OFFERS) and matches_brand(key) for key in offer_keys)


def refresh_big_brands(db: Session, page_ids: Iterable[str] | None = None) -> int:
    """Recomputes the flag for the given pages (all when None); returns how many are big brands."""
    pages_stmt = select(Page)
    offers_stmt = select(Ad.page_id, Ad.offer_key).where(Ad.offer_key.is_not(None)).distinct()
    if page_ids is not None:
        ids = list(set(page_ids))
        if not ids:
            return 0
        pages_stmt = pages_stmt.where(Page.page_id.in_(ids))
        offers_stmt = offers_stmt.where(Ad.page_id.in_(ids))
    offers: dict[str, list[str]] = {}
    for page_id, key in db.execute(offers_stmt):
        offers.setdefault(page_id, []).append(key)
    flagged = 0
    for page in db.scalars(pages_stmt):
        page.big_brand = is_big_brand(page.name, page.page_like_count, offers.get(page.page_id, []))
        flagged += page.big_brand
    return flagged

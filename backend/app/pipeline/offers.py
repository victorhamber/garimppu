"""Maps an ad's destination link to the offer it sells.

Ads from different pages that point to the same checkout product, store product, app or
site share an ``offer_key``; many advertisers on one key is the strongest sign that the
product itself is scaling (affiliates only pile into offers that convert).
"""

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, unquote, urlparse

# Checkout platforms used by infoproducts/affiliates. The first path segment is the product code.
CHECKOUT_PLATFORMS = {
    "hotmart": "Hotmart",
    "hotm.art": "Hotmart",
    "kiwify": "Kiwify",
    "eduzz": "Eduzz",
    "monetizze": "Monetizze",
    "braip": "Braip",
    "perfectpay": "PerfectPay",
    "ticto": "Ticto",
    "greenn": "Greenn",
    "lastlink": "Lastlink",
    "cakto": "Cakto",
    "hubla": "Hubla",
    "payt.com": "Payt",
    "kirvano": "Kirvano",
    "doppus": "Doppus",
}
STORE_PLATFORMS = {
    "myshopify.com": "Shopify",
    "yampi": "Yampi",
    "cartpanda": "Cartpanda",
    "nuvemshop": "Nuvemshop",
    "lojavirtualnuvem": "Nuvemshop",
    "tray.com.br": "Tray",
    "vtex": "VTEX",
}
MARKETPLACES = {
    "mercadolivre.com.br": "Mercado Livre",
    "mercadolibre.com": "Mercado Livre",
    "shopee.com.br": "Shopee",
    "amazon.com.br": "Amazon",
    "amazon.com": "Amazon",
    "magazineluiza.com.br": "Magalu",
    "magalu.com": "Magalu",
    "aliexpress.com": "AliExpress",
}
CONVERSATION_HOSTS = {
    "api.whatsapp.com": "WhatsApp",
    "wa.me": "WhatsApp",
    "wa.link": "WhatsApp",
    "whatsapp.com": "WhatsApp",
    "m.me": "Messenger",
    "messenger.com": "Messenger",
    "fb.me": "Facebook",
    "facebook.com": "Facebook",
    "fb.com": "Facebook",
}
_PRODUCT_PATH_RE = re.compile(r"/(products?|produtos?)/[^/]+", re.I)
_AMAZON_ASIN_RE = re.compile(r"/(?:dp|gp/product)/([A-Z0-9]{10})", re.I)
_APPLE_ID_RE = re.compile(r"/id(\d+)")
_HOST_PREFIXES = ("www.", "m.", "l.", "lm.")


@dataclass(frozen=True)
class Offer:
    key: str
    kind: str  # infoproduto | loja | app | conversa | site
    platform: str | None


def _host(netloc: str) -> str:
    host = netloc.lower().split("@")[-1].split(":")[0]
    for prefix in _HOST_PREFIXES:
        if host.startswith(prefix):
            host = host[len(prefix):]
    return host


def _matches(host: str, needle: str) -> bool:
    return host == needle or host.endswith("." + needle) or ("." not in needle and needle in host)


def _lookup(host: str, table: dict[str, str]) -> str | None:
    return next((label for needle, label in table.items() if _matches(host, needle)), None)


def _segments(path: str) -> list[str]:
    return [s for s in path.split("/") if s]


def classify_destination(link_url: str | None, page_id: str | None) -> Offer | None:
    if not link_url:
        return None
    url = urlparse(link_url.strip())
    host = _host(url.netloc)
    if host == "facebook.com" and url.path.startswith("/l.php"):
        target = parse_qs(url.query).get("u", [""])[0]
        if target:
            return classify_destination(unquote(target), page_id)
    if not host:
        return None
    path = url.path.rstrip("/")
    segments = _segments(path)

    if platform := _lookup(host, CONVERSATION_HOSTS):
        return Offer(f"page:{page_id}", "conversa", platform) if page_id else None
    if host == "instagram.com":
        if segments and segments[0] == "_u":
            segments = segments[1:]
        if segments and segments[0] not in {"p", "reel", "reels", "stories", "explore"}:
            return Offer(f"instagram:{segments[0].lower()}", "conversa", "Instagram")
        return Offer(f"page:{page_id}", "conversa", "Instagram") if page_id else None

    if host == "play.google.com":
        app_id = parse_qs(url.query).get("id", [""])[0]
        return Offer(f"android:{app_id or path}", "app", "Google Play")
    if host in {"apps.apple.com", "itunes.apple.com"}:
        match = _APPLE_ID_RE.search(path)
        return Offer(f"ios:{match.group(1) if match else path}", "app", "App Store")

    if platform := _lookup(host, CHECKOUT_PLATFORMS):
        code = segments[0] if segments else host
        return Offer(f"{platform.lower()}:{code}", "infoproduto", platform)

    if platform := _lookup(host, MARKETPLACES):
        slug = platform.lower().replace(" ", "")
        if platform != "Amazon":
            return Offer(f"{slug}:{host + path}", "loja", platform)
        if asin := _AMAZON_ASIN_RE.search(path):
            return Offer(f"{slug}:{asin.group(1)}", "loja", platform)

    store = _lookup(host, STORE_PLATFORMS)
    product = _PRODUCT_PATH_RE.search(path)
    if store or product:
        key = host + (product.group(0).lower() if product else "")
        return Offer(key, "loja", store)

    return Offer(host, "site", None)


def set_offer(ad) -> None:
    offer = classify_destination(ad.link_url, ad.page_id)
    ad.offer_key = offer.key[:255] if offer else None
    ad.offer_kind = offer.kind if offer else None
    ad.offer_platform = offer.platform if offer else None


def offer_label(key: str, kind: str, platform: str | None, top_page: str | None) -> str:
    _, _, rest = key.partition(":")
    if key.startswith("instagram:"):
        return f"@{rest}"
    if kind == "conversa" or kind == "app":
        return top_page or rest
    if kind == "infoproduto":
        return f"{platform} · {rest}"
    return rest or key

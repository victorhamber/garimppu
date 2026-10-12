import re
import unicodedata
from dataclasses import fields

from app.collectors.base import RawAd

_PLATFORM_ALIASES = {
    "facebook": "facebook",
    "instagram": "instagram",
    "messenger": "messenger",
    "audience_network": "audience_network",
    "audiencenetwork": "audience_network",
    "threads": "threads",
    "whatsapp": "whatsapp",
}
_WS_RE = re.compile(r"\s+")
_INLINE_WS_RE = re.compile(r"[^\S\n]+")
_BLANK_LINES_RE = re.compile(r"\n{3,}")
_URL_RE = re.compile(r"https?://\S+|www\.\S+")
_NON_WORD_RE = re.compile(r"[^a-z0-9 ]+")
_TEMPLATE_RE = re.compile(r"\{\{[^}]*\}\}")


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def clean_text(text: str | None) -> str | None:
    if not text:
        return None
    lines = (_INLINE_WS_RE.sub(" ", line).strip() for line in text.splitlines())
    text = _BLANK_LINES_RE.sub("\n\n", "\n".join(lines)).strip()
    return text or None


def text_signature(*parts: str | None) -> str:
    """Normalized text used to group ads whose copy is the same apart from noise."""
    text = " ".join(p for p in parts if p)
    text = _TEMPLATE_RE.sub(" ", text)
    text = _URL_RE.sub(" ", strip_accents(text.lower()))
    text = _NON_WORD_RE.sub(" ", text)
    text = re.sub(r"\b\d+\b", " ", text)
    return _WS_RE.sub(" ", text).strip()


def normalize_platforms(platforms: list[str]) -> list[str]:
    result = []
    for p in platforms:
        key = _PLATFORM_ALIASES.get(p.lower().replace(" ", "_"))
        if key and key not in result:
            result.append(key)
    return result


def normalize_ad(ad: RawAd) -> RawAd:
    ad.body = clean_text(ad.body)
    ad.title = clean_text(ad.title)
    ad.caption = clean_text(ad.caption)
    ad.cta_text = clean_text(ad.cta_text)
    ad.platforms = normalize_platforms(ad.platforms)
    ad.display_format = ad.display_format.upper() if ad.display_format else None
    return ad


def merge_sources(*batches: list[RawAd]) -> list[RawAd]:
    """Merge ads from several collectors; the first non-empty value of each field wins."""
    merged: dict[str, RawAd] = {}
    for batch in batches:
        for ad in batch:
            ad = normalize_ad(ad)
            current = merged.get(ad.ad_archive_id)
            if current is None:
                merged[ad.ad_archive_id] = ad
                continue
            for f in fields(RawAd):
                if f.name == "source":
                    continue
                if not getattr(current, f.name) and getattr(ad, f.name):
                    setattr(current, f.name, getattr(ad, f.name))
            if current.source != ad.source:
                current.source = "both"
    return list(merged.values())

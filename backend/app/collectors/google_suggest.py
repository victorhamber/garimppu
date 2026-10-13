"""What people search around a term, from Google's autocomplete (the suggestions shown while typing).

There is no official API and no search volume: Google orders suggestions by popularity, so a suggestion that
shows up high and under several expansions ("creatina a", "creatina para"...) is searched more.
A handful of sequential requests per term, cached for a day.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass, field

import httpx

URL = "https://suggestqueries.google.com/complete/search"
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/140.0.0.0 Safari/537.36")
REQUEST_GAP_S = 0.15
CACHE_S = 24 * 3600
LETTERS = "abcdefghijlmnopqrstuv"
MODIFIERS = ("como", "qual", "melhor", "para", "o que", "onde", "quanto", "pre\u00e7o")
SLOTS = 10  # Google returns up to 10 suggestions per query


class SuggestError(Exception):
    pass


@dataclass
class Suggestion:
    term: str
    score: float = 0
    hits: int = 0  # expansions where it showed up
    best_position: int = SLOTS
    via: set[str] = field(default_factory=set)


_cache: dict[tuple[str, str], tuple[float, list[Suggestion]]] = {}


def _fetch(http: httpx.Client, query: str, country: str, language: str) -> list[str]:
    response = http.get(URL, params={"client": "firefox", "q": query, "hl": language, "gl": country.lower(),
                                     "ie": "utf-8", "oe": "utf-8"})
    if response.status_code != 200:
        raise SuggestError(f"O Google respondeu {response.status_code} ao autocompletar.")
    data = response.json()
    return [s for s in data[1] if isinstance(s, str)] if len(data) > 1 else []


def expansions(term: str) -> list[str]:
    term = term.strip()
    return [term, *(f"{term} {letter}" for letter in LETTERS), *(f"{m} {term}" for m in MODIFIERS),
            *(f"{term} {m}" for m in ("para", "como", "que"))]


def suggest(term: str, *, country: str = "BR", language: str = "pt-BR",
            sleep: Callable[[float], None] = time.sleep) -> list[Suggestion]:
    term = " ".join(term.lower().split())
    if not term:
        return []
    key = (term, f"{country}:{language}")
    cached = _cache.get(key)
    if cached and time.time() - cached[0] < CACHE_S:
        return cached[1]

    found: dict[str, Suggestion] = {}
    with httpx.Client(timeout=10, headers={"user-agent": USER_AGENT}) as http:
        for i, query in enumerate(expansions(term)):
            if i:
                sleep(REQUEST_GAP_S)
            try:
                results = _fetch(http, query, country, language)
            except (httpx.HTTPError, ValueError) as exc:
                if not found:
                    raise SuggestError(f"N\u00e3o foi poss\u00edvel consultar o autocompletar do Google: {exc}") from exc
                continue
            for position, text in enumerate(results):
                text = " ".join(text.lower().split())
                if text == term:
                    continue
                item = found.setdefault(text, Suggestion(text))
                # The plain term's own suggestions are the most popular ones.
                item.score += (SLOTS - position) * (2 if query == term else 1)
                item.hits += 1
                item.best_position = min(item.best_position, position)
                item.via.add(query)

    ranked = sorted(found.values(), key=lambda s: (-s.score, s.best_position, s.term))
    _cache[key] = (time.time(), ranked)
    return ranked

"""YouTube Data API v3: the most watched recent videos for a term, with their statistics and channel size.

Quota per collection: 100 units per search page of 50 results, plus 1 unit per 50 videos and per 50 channels.
"""

import math
import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx

API = "https://www.googleapis.com/youtube/v3"
PAGE_SIZE = 50
_DURATION_RE = re.compile(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")
SHORT_MAX_SECONDS = 180


class YouTubeError(Exception):
    pass


@dataclass
class RawVideo:
    external_id: str
    channel_id: str | None
    channel_title: str | None
    title: str | None
    description: str | None
    thumbnail_url: str | None
    published_at: datetime
    duration_s: int | None
    views: int
    likes: int | None
    comments: int | None
    language: str | None = None
    channel_subscribers: int | None = None

    @property
    def is_short(self) -> bool:
        if self.duration_s is None:
            return False
        tagged = "#shorts" in f"{self.title or ''} {self.description or ''}".lower()
        return self.duration_s <= 60 or (tagged and self.duration_s <= SHORT_MAX_SECONDS)


def parse_duration(value: str | None) -> int | None:
    match = _DURATION_RE.fullmatch(value or "")
    if not value or not match:
        return None
    days, hours, minutes, seconds = (int(g or 0) for g in match.groups())
    return ((days * 24 + hours) * 60 + minutes) * 60 + seconds


def _int(value) -> int | None:
    return int(value) if value is not None else None


def _thumbnail(snippet: dict) -> str | None:
    thumbs = snippet.get("thumbnails") or {}
    for size in ("maxres", "standard", "high", "medium", "default"):
        if url := (thumbs.get(size) or {}).get("url"):
            return url
    return None


def _chunks(items: list[str], size: int = PAGE_SIZE) -> Iterator[list[str]]:
    for start in range(0, len(items), size):
        yield items[start:start + size]


class YouTubeClient:
    def __init__(self, api_key: str, http: httpx.Client | None = None):
        self.api_key = api_key
        self.http = http or httpx.Client(timeout=30)
        self.units = 0

    def _get(self, resource: str, cost: int, **params) -> dict:
        response = self.http.get(f"{API}/{resource}", params={**params, "key": self.api_key})
        self.units += cost
        if response.status_code != 200:
            raise YouTubeError(_error_message(response))
        return response.json()

    def search_ids(self, term: str, *, country: str, language: str | None, max_results: int,
                   published_after: datetime) -> list[str]:
        ids: list[str] = []
        token = None
        for _ in range(math.ceil(max_results / PAGE_SIZE)):
            params = {
                "part": "id", "type": "video", "q": term, "order": "viewCount", "maxResults": PAGE_SIZE,
                "publishedAfter": published_after.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            if len(country) == 2:
                params["regionCode"] = country.upper()
            if language:
                params["relevanceLanguage"] = language
            if token:
                params["pageToken"] = token
            data = self._get("search", 100, **params)
            ids += [item["id"]["videoId"] for item in data.get("items", []) if item.get("id", {}).get("videoId")]
            token = data.get("nextPageToken")
            if not token or len(ids) >= max_results:
                break
        return list(dict.fromkeys(ids))[:max_results]

    def videos(self, ids: list[str]) -> list[RawVideo]:
        found: list[RawVideo] = []
        for chunk in _chunks(ids):
            data = self._get("videos", 1, part="snippet,statistics,contentDetails,liveStreamingDetails",
                             id=",".join(chunk))
            for item in data.get("items", []):
                snippet, stats = item.get("snippet", {}), item.get("statistics", {})
                # Lives and their replays pile up views from the stream itself, not from the video spreading.
                if snippet.get("liveBroadcastContent") in ("live", "upcoming") or item.get("liveStreamingDetails"):
                    continue
                found.append(RawVideo(
                    external_id=item["id"],
                    channel_id=snippet.get("channelId"),
                    channel_title=snippet.get("channelTitle"),
                    title=snippet.get("title"),
                    description=snippet.get("description"),
                    thumbnail_url=_thumbnail(snippet),
                    published_at=datetime.fromisoformat(snippet["publishedAt"].replace("Z", "+00:00")),
                    duration_s=parse_duration(item.get("contentDetails", {}).get("duration")),
                    views=int(stats.get("viewCount", 0)),
                    likes=_int(stats.get("likeCount")),
                    comments=_int(stats.get("commentCount")),
                    language=snippet.get("defaultAudioLanguage") or snippet.get("defaultLanguage"),
                ))
        return found

    def subscribers(self, channel_ids: list[str]) -> dict[str, int | None]:
        result: dict[str, int | None] = {}
        for chunk in _chunks(list(dict.fromkeys(channel_ids))):
            data = self._get("channels", 1, part="statistics", id=",".join(chunk))
            for item in data.get("items", []):
                stats = item.get("statistics", {})
                result[item["id"]] = None if stats.get("hiddenSubscriberCount") else _int(stats.get("subscriberCount"))
        return result


def _error_message(response: httpx.Response) -> str:
    try:
        error = response.json().get("error", {})
        reason = (error.get("errors") or [{}])[0].get("reason", "")
        message = error.get("message", "")
    except ValueError:
        reason, message = "", response.text[:200]
    if reason in ("quotaExceeded", "dailyLimitExceeded"):
        return "Cota diária da API do YouTube esgotada. A coleta volta a funcionar quando o Google zerar a cota (meia-noite no horário do Pacífico, 4h ou 5h em Brasília)."
    if reason == "keyInvalid" or "API key" in message:
        return "Chave da API do YouTube inválida. Confira YOUTUBE_API_KEY no servidor."
    if reason == "accessNotConfigured":
        return "A YouTube Data API v3 não está ativada no projeto do Google Cloud dessa chave."
    return f"YouTube respondeu {response.status_code}: {message or reason}"


NICHE_PREFIX = "nicho:"
# What people search on YouTube for each niche (ids from pipeline.niche); joined with YouTube's OR operator.
NICHE_QUERIES: dict[str, list[str]] = {
    "revenda": ["revenda", "revendedora", "venda direta", "consultora"],
    "entregas_apps": ["entregador", "motorista de aplicativo", "entregas ifood", "uber"],
    "empregos": ["vagas de emprego", "jovem aprendiz", "currículo", "processo seletivo"],
    "emagrecimento": ["emagrecer", "perder peso", "dieta", "secar barriga"],
    "beleza_estetica": ["skincare", "maquiagem", "cabelo", "estética"],
    "saude": ["saúde", "ansiedade", "diabetes", "dor nas costas"],
    "fitness": ["treino", "academia", "hipertrofia", "musculação"],
    "financas": ["investimentos", "renda passiva", "day trade", "bitcoin"],
    "marketing_digital": ["marketing digital", "tráfego pago", "afiliado", "ganhar dinheiro na internet"],
    "artesanato": ["artesanato", "crochê", "resina", "costura"],
    "relacionamento": ["relacionamento", "reconquistar", "conquistar", "namoro"],
    "educacao_concursos": ["concurso público", "enem", "vestibular", "como estudar"],
    "idiomas": ["aprender inglês", "inglês", "espanhol", "fluência"],
    "pets": ["cachorro", "gato", "pet", "adestramento"],
    "moda": ["moda", "look", "roupas", "semijoias"],
    "casa_decoracao": ["decoração", "organização da casa", "air fryer", "limpeza da casa"],
    "tecnologia": ["iphone", "celular", "inteligência artificial", "chatgpt"],
    "imoveis": ["imóveis", "apartamento", "minha casa minha vida", "terreno"],
    "automotivo": ["carro", "moto", "mecânica", "consórcio"],
    "alimentacao": ["receita", "confeitaria", "bolo", "marmita"],
    "apostas": ["apostas esportivas", "cassino", "bet", "palpites"],
    "espiritualidade": ["oração", "tarot", "signos", "lei da atração"],
    "maternidade": ["bebê", "gravidez", "maternidade", "amamentação"],
}


def search_query(term: str) -> str:
    """A plain term, or "nicho:<id>" expanded to that niche's searches."""
    if term.startswith(NICHE_PREFIX):
        words = NICHE_QUERIES.get(term[len(NICHE_PREFIX):], [])
        return "|".join(f'"{w}"' if " " in w else w for w in words)
    return term


def matches_language(video: RawVideo, language: str) -> bool:
    if video.language:
        return video.language.lower().split("-")[0] == language.lower()
    # Undeclared: drop titles written mostly in another script (Devanagari, Bengali, Arabic...).
    letters = [c for c in video.title or "" if c.isalpha()]
    return not letters or sum(ord(c) > 0x24F for c in letters) / len(letters) < 0.3


def fetch_videos(ids: list[str], *, language: str | None, api_key: str) -> list[RawVideo]:
    """Statistics and channel size for ids found elsewhere (the extension): about 2 quota units per 50 videos."""
    client = YouTubeClient(api_key)
    with client.http:
        videos = [v for v in client.videos(ids) if not language or matches_language(v, language)]
        subs = client.subscribers([v.channel_id for v in videos if v.channel_id])
    for video in videos:
        video.channel_subscribers = subs.get(video.channel_id) if video.channel_id else None
    return videos


def collect_videos(term: str, *, country: str, language: str | None, max_results: int, window_days: int,
                   api_key: str, log: Callable[[str], None]) -> tuple[list[RawVideo], int]:
    """Returns the videos and the quota units spent."""
    client = YouTubeClient(api_key)
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    query = search_query(term)
    if not query:
        raise YouTubeError(f"Nicho sem termos de busca no YouTube: {term}")
    ids = client.search_ids(query, country=country, language=language, max_results=max_results, published_after=since)
    log(f"YouTube: {len(ids)} vídeos publicados nos últimos {window_days} dias")
    found = client.videos(ids)
    videos = [v for v in found if not language or matches_language(v, language)]
    log(f"Descartados: {len(ids) - len(found)} lives ou indisponíveis, {len(found) - len(videos)} em outro idioma")
    subs = client.subscribers([v.channel_id for v in videos if v.channel_id])
    for video in videos:
        video.channel_subscribers = subs.get(video.channel_id) if video.channel_id else None
    log(f"Estatísticas de {len(videos)} vídeos e {len(subs)} canais ({client.units} unidades de cota)")
    return videos, client.units

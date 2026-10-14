"""Downloads creatives locally because Meta CDN URLs are signed and expire."""

import hashlib
import logging
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/129.0 Safari/537.36"
    )
}


def url_key(url: str) -> str:
    """Stable key for a CDN URL, ignoring its expiring signature query string."""
    return hashlib.sha1(urlsplit(url).path.encode()).hexdigest()


def _media_root() -> Path:
    root = Path(get_settings().media_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def download_image(client: httpx.Client, url: str) -> tuple[str, bytes] | None:
    """Returns (relative path under media dir, content) or None on failure."""
    rel = f"images/{url_key(url)}.jpg"
    target = _media_root() / rel
    if target.exists():
        return rel, target.read_bytes()
    try:
        resp = client.get(url, headers=BROWSER_HEADERS, follow_redirects=True)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Falha ao baixar imagem %s: %s", url[:120], exc)
        return None
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(resp.content)
    return rel, resp.content


def download_video(client: httpx.Client, url: str) -> str | None:
    settings = get_settings()
    rel = f"videos/{url_key(url)}.mp4"
    target = _media_root() / rel
    if target.exists():
        return rel
    limit = settings.max_video_mb * 1024 * 1024
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".part")
    try:
        with client.stream("GET", url, headers=BROWSER_HEADERS, follow_redirects=True) as resp:
            resp.raise_for_status()
            size = 0
            with tmp.open("wb") as fh:
                for chunk in resp.iter_bytes(1 << 16):
                    size += len(chunk)
                    if size > limit:
                        raise ValueError("vídeo acima do limite")
                    fh.write(chunk)
        tmp.replace(target)
        return rel
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Falha ao baixar vídeo %s: %s", url[:120], exc)
        tmp.unlink(missing_ok=True)
        return None

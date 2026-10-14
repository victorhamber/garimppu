"""Keeps a small thumbnail of each creative because Meta CDN URLs are signed and expire; full media stays on Meta."""

import hashlib
import io
import logging
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from PIL import Image

from app.config import get_settings

logger = logging.getLogger(__name__)
THUMB_SIZE = 480
THUMB_QUALITY = 65

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


def make_thumbnail(content: bytes) -> bytes | None:
    """Small WebP copy (~20 KB): what the app keeps, since the full image stays on Meta's CDN."""
    try:
        with Image.open(io.BytesIO(content)) as img:
            img = img.convert("RGB")
            img.thumbnail((THUMB_SIZE, THUMB_SIZE))
            out = io.BytesIO()
            img.save(out, "WEBP", quality=THUMB_QUALITY, method=4)
            return out.getvalue()
    except (OSError, ValueError, Image.DecompressionBombError):
        return None


def download_image(client: httpx.Client, url: str) -> tuple[str, bytes] | None:
    """Stores only a thumbnail; returns (relative path under media dir, thumbnail bytes) or None on failure."""
    rel = f"thumbs/{url_key(url)}.webp"
    target = _media_root() / rel
    if target.exists():
        return rel, target.read_bytes()
    try:
        resp = client.get(url, headers=BROWSER_HEADERS, follow_redirects=True)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Falha ao baixar imagem %s: %s", url[:120], exc)
        return None
    thumb = make_thumbnail(resp.content)
    if thumb is None:
        return None
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(thumb)
    return rel, thumb


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

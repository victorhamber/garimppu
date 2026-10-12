"""Groups ads that share the same creative.

Keys are prefixed by kind so we only compare like with like:
``i:<phash>`` image, ``v:<phash of preview>`` video, ``t:<sha1 of copy>`` text-only.
"""

import hashlib
import io
import logging

import imagehash
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Creative

logger = logging.getLogger(__name__)


def perceptual_hash(content: bytes) -> str | None:
    try:
        with Image.open(io.BytesIO(content)) as img:
            return str(imagehash.phash(img.convert("RGB")))
    except Exception as exc:
        logger.warning("Imagem inválida para hash: %s", exc)
        return None


def text_hash(signature: str) -> str:
    return hashlib.sha1(signature.encode()).hexdigest()


def _hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


class CreativeMatcher:
    """In-memory index of existing creative hashes for near-duplicate lookup."""

    def __init__(self, db: Session):
        self.threshold = get_settings().dedupe_hamming_threshold
        self.exact: dict[str, int] = {}
        self.visual: dict[str, list[tuple[str, int]]] = {"i": [], "v": []}
        for creative_id, key in db.execute(select(Creative.id, Creative.hash)):
            self.add(key, creative_id)

    def add(self, key: str, creative_id: int) -> None:
        self.exact[key] = creative_id
        kind, _, value = key.partition(":")
        if kind in self.visual:
            self.visual[kind].append((value, creative_id))

    def find(self, key: str) -> int | None:
        if key in self.exact:
            return self.exact[key]
        kind, _, value = key.partition(":")
        best: tuple[int, int] | None = None
        for other, creative_id in self.visual.get(kind, []):
            distance = _hamming(value, other)
            if distance <= self.threshold and (best is None or distance < best[0]):
                best = (distance, creative_id)
        return best[1] if best else None

"""One-off: replaces the full-size images (and any videos) saved by older versions with small thumbnails."""

import logging
import shutil
from pathlib import Path

from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.models import Creative, TikTokAd
from app.pipeline.media import make_thumbnail

logger = logging.getLogger(__name__)
LEGACY_DIRS = ("images", "videos")
CHUNK = 200


def _shrink(db, model, column, root: Path) -> tuple[int, int]:
    attr = getattr(model, column)
    ids = list(db.scalars(select(model.__mapper__.primary_key[0]).where(attr.like("images/%"))))
    kept = dropped = 0
    for start in range(0, len(ids), CHUNK):
        for row in db.scalars(select(model).where(model.__mapper__.primary_key[0].in_(ids[start:start + CHUNK]))):
            old = root / getattr(row, column)
            rel = f"thumbs/{old.stem}.webp"
            new = root / rel
            if not new.exists() and old.is_file() and (thumb := make_thumbnail(old.read_bytes())):
                new.parent.mkdir(parents=True, exist_ok=True)
                new.write_bytes(thumb)
            if new.exists():
                setattr(row, column, rel)
                kept += 1
            else:
                setattr(row, column, None)  # falls back to the CDN URL
                dropped += 1
        db.commit()
    return kept, dropped


def shrink_stored_media() -> None:
    root = Path(get_settings().media_dir)
    if not any((root / name).exists() for name in LEGACY_DIRS):
        return
    with SessionLocal() as db:
        creatives = _shrink(db, Creative, "local_path", root)
        covers = _shrink(db, TikTokAd, "cover_path", root)
        for creative in db.scalars(select(Creative).where(Creative.local_video_path.is_not(None))):
            creative.local_video_path = None
        db.commit()
    for name in LEGACY_DIRS:
        shutil.rmtree(root / name, ignore_errors=True)
    logger.info("Mídia reduzida a miniaturas: criativos %s, capas do TikTok %s (mantidas, sem arquivo)",
                creatives, covers)

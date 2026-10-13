"""Builds frontend/public/garimppu-extensao.zip: the manual-install download and the Chrome Web Store upload."""

import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TARGET = HERE.parent / "frontend" / "public" / "garimppu-extensao.zip"
SKIP = {"STORE.md", "pack.py"}

with zipfile.ZipFile(TARGET, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(HERE.rglob("*")):
        if path.is_file() and path.name not in SKIP:
            archive.write(path, path.relative_to(HERE).as_posix())
print(TARGET)

"""Copy everything from an old SQLite database (miner.db) into the Postgres in DATABASE_URL.

    python -m app.import_sqlite data/miner.db

Run it once, on an empty Postgres that already went through `alembic upgrade head`
(the API does that on start). Login sessions and password links are not copied: everyone logs in again.

Media files, when the server's volume can't be reached directly (no SSH):

    python -m app.import_sqlite --upload-media data/media   # from the machine that has the files
    python -m app.import_sqlite --restore-media             # on the server: writes them to MEDIA_DIR
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import DateTime, Integer, create_engine, func, select, text

from app import models  # noqa: F401  (registers every table on Base.metadata)
from app.config import get_settings
from app.db import Base, engine as target

SKIPPED = {"auth_sessions", "password_resets"}
BATCH = 500
MEDIA_TABLE = "media_import"
MEDIA_BATCH = 25


def upload_media(media_dir: Path) -> None:
    files = sorted(p for p in media_dir.rglob("*") if p.is_file())
    with target.connect() as conn:
        conn.execute(text(f"CREATE TABLE IF NOT EXISTS {MEDIA_TABLE} (path TEXT PRIMARY KEY, data BYTEA NOT NULL)"))
        conn.commit()
        done = set(conn.scalars(text(f"SELECT path FROM {MEDIA_TABLE}")))
        pending = [p for p in files if p.relative_to(media_dir).as_posix() not in done]
        print(f"{len(files)} arquivos, {len(done)} já enviados, {len(pending)} a enviar")
        for start in range(0, len(pending), MEDIA_BATCH):
            chunk = pending[start:start + MEDIA_BATCH]
            conn.execute(text(f"INSERT INTO {MEDIA_TABLE} (path, data) VALUES (:path, :data) ON CONFLICT DO NOTHING"),
                         [{"path": p.relative_to(media_dir).as_posix(), "data": p.read_bytes()} for p in chunk])
            conn.commit()
            print(f"  {start + len(chunk)}/{len(pending)}")
    print("Envio concluído. No servidor, rode: python -m app.import_sqlite --restore-media")


def restore_media() -> None:
    root = Path(get_settings().media_dir).resolve()
    with target.connect() as conn:
        if conn.scalar(text(f"SELECT to_regclass('{MEDIA_TABLE}')")) is None:
            print("Nenhuma mídia pendente.")
            return
        written = 0
        rows = conn.execute(text(f"SELECT path, data FROM {MEDIA_TABLE}"),
                            execution_options={"stream_results": True, "yield_per": MEDIA_BATCH})
        for path, data in rows:
            dest = (root / path).resolve()
            if not dest.is_relative_to(root):
                continue
            if not dest.exists():
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                written += 1
        conn.execute(text(f"DROP TABLE {MEDIA_TABLE}"))
        conn.commit()
    print(f"{written} arquivos de mídia gravados em {root}")


def _revision(conn) -> str | None:
    return conn.execute(text("SELECT version_num FROM alembic_version")).scalar()


def _as_utc(value):
    return value.replace(tzinfo=timezone.utc) if isinstance(value, datetime) and value.tzinfo is None else value


def main() -> None:
    if target.dialect.name != "postgresql":
        sys.exit("DATABASE_URL precisa apontar para o Postgres de destino.")
    if sys.argv[1:] == ["--restore-media"]:
        return restore_media()
    if len(sys.argv) == 3 and sys.argv[1] == "--upload-media" and Path(sys.argv[2]).is_dir():
        return upload_media(Path(sys.argv[2]))
    args = sys.argv[1:]
    if len(args) != 1 or not Path(args[0]).is_file():
        sys.exit("Uso: python -m app.import_sqlite <caminho/miner.db>\n"
                 "     python -m app.import_sqlite --upload-media <pasta/media>\n"
                 "     python -m app.import_sqlite --restore-media")
    source = create_engine(f"sqlite:///{Path(args[0]).resolve().as_posix()}")
    tables = [t for t in Base.metadata.sorted_tables if t.name not in SKIPPED]

    with source.connect() as src, target.begin() as dst:
        if _revision(src) != _revision(dst):
            sys.exit(f"Versões diferentes (SQLite {_revision(src)}, Postgres {_revision(dst)}). "
                     "Rode `alembic upgrade head` nos dois antes de copiar.")
        filled = [t.name for t in tables if dst.scalar(select(func.count()).select_from(t))]
        if filled:
            sys.exit(f"O Postgres já tem dados ({', '.join(filled)}). A cópia só roda num banco vazio.")

        for table in tables:
            dates = [c.name for c in table.columns if isinstance(c.type, DateTime)]
            rows, copied = src.execute(select(table)).mappings(), 0
            while chunk := rows.fetchmany(BATCH):
                dst.execute(table.insert(), [{**r, **{d: _as_utc(r[d]) for d in dates}} for r in chunk])
                copied += len(chunk)
            print(f"{table.name}: {copied}")

            pk = list(table.primary_key.columns)
            if len(pk) == 1 and isinstance(pk[0].type, Integer):
                dst.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{table.name}', '{pk[0].name}'), "
                    f"COALESCE(MAX({pk[0].name}), 1), MAX({pk[0].name}) IS NOT NULL) FROM {table.name}"
                ))
    print("Cópia concluída. As mídias (data/media) vão à parte, para o volume /app/data do servidor.")


if __name__ == "__main__":
    main()

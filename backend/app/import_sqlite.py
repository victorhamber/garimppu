"""Copy everything from an old SQLite database (miner.db) into the Postgres in DATABASE_URL.

    python -m app.import_sqlite data/miner.db

Run it once, on an empty Postgres that already went through `alembic upgrade head`
(the API does that on start). Login sessions and password links are not copied: everyone logs in again.
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import DateTime, Integer, create_engine, func, select, text

from app import models  # noqa: F401  (registers every table on Base.metadata)
from app.db import Base, engine as target

SKIPPED = {"auth_sessions", "password_resets"}
BATCH = 500


def _revision(conn) -> str | None:
    return conn.execute(text("SELECT version_num FROM alembic_version")).scalar()


def _as_utc(value):
    return value.replace(tzinfo=timezone.utc) if isinstance(value, datetime) and value.tzinfo is None else value


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1 or not Path(args[0]).is_file():
        sys.exit("Uso: python -m app.import_sqlite <caminho/miner.db>")
    if target.dialect.name != "postgresql":
        sys.exit("DATABASE_URL precisa apontar para o Postgres de destino.")
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

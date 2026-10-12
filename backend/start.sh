#!/bin/sh
set -e

# Postgres may still be starting (e.g. after a VPS reboot): retry the migrations for up to ~1 minute.
tries=0
until alembic upgrade head; do
  tries=$((tries + 1))
  if [ "$tries" -ge 20 ]; then
    echo "Banco indisponível: confira DATABASE_URL e se o serviço Postgres está rodando." >&2
    exit 1
  fi
  echo "Banco ainda não respondeu; nova tentativa em 3s ($tries/20)..." >&2
  sleep 3
done

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"

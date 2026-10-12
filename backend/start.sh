#!/bin/sh
set -e

alembic upgrade head

# One process only: collections and the scheduler run inside the API, so never scale above one replica.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"

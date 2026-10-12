"""RQ worker entry point: ``python -m app.worker`` (Linux/Docker; RQ needs fork)."""

import logging

from redis import Redis
from rq import Worker

from app.config import get_settings
from app.jobs import QUEUE_NAME


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    if not settings.redis_url:
        raise SystemExit("REDIS_URL não configurado")
    connection = Redis.from_url(settings.redis_url)
    Worker([QUEUE_NAME], connection=connection).work(with_scheduler=False)


if __name__ == "__main__":
    main()

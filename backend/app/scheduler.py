"""Periodic re-collection of saved searches and daily rescoring.

Runs inside the API process (ENABLE_SCHEDULER=true) or standalone via
``python -m app.scheduler`` when using Docker.
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.schedulers.blocking import BlockingScheduler

from app.config import get_settings
from app.db import SessionLocal
from app.jobs import enqueue_due_sources, enqueue_rescore

logger = logging.getLogger(__name__)


def check_due_searches() -> None:
    db = SessionLocal()
    try:
        count = enqueue_due_sources(db)
        if count:
            logger.info("%s coletas agendadas enfileiradas", count)
    finally:
        db.close()


def _configure(scheduler) -> None:
    interval = get_settings().scheduler_interval_minutes
    scheduler.add_job(check_due_searches, "interval", minutes=interval, id="due_searches",
                      max_instances=1, coalesce=True)
    scheduler.add_job(enqueue_rescore, "cron", hour=3, minute=0, id="daily_rescore",
                      max_instances=1, coalesce=True)


def start_background_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")
    _configure(scheduler)
    scheduler.start()
    return scheduler


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    blocking = BlockingScheduler(timezone="UTC")
    _configure(blocking)
    check_due_searches()
    blocking.start()

"""Dispatches jobs to RQ when REDIS_URL is set, otherwise to an in-process thread pool."""

import logging
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.models import Run, Search, Source
from app.pipeline.sources import as_utc, following

logger = logging.getLogger(__name__)
QUEUE_NAME = "miner"
JOB_TIMEOUT = 60 * 45

_executor: ThreadPoolExecutor | None = None


def get_queue():
    from redis import Redis
    from rq import Queue

    return Queue(QUEUE_NAME, connection=Redis.from_url(get_settings().redis_url))


def _dispatch(func_path: str, *args) -> None:
    global _executor
    if get_settings().redis_url:
        get_queue().enqueue(func_path, *args, job_timeout=JOB_TIMEOUT)
        return
    import importlib

    module, _, name = func_path.rpartition(".")
    func = getattr(importlib.import_module(module), name)
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="miner-job")
    _executor.submit(func, *args)


def enqueue_source(db: Session, source: Source) -> Run:
    """Creates a run for the source unless one is already queued or running."""
    pending = db.scalar(
        select(Run).where(Run.source_id == source.id, Run.status.in_(("queued", "running")))
    )
    if pending:
        return pending
    run = Run(source_id=source.id, status="queued")
    db.add(run)
    db.commit()
    _dispatch("app.tasks.run_source", run.id)
    return run


def enqueue_rescore() -> None:
    _dispatch("app.tasks.rescore_all")


def enqueue_due_sources(db: Session) -> int:
    """Queues overdue sources within the hourly budget, most overdue and most followed first."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    used = db.scalar(
        select(func.count(Run.id)).where(Run.created_at >= now - timedelta(hours=1))
    ) or 0
    budget = settings.max_runs_per_hour - used
    if budget <= 0:
        return 0

    followers = Counter(
        s.source_id for s in db.scalars(select(Search).options(selectinload(Search.user))) if following(s)
    )
    due: list[tuple[float, Source]] = []
    for source in db.scalars(select(Source).where(Source.refresh_hours.is_not(None))):
        if not followers.get(source.id):
            continue
        last = as_utc(source.last_run_at)
        period = timedelta(hours=source.refresh_hours)
        overdue = 10.0 if last is None else (now - last) / period
        if overdue >= 1:
            due.append((overdue * followers[source.id], source))

    due.sort(key=lambda item: item[0], reverse=True)
    for _, source in due[:budget]:
        enqueue_source(db, source)
    return min(len(due), budget)


def fail_orphaned_runs(db: Session) -> None:
    """In-process mode loses its queue on restart; mark leftovers as interrupted."""
    if get_settings().redis_url:
        return
    db.execute(
        update(Run)
        .where(Run.status.in_(("queued", "running")))
        .values(status="error", error="Interrompido por reinício do servidor",
                finished_at=datetime.now(timezone.utc))
    )
    db.commit()

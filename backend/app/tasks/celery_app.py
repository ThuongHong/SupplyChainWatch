from __future__ import annotations

from celery import Celery  # type: ignore[import-untyped]

from app.config import get_settings
from app.tasks.schedule import beat_schedule

settings = get_settings()

celery_app = Celery(
    "globalsupplywatch",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.jobs"],
)

celery_app.conf.update(
    beat_schedule=beat_schedule,
    task_track_started=True,
    timezone="UTC",
)

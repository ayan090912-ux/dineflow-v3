from celery import Celery
from app.core.config.settings import get_settings

settings = get_settings()

celery_app = Celery(
    "dineflow",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.core.events.tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True
)

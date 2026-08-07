from app.core.events.celery_app import celery_app
from app.core.events.bus import DomainEvent


@celery_app.task(bind=True, max_retries=5, default_retry_delay=60)
def handle_domain_event(self, event_data: dict):
    try:
        # TODO: Implement event handling logic
        print(f"Processing event: {event_data}")
    except Exception as exc:
        raise self.retry(exc=exc)

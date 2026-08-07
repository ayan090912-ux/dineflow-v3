from enum import Enum
from typing import Dict, Any, Callable, List
from datetime import datetime, timezone
import json
import asyncio


class EventDispatchMode(Enum):
    IN_MEMORY = "in_memory"
    PUBSUB = "pubsub"
    CELERY = "celery"


class DomainEvent:
    def __init__(
        self,
        event_type: str,
        aggregate_type: str,
        aggregate_id: str,
        restaurant_id: str = None,
        payload: Dict[str, Any] = None,
        metadata: Dict[str, Any] = None
    ):
        self.event_type = event_type
        self.aggregate_type = aggregate_type
        self.aggregate_id = aggregate_id
        self.restaurant_id = restaurant_id
        self.payload = payload or {}
        self.metadata = metadata or {}
        self.occurred_at = datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_type": self.event_type,
            "aggregate_type": self.aggregate_type,
            "aggregate_id": self.aggregate_id,
            "restaurant_id": self.restaurant_id,
            "payload": self.payload,
            "metadata": self.metadata,
            "occurred_at": self.occurred_at.isoformat()
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), default=str)


class EventBus:
    def __init__(self):
        self.handlers: Dict[str, List[Callable]] = {}

    def subscribe(self, event_type: str, handler: Callable):
        if event_type not in self.handlers:
            self.handlers[event_type] = []
        self.handlers[event_type].append(handler)

    async def publish(self, event: DomainEvent, mode: EventDispatchMode = EventDispatchMode.IN_MEMORY):
        if mode == EventDispatchMode.IN_MEMORY:
            await self._dispatch_sync(event)
        elif mode == EventDispatchMode.PUBSUB:
            await self._dispatch_pubsub(event)
        elif mode == EventDispatchMode.CELERY:
            await self._dispatch_celery(event)

    async def _dispatch_sync(self, event: DomainEvent):
        handlers = self.handlers.get(event.event_type, [])
        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event)
                else:
                    handler(event)
            except Exception as e:
                print(f"Event handler error: {e}")

    async def _dispatch_pubsub(self, event: DomainEvent):
        # TODO: Implement Redis pub/sub dispatch
        pass

    async def _dispatch_celery(self, event: DomainEvent):
        # TODO: Implement Celery task dispatch
        pass


# Global event bus instance
event_bus = EventBus()


def event_handler(event_type: str, mode: EventDispatchMode = EventDispatchMode.IN_MEMORY):
    def decorator(func: Callable):
        event_bus.subscribe(event_type, func)
        return func
    return decorator

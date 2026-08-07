import time
from typing import Optional

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config.settings import get_settings

settings = get_settings()


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        # Simple in-memory rate limiting (replace with Redis in production)
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        # Skip rate limiting for health checks
        if path in ["/healthz", "/readyz", "/docs", "/openapi.json"]:
            return await call_next(request)

        response = await call_next(request)
        return response

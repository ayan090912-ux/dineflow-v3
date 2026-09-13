import time
import asyncio
from collections import defaultdict
from typing import Dict, List, Tuple
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config.settings import get_settings

settings = get_settings()

# Default rate limits per minute by category
RATE_LIMIT_RULES: List[Tuple[str, str, int, int]] = [
    # (method, path_prefix, max_requests, window_seconds)
    ("POST", "/api/v1/auth/terminal-login", 10, 60),
    ("POST", "/api/v1/auth/staff/login", 10, 60),
    ("POST", "/api/v1/auth/platform/login", 10, 60),
    ("POST", "/api/v1/restaurants", 5, 60),
    ("POST", "/api/v1/orders", 20, 60),
    ("POST", "/api/v1/customer-requests", 15, 60),
    ("GET", "/api/v1/restaurants/public/resolve", 60, 60),
    ("GET", "/api/v1/restaurants/public/slug", 60, 60),
]

DEFAULT_RATE_LIMIT = (120, 60) # 120 req / 60s for general endpoints

class SlidingWindowRateLimiter:
    def __init__(self):
        # Key: (client_ip, category) -> list of request timestamps
        self.requests: Dict[str, List[float]] = defaultdict(list)
        self.last_cleanup = time.time()
        self._lock = asyncio.Lock()

    def _get_rule(self, method: str, path: str) -> Tuple[str, int, int]:
        for m, prefix, limit, window in RATE_LIMIT_RULES:
            if (m == "*" or m == method) and path.startswith(prefix):
                return prefix, limit, window
        return "default", DEFAULT_RATE_LIMIT[0], DEFAULT_RATE_LIMIT[1]

    async def is_allowed(self, client_ip: str, method: str, path: str) -> Tuple[bool, int, int, int]:
        """
        Returns (is_allowed, limit, remaining, retry_after)
        """
        category, limit, window = self._get_rule(method, path)
        key = f"{client_ip}:{category}"
        now = time.time()
        window_start = now - window

        async with self._lock:
            # Periodic cleanup every 60 seconds
            if now - self.last_cleanup > 60:
                self._cleanup(now)

            timestamps = self.requests[key]
            # Remove timestamps outside the sliding window
            while timestamps and timestamps[0] < window_start:
                timestamps.pop(0)

            if len(timestamps) >= limit:
                retry_after = int(window - (now - timestamps[0])) + 1
                return False, limit, 0, max(1, retry_after)

            timestamps.append(now)
            remaining = max(0, limit - len(timestamps))
            return True, limit, remaining, 0

    def _cleanup(self, now: float):
        self.last_cleanup = now
        stale_keys = []
        for key, timestamps in self.requests.items():
            # Retain only timestamps from the last 120 seconds
            fresh = [t for t in timestamps if now - t < 120]
            if fresh:
                self.requests[key] = fresh
            else:
                stale_keys.append(key)
        for key in stale_keys:
            del self.requests[key]

# Global rate limiter instance
limiter = SlidingWindowRateLimiter()

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        path = request.url.path

        # Exempt health checks, docs, static assets
        if path in [
            "/healthz", "/readyz", "/health", "/ready",
            "/api/v1/health", "/api/v1/healthz", "/api/v1/ready", "/api/v1/readyz",
            "/docs", "/redoc", "/openapi.json", "/favicon.ico"
        ] or path.startswith("/static/"):
            return await call_next(request)

        has_forwarded = bool(request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for"))
        # In non-production test/dev runs, localhost/testclient requests without explicit simulated IP are exempt
        # so automated test suites don't trip burst limits
        if not has_forwarded and (settings.ENVIRONMENT or "").strip().lower() != "production":
            client_host = request.client.host if request.client else "127.0.0.1"
            if client_host in ("127.0.0.1", "localhost", "testclient", "test"):
                return await call_next(request)

        # Extract client IP (handle Cloudflare / Proxy headers safely)
        client_ip = (
            request.headers.get("cf-connecting-ip")
            or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else "127.0.0.1")
        )

        allowed, limit, remaining, retry_after = await limiter.is_allowed(
            client_ip=client_ip,
            method=request.method,
            path=path
        )

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Please try again later.",
                    "type": "rate_limit_exceeded",
                    "retry_after_seconds": retry_after
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0"
                }
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response

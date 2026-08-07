import time
import uuid
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
        request.state.correlation_id = correlation_id

        start_time = time.time()

        try:
            response = await call_next(request)
            process_time = time.time() - start_time

            response.headers["X-Correlation-ID"] = correlation_id
            response.headers["X-Process-Time"] = str(process_time)

            # Structured logging
            log_data = {
                "correlation_id": correlation_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "process_time": process_time,
                "client_ip": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent")
            }
            print(f"[REQUEST] {log_data}")

            return response
        except Exception as exc:
            process_time = time.time() - start_time
            log_data = {
                "correlation_id": correlation_id,
                "method": request.method,
                "path": request.url.path,
                "error": str(exc),
                "process_time": process_time
            }
            print(f"[ERROR] {log_data}")
            raise

import re
import time
import uuid
from typing import Optional
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

# Sensitive query parameter keys to sanitize from log paths
SENSITIVE_PARAM_REGEX = re.compile(r"(token|jwt|secret|key|password|auth)=([^&]+)", re.IGNORECASE)

def sanitize_url_path(url_path: str, query_string: str) -> str:
    if not query_string:
        return url_path
    sanitized_query = SENSITIVE_PARAM_REGEX.sub(r"\1=[REDACTED]", query_string)
    return f"{url_path}?{sanitized_query}"

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
        request.state.correlation_id = correlation_id

        start_time = time.time()
        safe_path = sanitize_url_path(request.url.path, request.url.query)

        # Extract client IP (respecting Cloudflare headers)
        client_ip = (
            request.headers.get("cf-connecting-ip")
            or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else None)
        )

        try:
            response = await call_next(request)
            process_time = time.time() - start_time

            response.headers["X-Correlation-ID"] = correlation_id
            response.headers["X-Process-Time"] = f"{process_time:.4f}"

            # Redacted structured logging (Never logs tokens or secrets)
            log_data = {
                "correlation_id": correlation_id,
                "method": request.method,
                "path": safe_path,
                "status_code": response.status_code,
                "process_time": round(process_time, 4),
                "client_ip": client_ip,
                "user_agent": request.headers.get("user-agent")
            }
            print(f"[REQUEST] {log_data}")
            return response
        except Exception as exc:
            process_time = time.time() - start_time
            # Sanitize exception message to prevent leaking credentials
            exc_str = str(exc)
            exc_str_safe = SENSITIVE_PARAM_REGEX.sub(r"\1=[REDACTED]", exc_str)
            log_data = {
                "correlation_id": correlation_id,
                "method": request.method,
                "path": safe_path,
                "error": exc_str_safe[:300], # Bounded error string
                "process_time": round(process_time, 4),
                "client_ip": client_ip
            }
            print(f"[ERROR] {log_data}")
            raise

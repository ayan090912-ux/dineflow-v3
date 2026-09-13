from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from fastapi import Request

# 1MB limit for standard JSON/form payloads, 5MB for multipart uploads
DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 1024       # 1 MB
MULTIPART_MAX_PAYLOAD_BYTES = 5 * 1024 * 1024 # 5 MB

class PayloadLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Only check payload size for methods that carry a body
        if request.method in ("POST", "PUT", "PATCH"):
            content_length = request.headers.get("content-length")
            content_type = request.headers.get("content-type", "")

            max_allowed = (
                MULTIPART_MAX_PAYLOAD_BYTES
                if "multipart/form-data" in content_type
                else DEFAULT_MAX_PAYLOAD_BYTES
            )

            if content_length:
                try:
                    length = int(content_length)
                    if length > max_allowed:
                        return JSONResponse(
                            status_code=413,
                            content={
                                "detail": f"Payload too large. Maximum allowed size is {max_allowed} bytes.",
                                "type": "payload_too_large"
                            }
                        )
                except ValueError:
                    pass

        return await call_next(request)

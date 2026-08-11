from fastapi import HTTPException, status
from typing import Optional, Dict, Any, List


class DinelyException(HTTPException):
    def __init__(
        self,
        status_code: int,
        detail: str,
        error_code: Optional[str] = None,
        errors: Optional[List[Dict[str, Any]]] = None
    ):
        super().__init__(status_code=status_code, detail=detail)
        self.error_code = error_code
        self.errors = errors or []


class NotFoundException(DinelyException):
    def __init__(self, detail: str = "Resource not found"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail, error_code="not_found")


class ConflictException(DinelyException):
    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail, error_code="conflict")


class ValidationException(DinelyException):
    def __init__(self, detail: str = "Validation error", errors: Optional[List[Dict]] = None):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail,
            error_code="validation_error",
            errors=errors
        )


class UnauthorizedException(DinelyException):
    def __init__(self, detail: str = "Unauthorized"):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail, error_code="unauthorized")


class ForbiddenException(DinelyException):
    def __init__(self, detail: str = "Forbidden"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail, error_code="forbidden")


class TenantIsolationException(DinelyException):
    def __init__(self, detail: str = "Tenant isolation violation"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail, error_code="tenant_isolation")


class RateLimitException(DinelyException):
    def __init__(self, detail: str = "Rate limit exceeded"):
        super().__init__(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail, error_code="rate_limit")

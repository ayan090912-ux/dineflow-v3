from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from uuid import UUID

from jose import jwt, JWTError
from pydantic import BaseModel

from app.core.config.settings import get_settings

settings = get_settings()


class TokenPayload(BaseModel):
    sub: UUID
    scope: str
    jti: str
    iat: datetime
    exp: datetime
    type: str
    # Optional fields based on scope
    restaurant_id: Optional[UUID] = None
    branch_id: Optional[UUID] = None
    role: Optional[str] = None
    permissions: Optional[list] = None
    table_id: Optional[UUID] = None


def create_access_token(
    subject: UUID,
    scope: str,
    extra_claims: Optional[Dict[str, Any]] = None,
    expires_delta: Optional[timedelta] = None
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "sub": str(subject),
        "scope": scope,
        "jti": str(uuid.uuid4()),
        "iat": datetime.now(timezone.utc),
        "exp": expire,
        "type": "access"
    }

    if extra_claims:
        to_encode.update(extra_claims)

    encoded_jwt = jwt.encode(to_encode, settings.JWT_ACCESS_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def create_refresh_token(
    subject: UUID,
    scope: str,
    token_family: UUID,
    expires_delta: Optional[timedelta] = None
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode = {
        "sub": str(subject),
        "scope": scope,
        "jti": str(uuid.uuid4()),
        "token_family": str(token_family),
        "iat": datetime.now(timezone.utc),
        "exp": expire,
        "type": "refresh"
    }

    encoded_jwt = jwt.encode(to_encode, settings.JWT_REFRESH_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[TokenPayload]:
    try:
        payload = jwt.decode(token, settings.JWT_ACCESS_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return TokenPayload(
            sub=UUID(payload["sub"]),
            scope=payload["scope"],
            jti=payload["jti"],
            iat=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
            exp=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
            type=payload["type"],
            restaurant_id=UUID(payload["restaurant_id"]) if payload.get("restaurant_id") else None,
            branch_id=UUID(payload["branch_id"]) if payload.get("branch_id") else None,
            role=payload.get("role"),
            permissions=payload.get("permissions"),
            table_id=UUID(payload["table_id"]) if payload.get("table_id") else None
        )
    except (JWTError, ValueError, KeyError):
        return None


def decode_refresh_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.JWT_REFRESH_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except (JWTError, ValueError):
        return None

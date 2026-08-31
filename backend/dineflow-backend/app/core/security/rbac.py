from typing import List, Optional, Dict, Any
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.config.settings import get_settings
from app.core.security.jwt import TokenPayload, decode_access_token
from app.core.security.firebase import verify_firebase_id_token, set_platform_admin_custom_claims

security_scheme = HTTPBearer(auto_error=False)

# Strict explicit allowlist for Dinely Platform Administrator access
PLATFORM_ADMIN_ALLOWED_EMAILS = [
    "ayan090912@gmail.com"
]


class RBACError(HTTPException):
    def __init__(self, detail: str = "Forbidden: Access Denied"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class AuthenticationError(HTTPException):
    def __init__(self, detail: str = "Authentication credentials were missing or invalid"):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


async def get_current_firebase_admin(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)
) -> Dict[str, Any]:
    """
    Extracts and verifies Firebase ID Token for Platform Admin authorization.
    Strictly verifies Firebase token signature, exact authorized identity (ayan090912@gmail.com),
    and assigns server-side verified claims.
    """
    settings = get_settings()

    token: Optional[str] = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    else:
        # Fallback header check
        auth_header = request.headers.get("Authorization") or request.headers.get("X-Firebase-ID-Token")
        if auth_header:
            if auth_header.startswith("Bearer "):
                token = auth_header.split("Bearer ")[1].strip()
            else:
                token = auth_header.strip()

    if not token:
        raise AuthenticationError("Authorization header with Bearer token is required for Platform Admin access.")

    # 1. Verify token signature and claims via Firebase Admin SDK
    try:
        claims = verify_firebase_id_token(token)
    except ValueError as e:
        raise AuthenticationError(f"Invalid or expired authentication token: {str(e)}")

    uid = claims.get("uid") or claims.get("user_id") or claims.get("sub")
    email = (claims.get("email") or "").strip().lower()

    if not uid:
        raise AuthenticationError("Token payload missing valid user identity (UID).")

    # 2. Strict Allowlist Comparison
    # Normalize: strip whitespace and lowercase. Exact string comparison only.
    is_authorized = email in PLATFORM_ADMIN_ALLOWED_EMAILS

    # Strongest Security Boundary Check: Reject any other email or account attempting admin access
    if not is_authorized:
        raise RBACError("Forbidden: Access Denied.")

    # Set custom claim for verified admin
    try:
        set_platform_admin_custom_claims(uid)
        claims["admin"] = True
        claims["role"] = "PLATFORM_ADMIN"
    except Exception:
        claims["admin"] = True
        claims["role"] = "PLATFORM_ADMIN"

    return claims


async def require_platform_admin(
    admin_claims: Dict[str, Any] = Depends(get_current_firebase_admin)
) -> Dict[str, Any]:
    """
    Dependency requiring verified Platform Admin credentials.
    Returns the verified admin claims object.
    """
    return admin_claims


def require_permission(permission: str):
    async def _check_permission(current_user: TokenPayload = Depends(get_current_user)):
        if current_user.scope == "platform":
            if permission.startswith("platform:"):
                return current_user
            raise RBACError("Platform admin access required")

        if current_user.scope == "restaurant":
            if current_user.permissions and permission in current_user.permissions:
                return current_user
            raise RBACError(f"Missing permission: {permission}")

        raise RBACError("Invalid token scope")
    return _check_permission


def require_any_permission(permissions: List[str]):
    async def _check_permissions(current_user: TokenPayload = Depends(get_current_user)):
        if current_user.scope == "platform":
            return current_user
        if current_user.scope == "restaurant":
            if current_user.permissions and any(p in current_user.permissions for p in permissions):
                return current_user
        raise RBACError(f"Missing one of required permissions: {permissions}")
    return _check_permissions


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)
) -> TokenPayload:
    if not credentials or not credentials.credentials:
        raise AuthenticationError("Not authenticated")
    try:
        return decode_access_token(credentials.credentials)
    except Exception as e:
        raise AuthenticationError(f"Invalid access token: {str(e)}")

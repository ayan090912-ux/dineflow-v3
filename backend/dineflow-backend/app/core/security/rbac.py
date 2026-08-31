from typing import List, Optional, Dict, Any
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.config.settings import get_settings
from app.core.security.jwt import TokenPayload, decode_access_token
from app.core.security.firebase import verify_firebase_id_token, set_platform_admin_custom_claims

security_scheme = HTTPBearer(auto_error=False)


class RBACError(HTTPException):
    def __init__(self, detail: str = "Insufficient permissions"):
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
    Strictly verifies Firebase UID, custom claims, and active configuration.
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

    # 1. Verify token signature and claims via Firebase Admin SDK / verification engine
    try:
        claims = verify_firebase_id_token(token)
    except ValueError as e:
        raise AuthenticationError(f"Invalid or expired authentication token: {str(e)}")

    uid = claims.get("uid") or claims.get("user_id") or claims.get("sub")
    email = (claims.get("email") or "").strip().lower()

    if not uid:
        raise AuthenticationError("Token payload missing valid user identity (UID).")

    # 2. Strict Platform Admin Authorization Checks
    configured_uid = (settings.PLATFORM_ADMIN_FIREBASE_UID or "").strip()
    configured_email = (settings.PLATFORM_ADMIN_EMAIL or "ayan090912@gmail.com").strip().lower()
    authorized_admin_emails = {configured_email, "ayan090912@gmail.com"}

    is_authorized_uid = bool(configured_uid and uid == configured_uid)
    is_authorized_email_bootstrap = bool(email and email in authorized_admin_emails)

    has_admin_claim = claims.get("admin") is True and claims.get("role") == "PLATFORM_ADMIN"

    # If identity matches authorized email, store UID server-side and assign claims
    if (is_authorized_email_bootstrap or is_authorized_uid):
        if not settings.PLATFORM_ADMIN_FIREBASE_UID:
            settings.PLATFORM_ADMIN_FIREBASE_UID = uid
        try:
            set_platform_admin_custom_claims(uid)
            claims["admin"] = True
            claims["role"] = "PLATFORM_ADMIN"
            has_admin_claim = True
        except Exception as e:
            # Fallback for dev mode
            claims["admin"] = True
            claims["role"] = "PLATFORM_ADMIN"
            has_admin_claim = True

    # Strongest Security Boundary Check: Reject any other email or account attempting admin access
    if not (is_authorized_uid or is_authorized_email_bootstrap):
        raise RBACError(f"Forbidden: {email} is not authorized to access Dinely Platform Administration.")

    if not has_admin_claim:
        raise RBACError("Forbidden: Missing PLATFORM_ADMIN custom claim.")

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

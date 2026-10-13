from typing import List, Optional, Dict, Any
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.config.settings import get_settings
from app.core.security.jwt import TokenPayload, decode_access_token
from app.core.security.firebase import verify_firebase_id_token, set_platform_admin_custom_claims

security_scheme = HTTPBearer(auto_error=False)

# Dynamic allowlist for Dinely Platform Administrator access
def get_platform_admin_allowed_emails() -> List[str]:
    settings = get_settings()
    emails = settings.get_platform_admin_emails()
    if not emails:
        emails = ["ayan090912@gmail.com"]
    return [e.strip().lower() for e in emails if e and e.strip()]

PLATFORM_ADMIN_ALLOWED_EMAILS = get_platform_admin_allowed_emails()


async def is_platform_admin_in_db(email: str) -> bool:
    """Check if the given email is registered as an active platform admin in the database."""
    if not email:
        return False
    clean_email = email.strip().lower()
    if clean_email not in get_platform_admin_allowed_emails():
        return False
    try:
        from app.core.database.connection import get_db_session
        from app.modules.auth.models import PlatformAdmin
        from sqlalchemy import select
        async with get_db_session() as session:
            stmt = select(PlatformAdmin).where(
                PlatformAdmin.email == clean_email,
                PlatformAdmin.is_active == True
            )
            res = await session.execute(stmt)
            return res.scalar_one_or_none() is not None
    except Exception:
        return False


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
    Strictly verifies Firebase token signature, exact authorized identity,
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

    if not email:
        raise RBACError("Forbidden: Access Denied. Token does not contain an email address.")

    # 2. Strict Email verification check (Google accounts must have explicitly verified email)
    if claims.get("email_verified") is not True:
        raise RBACError("Forbidden: Access Denied. Google account email address must be verified.")

    # 3. Strict Administrator Allowlist Check (Only ayan090912@gmail.com permitted)
    allowed_list = get_platform_admin_allowed_emails()
    if email not in allowed_list:
        raise RBACError("Forbidden: Access Denied. This Google account is not authorized for Platform Admin.")

    if settings.PLATFORM_ADMIN_FIREBASE_UID:
        if uid != settings.PLATFORM_ADMIN_FIREBASE_UID:
            raise RBACError("Forbidden: Access Denied. Unauthorized administrator UID.")

    # Verified admin claims set in-memory for this request
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

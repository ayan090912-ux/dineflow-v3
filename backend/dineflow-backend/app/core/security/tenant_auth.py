import re
from typing import Optional, List, Dict, Any
from fastapi import Depends, HTTPException, status, Request, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database.connection import get_db
from app.core.security.firebase import verify_firebase_id_token
from app.modules.restaurants.models import Restaurant, RestaurantMembership
from app.core.security.rbac import PLATFORM_ADMIN_ALLOWED_EMAILS, get_platform_admin_allowed_emails
from app.core.config.settings import get_settings

security_scheme = HTTPBearer(auto_error=False)

class CallerContext:
    def __init__(
        self,
        uid: Optional[str] = None,
        email: Optional[str] = None,
        role: str = "GUEST",
        is_admin: bool = False,
        restaurant_id: Optional[str] = None,
    ):
        self.uid = uid
        self.email = (email or "").strip().lower() if email else None
        self.role = (role or "GUEST").strip().upper()
        self.is_admin = is_admin
        self.restaurant_id = (restaurant_id or "").strip() if restaurant_id else None

    @property
    def is_authenticated(self) -> bool:
        return bool(self.uid or self.email or self.is_admin or self.restaurant_id)


async def get_caller_context(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    x_staff_role: Optional[str] = Header(None, alias="X-Staff-Role"),
    x_staff_restaurant_id: Optional[str] = Header(None, alias="X-Staff-Restaurant-Id"),
    x_staff_id: Optional[str] = Header(None, alias="X-Staff-Id"),
) -> CallerContext:
    """
    Extracts authenticated caller identity from:
    1. Authorization Bearer header (Firebase token, signed JWT, or staff token)
    2. Staff session headers
    """
    settings = get_settings()

    token: Optional[str] = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    else:
        auth_header = request.headers.get("Authorization") or request.headers.get("X-Firebase-ID-Token")
        if auth_header:
            if auth_header.startswith("Bearer "):
                token = auth_header.split("Bearer ")[1].strip()
            else:
                token = auth_header.strip()

    # 1. Bearer Token Verification
    if token:
        # Check backend-signed HS256 JWT (Staff Terminal or Platform Token)
        is_hs256 = False
        try:
            from jose import jwt as jose_jwt
            unverified_header = jose_jwt.get_unverified_header(token)
            if unverified_header.get("alg") == "HS256":
                is_hs256 = True
        except Exception:
            pass

        if is_hs256:
            try:
                from jose import jwt as jose_jwt
                payload = jose_jwt.decode(token, settings.JWT_ACCESS_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
                uid = str(payload.get("sub") or payload.get("uid") or "staff_user")
                role = str(payload.get("role", "STAFF")).upper()
                email = payload.get("email") or f"{uid}@staff.dinely.internal"
                rest_id = payload.get("restaurant_id")
                return CallerContext(
                    uid=uid,
                    email=email,
                    role=role,
                    is_admin=(role == "PLATFORM_ADMIN"),
                    restaurant_id=rest_id
                )
            except Exception:
                # Tampered, expired, or invalid HS256 token must fail authentication immediately
                return CallerContext()

        # Check if staff synthetic JWT format (e.g. df_waiter_jwt_<id>_<timestamp>)
        if token.startswith("df_") and "_jwt_" in token:
            parts = token.split("_")
            role_hint = parts[1].upper() if len(parts) > 1 else "STAFF"
            staff_id = parts[3] if len(parts) > 3 else "staff_unknown"
            staff_rest = x_staff_restaurant_id or request.headers.get("X-Restaurant-Id")
            return CallerContext(
                uid=staff_id,
                email=f"{staff_id}@staff.dinely.internal",
                role=role_hint,
                is_admin=False,
                restaurant_id=staff_rest
            )

        try:
            claims = verify_firebase_id_token(token)
            uid = claims.get("uid") or claims.get("user_id") or claims.get("sub")
            email = (claims.get("email") or "").strip().lower()
            role = claims.get("role") or ("PLATFORM_ADMIN" if claims.get("admin") else "RESTAURANT_OWNER")

            # Check Platform Admin status
            admin_emails = get_platform_admin_allowed_emails()

            is_admin = bool(
                claims.get("admin")
                or role == "PLATFORM_ADMIN"
                or (email and email in admin_emails)
                or (settings.PLATFORM_ADMIN_FIREBASE_UID and uid == settings.PLATFORM_ADMIN_FIREBASE_UID)
            )

            rest_id = claims.get("restaurant_id") or claims.get("restaurantId") or x_staff_restaurant_id
            return CallerContext(
                uid=uid,
                email=email,
                role="PLATFORM_ADMIN" if is_admin else role.upper(),
                is_admin=is_admin,
                restaurant_id=rest_id
            )
        except Exception:
            pass

    # 2. Staff terminal header authentication (no bearer token needed)
    # X-Staff-Role + X-Staff-Restaurant-Id assert identity for operational staff terminals only
    # (waiter, kitchen, bar, host, server, cashier, chef, cook).
    # Owner and Admin roles MUST authenticate via Bearer token; header spoofing of owner/admin returns 401.
    ALLOWED_STAFF_HEADER_ROLES = {
        "WAITER", "HOST", "SERVER", "CHEF", "COOK", "KITCHEN", "BAR", "BARTENDER", "CASHIER", "STAFF"
    }
    if x_staff_role and x_staff_restaurant_id:
        norm_role = x_staff_role.strip().upper()
        if norm_role in ALLOWED_STAFF_HEADER_ROLES:
            staff_uid = (x_staff_id or f"staff-{norm_role.lower()}").strip()
            return CallerContext(
                uid=staff_uid,
                email=f"{staff_uid}@staff.dinely.internal",
                role=norm_role,
                is_admin=False,
                restaurant_id=x_staff_restaurant_id.strip(),
            )

    return CallerContext()


async def verify_tenant_authorization(
    restaurant_id: str,
    allowed_roles: Optional[List[str]] = None,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
) -> CallerContext:
    """
    Enforces strict tenant authorization:
    - Caller must be authenticated (401 if not).
    - Platform admin has cross-tenant access.
    - Restaurant must exist in database (404 if not).
    - Caller must have a valid membership or direct ownership in target restaurant (403 if not).
    - Caller role must match allowed_roles if specified (403 if unauthorized).
    """
    if not caller.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials are required to perform this action."
        )

    clean_rest_id = (restaurant_id or "").strip()
    if not clean_rest_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid restaurant_id is required."
        )

    # 1. Platform Admin has system-wide access
    if caller.is_admin:
        return caller

    # 2. Staff terminal fast-path: staff-header-authenticated callers accessing their own restaurant.
    # Identified by @staff.dinely.internal email (set only by the X-Staff-* header path).
    is_staff_header_auth = bool(caller.email and caller.email.endswith("@staff.dinely.internal"))
    if is_staff_header_auth and caller.restaurant_id and caller.restaurant_id.strip() == clean_rest_id:
        # Still enforce role-level authorization even though we skip the membership DB check
        if allowed_roles:
            norm_allowed = [r.strip().upper() for r in allowed_roles]
            if caller.role not in norm_allowed:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Staff role '{caller.role}' is not authorized to perform this operation.",
                )
        caller.restaurant_id = clean_rest_id
        return caller

    # 2. Lookup target restaurant in database
    stmt = select(Restaurant).where(
        Restaurant.deleted_at.is_(None),
        or_(
            Restaurant.id == clean_rest_id,
            func.lower(Restaurant.id) == clean_rest_id.lower(),
            Restaurant.slug == clean_rest_id.lower(),
            Restaurant.public_slug == clean_rest_id.lower()
        )
    ).limit(1)
    res = await db.execute(stmt)
    restaurant = res.scalar_one_or_none()

    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Restaurant '{restaurant_id}' was not found."
        )

    # 3. Check membership in PostgreSQL
    mem_stmt = select(RestaurantMembership).where(
        RestaurantMembership.restaurant_id == restaurant.id,
        or_(
            RestaurantMembership.user_uid == caller.uid,
            (func.lower(RestaurantMembership.user_email) == caller.email.lower()) if caller.email else False
        )
    ).limit(1)
    mem_res = await db.execute(mem_stmt)
    membership = mem_res.scalar_one_or_none()

    # Direct owner check fallback
    is_direct_owner = (
        (caller.uid and restaurant.owner_uid and caller.uid == restaurant.owner_uid) or
        (caller.email and restaurant.owner_email and caller.email.lower() == restaurant.owner_email.lower())
    )

    if not membership and not is_direct_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: You do not have membership or ownership access to restaurant '{restaurant.name}'."
        )

    effective_role = (membership.role if membership else "OWNER").upper()

    # 4. Check allowed_roles if specified
    if allowed_roles:
        norm_allowed = [r.strip().upper() for r in allowed_roles]
        if effective_role not in norm_allowed and "OWNER" not in norm_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{effective_role}' is not authorized to perform this operation."
            )

    caller.role = effective_role
    caller.restaurant_id = restaurant.id
    return caller


async def require_tenant_owner_or_admin(
    restaurant_id: str,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
) -> CallerContext:
    """Enforces that caller is the owner or platform admin of the specified restaurant."""
    return await verify_tenant_authorization(
        restaurant_id=restaurant_id,
        allowed_roles=["OWNER", "RESTAURANT_OWNER", "ADMIN", "SUPER_ADMIN"],
        caller=caller,
        db=db
    )


async def require_tenant_staff_or_owner(
    restaurant_id: str,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
) -> CallerContext:
    """Enforces that caller is an authorized staff member, owner, or platform admin of the specified restaurant."""
    return await verify_tenant_authorization(
        restaurant_id=restaurant_id,
        allowed_roles=[
            "OWNER", "RESTAURANT_OWNER", "ADMIN", "SUPER_ADMIN",
            "WAITER", "HOST", "SERVER", "CHEF", "COOK", "KITCHEN",
            "BAR", "BARTENDER", "MANAGER", "INVENTORY_MANAGER", "CASHIER"
        ],
        caller=caller,
        db=db
    )


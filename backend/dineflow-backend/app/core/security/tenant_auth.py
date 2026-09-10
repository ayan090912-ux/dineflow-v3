import re
from typing import Optional, List, Dict, Any
from fastapi import Depends, HTTPException, status, Request, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database.connection import get_db
from app.core.security.firebase import verify_firebase_id_token
from app.modules.restaurants.models import Restaurant
from app.core.security.rbac import PLATFORM_ADMIN_ALLOWED_EMAILS
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
            admin_emails = [e.lower() for e in PLATFORM_ADMIN_ALLOWED_EMAILS]
            if settings.PLATFORM_ADMIN_EMAIL:
                admin_emails.append(settings.PLATFORM_ADMIN_EMAIL.strip().lower())

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

    # 2. Staff Session Header Verification (only honored with token)
    if (x_staff_role or x_staff_restaurant_id) and token:
        norm_role = (x_staff_role or "WAITER").strip().upper()
        return CallerContext(
            uid=x_staff_id or f"staff-{x_staff_restaurant_id}",
            email=None,
            role=norm_role,
            is_admin=False,
            restaurant_id=x_staff_restaurant_id
        )

    return CallerContext()


async def verify_tenant_authorization(
    restaurant_id: str,
    allowed_roles: Optional[List[str]] = None,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
) -> CallerContext:
    """
    Enforces strict tenant authorization for mutating operations:
    - Caller must be authenticated (401 if not).
    - Platform admin has cross-tenant access.
    - Restaurant owner must own the restaurant (403 if UID/email mismatch).
    - Staff must belong to the exact target restaurant_id (403 if mismatch).
    - Caller's role must be in allowed_roles if specified (403 if unauthorized).
    """
    if not caller.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials are required to perform this action."
        )

    # 1. Platform Admin has system-wide access
    if caller.is_admin:
        return caller

    clean_rest_id = (restaurant_id or "").strip()
    if not clean_rest_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid restaurant_id is required."
        )

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

    # 3. Role authorization check if restricted
    if allowed_roles:
        norm_allowed = [r.strip().upper() for r in allowed_roles]
        if caller.role not in norm_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{caller.role}' is not authorized to perform this operation."
            )

    # 4. Check Owner access
    if caller.role in ["OWNER", "RESTAURANT_OWNER", "ADMIN"]:
        is_owner = False
        if caller.uid and restaurant.owner_uid and caller.uid == restaurant.owner_uid:
            is_owner = True
        elif caller.email and restaurant.owner_email and caller.email.lower() == restaurant.owner_email.lower():
            is_owner = True

        if not is_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: You do not have ownership access to restaurant '{restaurant_id}'."
            )
        return caller

    # 5. Check Staff access
    if caller.role in ["WAITER", "CHEF", "COOK", "KITCHEN", "BARTENDER", "BAR", "MANAGER", "INVENTORY_MANAGER", "CASHIER", "HOST", "SERVER"]:
        if not caller.restaurant_id or (
            caller.restaurant_id != restaurant.id and
            caller.restaurant_id.lower() != (restaurant.slug or "").lower() and
            caller.restaurant_id.lower() != (restaurant.public_slug or "").lower()
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Staff member is assigned to a different restaurant."
            )
        return caller

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Forbidden: Access Denied"
    )


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


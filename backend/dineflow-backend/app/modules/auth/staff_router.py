import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from jose import jwt

from app.core.database.connection import get_db
from app.core.config.settings import get_settings
from app.core.security.password import verify_password
from app.core.security.tenant_auth import get_caller_context, CallerContext
from app.modules.restaurants.models import Restaurant, RestaurantMembership

router = APIRouter()

def get_portal_for_role(role: str) -> str:
    r = (role or "").strip().upper()
    if r in ["WAITER", "SERVER", "HOST", "FLOOR_STAFF"]:
        return "waiter"
    if r in ["KITCHEN", "CHEF", "COOK", "KDS"]:
        return "kitchen"
    if r in ["BAR", "BARTENDER"]:
        return "bar"
    if r in ["INVENTORY", "STOCK_MANAGER", "INVENTORY_MANAGER"]:
        return "inventory"
    if r in ["CASHIER", "BILLING"]:
        return "billing"
    if r in ["MANAGER", "OWNER", "RESTAURANT_OWNER"]:
        return "restaurant"
    return "waiter"

def get_target_route_for_role(role: str) -> str:
    portal = get_portal_for_role(role)
    routes = {
        "waiter": "/waiter",
        "kitchen": "/kitchen",
        "bar": "/bar",
        "inventory": "/inventory",
        "billing": "/billing",
        "restaurant": "/restaurant/dashboard",
    }
    return routes.get(portal, "/waiter")

def get_permissions_for_role(role: str) -> List[str]:
    r = (role or "").strip().upper()
    perms = {
        "WAITER": ["orders:read", "orders:create", "tables:read", "tables:manage", "customer_requests:handle"],
        "KITCHEN": ["orders:read", "orders:update_prep_status", "kds:access"],
        "CHEF": ["orders:read", "orders:update_prep_status", "kds:access"],
        "BAR": ["orders:read", "orders:update_bar_status", "bar:access"],
        "BARTENDER": ["orders:read", "orders:update_bar_status", "bar:access"],
        "INVENTORY": ["inventory:read", "inventory:update", "suppliers:read"],
        "CASHIER": ["billing:read", "billing:settle", "tables:read"],
        "MANAGER": ["orders:read", "orders:manage", "tables:manage", "staff:read", "billing:manage", "kds:access"],
    }
    return perms.get(r, ["orders:read"])


class StaffLoginRequest(BaseModel):
    username: str = Field(..., min_length=2, description="Staff unique username")
    password: str = Field(..., min_length=1, description="Staff account password")


class StaffContextResponse(BaseModel):
    staff_user_id: str
    username: str
    name: str
    email: Optional[str] = None
    restaurant_id: str
    restaurant_name: str
    restaurant_slug: str
    role: str
    terminal_id: str
    terminal_name: str
    permissions: List[str]
    status: str
    portal: str
    target_route: str
    user: Dict[str, Any]


class StaffLoginResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int = 86400
    staff_user_id: str
    username: str
    name: str
    restaurant_id: str
    restaurant_name: str
    restaurant_slug: str
    role: str
    terminal_id: str
    terminal_name: str
    permissions: List[str]
    status: str
    portal: str
    target_route: str
    user: Dict[str, Any]


@router.post("/login", response_model=StaffLoginResponse)
async def staff_login(
    payload: StaffLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    settings = get_settings()
    clean_username = payload.username.strip().lower()

    if not clean_username or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required."
        )

    # 1. Lookup staff member by normalized username
    stmt = select(RestaurantMembership).where(
        RestaurantMembership.username.is_not(None),
        func.lower(RestaurantMembership.username) == clean_username
    ).limit(1)
    res = await db.execute(stmt)
    member = res.scalar_one_or_none()

    # Fallback lookup: check user_email prefix if username not set
    if not member:
        stmt_email = select(RestaurantMembership).where(
            or_(
                func.lower(RestaurantMembership.user_email) == f"{clean_username}@staff.dinely.internal",
                func.lower(RestaurantMembership.user_email) == clean_username,
            )
        ).limit(1)
        res_email = await db.execute(stmt_email)
        member = res_email.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password."
        )

    # 2. Check if account is active
    if member.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff account is deactivated. Please contact your restaurant manager."
        )

    # 3. Verify password hash using Argon2id
    if not member.password_hash or not verify_password(payload.password, member.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password."
        )

    # 4. Resolve Restaurant
    r_stmt = select(Restaurant).where(
        Restaurant.id == member.restaurant_id,
        Restaurant.deleted_at.is_(None)
    )
    r_res = await db.execute(r_stmt)
    rest = r_res.scalar_one_or_none()

    if not rest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assigned restaurant was not found."
        )

    if rest.lifecycle_status in ["ARCHIVED", "DEACTIVATED"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Restaurant '{rest.name}' is archived. Staff cannot log in."
        )

    # 5. Secure Tenant Authority Check (if accessing via tenant subdomain)
    req_host = (
        request.headers.get("x-tenant-domain")
        or request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or ""
    ).strip().lower()
    
    clean_host = req_host.split(":")[0].strip()
    if clean_host.endswith(".dinely.food") and not clean_host.startswith("www."):
        tenant_slug = clean_host[:-len(".dinely.food")].strip()
        if tenant_slug and tenant_slug != "app" and tenant_slug != "api":
            # Match against restaurant slug or id
            if rest.slug != tenant_slug and (rest.public_slug or "") != tenant_slug and rest.id != tenant_slug:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied: Staff member '{clean_username}' belongs to '{rest.name}', not the requested domain."
                )

    # 6. Resolve role, terminal assignment, and portal
    role = (member.role or "WAITER").strip().upper()
    assigned_term = (member.assigned_terminal or f"{role}-01").strip().upper()
    display_name = member.full_name or clean_username.title()
    portal = get_portal_for_role(role)
    target_route = get_target_route_for_role(role)

    # 7. Generate Signed HS256 JWT
    now_utc = datetime.now(timezone.utc)
    expires = now_utc + timedelta(hours=24)

    token_claims = {
        "sub": member.user_uid,
        "uid": member.user_uid,
        "staff_user_id": member.user_uid,
        "username": member.username or clean_username,
        "name": display_name,
        "email": member.user_email,
        "role": role,
        "restaurant_id": rest.id,
        "restaurant_slug": rest.slug,
        "terminal": assigned_term,
        "terminal_id": assigned_term,
        "scope": "STAFF",
        "type": "access",
        "pw_sig": member.password_hash[-8:] if member.password_hash else "",
        "iat": int(now_utc.timestamp()),
        "exp": int(expires.timestamp()),
    }

    signed_token = jwt.encode(
        token_claims,
        settings.JWT_ACCESS_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )

    user_payload = {
        "id": member.user_uid,
        "staff_user_id": member.user_uid,
        "username": member.username or clean_username,
        "name": display_name,
        "email": member.user_email,
        "role": role,
        "restaurantId": rest.id,
        "restaurant_id": rest.id,
        "restaurant_name": rest.name,
        "restaurant_slug": rest.slug,
        "terminal": assigned_term,
        "terminal_id": assigned_term,
        "status": "ACTIVE",
    }

    return StaffLoginResponse(
        access_token=signed_token,
        token_type="Bearer",
        expires_in=86400,
        staff_user_id=member.user_uid,
        username=member.username or clean_username,
        name=display_name,
        restaurant_id=rest.id,
        restaurant_name=rest.name,
        restaurant_slug=rest.slug,
        role=role,
        terminal_id=assigned_term,
        terminal_name=assigned_term,
        permissions=get_permissions_for_role(role),
        status="ACTIVE",
        portal=portal,
        target_route=target_route,
        user=user_payload,
    )


@router.get("/me", response_model=StaffContextResponse)
async def staff_auth_me(
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    if not caller.is_authenticated or not caller.uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: No valid staff session token provided."
        )

    # Lookup membership by user_uid
    stmt = select(RestaurantMembership).where(
        RestaurantMembership.user_uid == caller.uid
    ).limit(1)
    res = await db.execute(stmt)
    member = res.scalar_one_or_none()

    if not member and caller.email:
        stmt_em = select(RestaurantMembership).where(
            func.lower(RestaurantMembership.user_email) == caller.email.lower()
        ).limit(1)
        res_em = await db.execute(stmt_em)
        member = res_em.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Staff record not found."
        )

    if member.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff account has been deactivated."
        )

    # Invalidate stale session if password was changed after token was issued
    if caller.pw_sig and member.password_hash:
        expected_sig = member.password_hash[-8:]
        if caller.pw_sig != expected_sig:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired: Account password was recently updated. Please log in again."
            )
    elif caller.iat and member.updated_at:
        up_ts = member.updated_at.timestamp() if hasattr(member.updated_at, 'timestamp') else None
        if up_ts and up_ts > (caller.iat + 2):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired: Account password was recently updated. Please log in again."
            )

    r_stmt = select(Restaurant).where(
        Restaurant.id == member.restaurant_id,
        Restaurant.deleted_at.is_(None)
    )
    r_res = await db.execute(r_stmt)
    rest = r_res.scalar_one_or_none()

    if not rest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found."
        )

    role = (member.role or caller.role or "WAITER").strip().upper()
    assigned_term = (member.assigned_terminal or getattr(caller, "terminal", None) or f"{role}-01").strip().upper()
    display_name = member.full_name or (member.username or "Staff").title()
    portal = get_portal_for_role(role)
    target_route = get_target_route_for_role(role)

    user_payload = {
        "id": member.user_uid,
        "staff_user_id": member.user_uid,
        "username": member.username or caller.email or "",
        "name": display_name,
        "email": member.user_email,
        "role": role,
        "restaurantId": rest.id,
        "restaurant_id": rest.id,
        "restaurant_name": rest.name,
        "restaurant_slug": rest.slug,
        "terminal": assigned_term,
        "terminal_id": assigned_term,
        "status": "ACTIVE" if member.is_active else "INACTIVE",
    }

    return StaffContextResponse(
        staff_user_id=member.user_uid,
        username=member.username or "",
        name=display_name,
        email=member.user_email,
        restaurant_id=rest.id,
        restaurant_name=rest.name,
        restaurant_slug=rest.slug,
        role=role,
        terminal_id=assigned_term,
        terminal_name=assigned_term,
        permissions=get_permissions_for_role(role),
        status="ACTIVE" if member.is_active else "INACTIVE",
        portal=portal,
        target_route=target_route,
        user=user_payload,
    )


@router.post("/logout")
async def staff_logout():
    return {"status": "success", "message": "Staff session successfully logged out"}

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.connection import get_db
from app.modules.auth.schemas import (
    PlatformAdminLoginRequest,
    StaffLoginRequest,
    StaffRegisterRequest,
    CustomerSessionRequest,
    OTPRequest,
    OTPVerifyRequest,
    TokenRefreshRequest,
    TokenResponse,
    PlatformAdminResponse,
    StaffUserResponse,
    AuthMeResponse
)
from app.modules.auth.service import AuthService

router = APIRouter()


@router.post("/platform/login", response_model=TokenResponse)
async def platform_admin_login(
    request: Request,
    login_data: PlatformAdminLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    # Platform Admin strictly mandates cryptographic Google Firebase Authentication
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Password authentication is disabled for Platform Admin. Authenticate using authorized Google credentials via /api/v1/admin/verify-token."
    )


from datetime import datetime, timedelta, timezone
import uuid
from jose import jwt
from sqlalchemy import select, or_
from app.core.config.settings import get_settings
from app.modules.restaurants.models import Restaurant
from app.modules.auth.schemas import (
    TerminalLoginRequest,
    TerminalLoginResponse,
    TerminalUserPayload,
)

@router.post("/terminal-login", response_model=TerminalLoginResponse)
@router.post("/staff/login", response_model=TerminalLoginResponse)
async def terminal_login(
    payload: TerminalLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    settings = get_settings()
    clean_rest_id = (payload.restaurant_id or "").strip()
    if not clean_rest_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="restaurant_id is required for terminal login."
        )

    # 1. Look up target restaurant
    stmt = select(Restaurant).where(
        Restaurant.deleted_at.is_(None),
        or_(
            Restaurant.id == clean_rest_id,
            Restaurant.slug == clean_rest_id.lower(),
            Restaurant.public_slug == clean_rest_id.lower(),
        )
    )
    res_r = await db.execute(stmt)
    rest = res_r.scalar_one_or_none()
    if not rest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Restaurant '{clean_rest_id}' not found."
        )

    if rest.lifecycle_status in ["ARCHIVED", "DEACTIVATED"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Restaurant '{clean_rest_id}' is archived and terminals cannot log in."
        )

    role_candidate = (payload.role or "STAFF").strip().upper()
    if role_candidate in ["OWNER", "RESTAURANT_OWNER", "ADMIN", "PLATFORM_ADMIN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative and Owner accounts cannot authenticate via terminal PIN. Authenticate using authorized Google credentials."
        )

    ALLOWED_STAFF_ROLES = {"KITCHEN", "CHEF", "COOK", "WAITER", "SERVER", "HOST", "BAR", "BARTENDER", "INVENTORY", "CASHIER", "STAFF"}
    if role_candidate not in ALLOWED_STAFF_ROLES:
        role_candidate = "STAFF"

    passcode = payload.passcode or payload.pin or ""
    if not passcode or len(passcode.strip()) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid staff PIN or passcode (minimum 3 characters) is required."
        )

    ident = (payload.identifier or f"{role_candidate.lower()}_station").strip()
    sub_id = f"staff_{role_candidate.lower()}_{uuid.uuid4().hex[:8]}"
    email = f"{ident.lower().replace(' ', '_')}@staff.dinely.internal"

    now_utc = datetime.now(timezone.utc)
    expires = now_utc + timedelta(hours=24)

    token_claims = {
        "sub": sub_id,
        "uid": sub_id,
        "email": email,
        "role": role_candidate,
        "restaurant_id": rest.id,
        "scope": "STAFF",
        "type": "access",
        "iat": int(now_utc.timestamp()),
        "exp": int(expires.timestamp()),
    }

    signed_token = jwt.encode(
        token_claims,
        settings.JWT_ACCESS_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )

    return TerminalLoginResponse(
        access_token=signed_token,
        token_type="Bearer",
        expires_in=86400,
        restaurant_id=rest.id,
        role=role_candidate,
        user=TerminalUserPayload(
            id=sub_id,
            role=role_candidate,
            restaurantId=rest.id,
            name=ident.replace("_", " ").title(),
            email=email,
        )
    )


@router.post("/customer/session", response_model=TokenResponse)
async def customer_session(
    request: Request,
    session_data: CustomerSessionRequest,
    db: AsyncSession = Depends(get_db)
):
    # TODO: Implement customer session
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Customer session coming in Sprint 1")


@router.post("/customer/otp/request")
async def request_otp(
    request: Request,
    otp_data: OTPRequest,
    db: AsyncSession = Depends(get_db)
):
    # TODO: Implement OTP request
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="OTP coming in Sprint 1")


@router.post("/customer/otp/verify")
async def verify_otp(
    request: Request,
    otp_data: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db)
):
    # TODO: Implement OTP verify
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="OTP coming in Sprint 1")


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_data: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db)
):
    service = AuthService(db)
    try:
        access_token, refresh_token = await service.refresh_token(refresh_data.refresh_token)
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=900
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    refresh_data: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db)
):
    service = AuthService(db)
    await service.logout(refresh_data.refresh_token)
    return None


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
    refresh_data: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db)
):
    # TODO: Implement logout-all
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Logout-all coming in Sprint 1")


from app.core.security.tenant_auth import get_caller_context, CallerContext
from app.modules.restaurants.models import RestaurantMembership
from sqlalchemy import func

@router.get("/me")
@router.post("/me")
async def get_auth_me(
    request: Request,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    if not caller.is_authenticated or (not caller.uid and not caller.email):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: No valid session token provided."
        )

    target_email = (caller.email or "").strip().lower()
    target_uid = (caller.uid or "").strip()

    # Query all memberships
    mem_conditions = []
    if target_uid:
        mem_conditions.append(RestaurantMembership.user_uid == target_uid)
    if target_email:
        mem_conditions.append(func.lower(RestaurantMembership.user_email) == target_email)

    memberships_list = []
    mem_rest_ids = []
    if mem_conditions:
        mem_stmt = select(RestaurantMembership).where(or_(*mem_conditions))
        mem_res = await db.execute(mem_stmt)
        for m in mem_res.scalars().all():
            memberships_list.append({
                "id": m.id,
                "restaurant_id": m.restaurant_id,
                "user_uid": m.user_uid,
                "user_email": m.user_email,
                "role": m.role,
            })
            mem_rest_ids.append(m.restaurant_id)

    # Query all accessible restaurants
    rest_conditions = []
    if target_email:
        rest_conditions.append(func.lower(Restaurant.owner_email) == target_email)
    if target_uid:
        rest_conditions.append(Restaurant.owner_uid == target_uid)
    if mem_rest_ids:
        rest_conditions.append(Restaurant.id.in_(mem_rest_ids))

    restaurants_list = []
    if rest_conditions:
        q_rests = select(Restaurant).where(
            or_(*rest_conditions),
            Restaurant.deleted_at.is_(None)
        ).order_by(Restaurant.created_at.desc())
        r_res = await db.execute(q_rests)
        for r in r_res.scalars().all():
            restaurants_list.append({
                "id": r.id,
                "name": r.name,
                "slug": r.slug,
                "publicSlug": r.public_slug or r.slug,
                "status": r.status,
                "lifecycleStatus": r.lifecycle_status,
                "isApproved": r.is_approved,
                "ownerEmail": r.owner_email,
                "ownerUid": r.owner_uid,
                "businessType": r.business_type,
            })

    # Resolve active/current restaurant context
    current_restaurant = None
    req_host = request.headers.get("x-tenant-domain") or request.headers.get("x-forwarded-host") or request.headers.get("host")
    req_slug = request.headers.get("x-tenant-slug")
    if req_slug:
        current_restaurant = next((r for r in restaurants_list if (r.get("slug") == req_slug or r.get("publicSlug") == req_slug or r.get("id") == req_slug)), None)
    if not current_restaurant and req_host:
        clean_h = req_host.split(":")[0].strip().lower()
        if clean_h.endswith(".dinely.food"):
            sub_slug = clean_h[:-len(".dinely.food")].strip()
            current_restaurant = next((r for r in restaurants_list if (r.get("slug") == sub_slug or r.get("publicSlug") == sub_slug or r.get("id") == sub_slug)), None)

    if not current_restaurant and restaurants_list:
        current_restaurant = next((r for r in restaurants_list if r.get("lifecycleStatus") == "LIVE" or r.get("isApproved")), restaurants_list[0])

    return {
        "id": caller.uid or "usr-anon",
        "uid": caller.uid or "usr-anon",
        "email": caller.email or "",
        "role": caller.role,
        "isAdmin": caller.is_admin,
        "is_admin": caller.is_admin,
        "user": {
            "id": caller.uid or "usr-anon",
            "email": caller.email or "",
            "name": (caller.email.split("@")[0] if caller.email else "User").replace(".", " ").title(),
            "role": caller.role,
        },
        "memberships": memberships_list,
        "restaurants": restaurants_list,
        "restaurant": current_restaurant,
        "restaurant_id": current_restaurant["id"] if current_restaurant else caller.restaurant_id,
        "status": "authenticated",
    }

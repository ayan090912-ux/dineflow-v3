import re
from enum import Enum
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func

from app.modules.restaurants.models import Restaurant, RestaurantDomain, RestaurantMembership


class TenantResolutionMode(str, Enum):
    PUBLIC_TENANT = "PUBLIC_TENANT"
    OWNER_PLATFORM = "OWNER_PLATFORM"


class ResolvedTenantContext(BaseModel):
    restaurant_id: str
    name: str
    slug: str
    public_slug: str
    public_domain: str
    lifecycle_status: str
    status: str
    is_approved: bool
    role: Optional[str] = None
    user_uid: Optional[str] = None
    user_email: Optional[str] = None
    accessible_restaurants: Optional[List[Dict[str, Any]]] = None
    raw_restaurant: Optional[Dict[str, Any]] = None


PLATFORM_DOMAINS = {
    "dinely.food",
    "www.dinely.food",
    "dinely-cd6cd.web.app",
    "dinely-cd6cd.firebaseapp.com",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
}

RESERVED_SUBDOMAINS = {
    "www",
    "app",
    "api",
    "platform",
    "admin",
    "staging",
    "dev",
    "control",
    "dashboard",
    "auth",
    "mail",
    "status",
}

HOSTNAME_REGEX = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$")


async def resolve_public_tenant(
    db: AsyncSession,
    hostname: Optional[str] = None,
    slug: Optional[str] = None,
    allow_platform_root: bool = False
) -> Optional[ResolvedTenantContext]:
    """
    Public Tenant Resolver:
    hostname -> restaurant_domains -> restaurant_id
    or
    slug -> public_slug -> restaurant_id

    Returns ResolvedTenantContext if found.
    If platform root domain and allow_platform_root=True, returns None.
    If unknown public tenant, raises 404 Not Found.
    """
    clean_host: Optional[str] = None
    extracted_slug: Optional[str] = None

    if hostname:
        clean_host = hostname.strip().lower()
        if ":" in clean_host:
            clean_host = clean_host.split(":")[0].strip()

        if not HOSTNAME_REGEX.match(clean_host):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Malformed hostname: '{hostname}'."
            )

        # Detect platform domain
        if clean_host in PLATFORM_DOMAINS:
            if allow_platform_root:
                return None
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Platform root domain requested without tenant context."
            )

        # Extract subdomain slug if ending in .dinely.food or .localhost
        if clean_host.endswith(".dinely.food"):
            sub = clean_host[:-len(".dinely.food")].strip()
            if sub and sub not in RESERVED_SUBDOMAINS:
                extracted_slug = sub
        elif clean_host.endswith(".localhost"):
            sub = clean_host[:-len(".localhost")].strip()
            if sub and sub not in RESERVED_SUBDOMAINS:
                extracted_slug = sub

    target_slug = (slug or extracted_slug or "").strip().lower()

    # 1. Lookup in restaurant_domains if hostname was provided
    rest: Optional[Restaurant] = None
    if clean_host:
        dom_stmt = select(RestaurantDomain).where(
            or_(
                func.lower(RestaurantDomain.hostname) == clean_host,
                func.lower(RestaurantDomain.domain) == clean_host
            ),
            or_(
                RestaurantDomain.is_verified.is_(True),
                RestaurantDomain.verification_status == "VERIFIED"
            )
        ).limit(1)
        dom_res = await db.execute(dom_stmt)
        domain_entry = dom_res.scalar_one_or_none()
        if domain_entry:
            rest_stmt = select(Restaurant).where(
                Restaurant.id == domain_entry.restaurant_id,
                Restaurant.deleted_at.is_(None)
            )
            rest_res = await db.execute(rest_stmt)
            rest = rest_res.scalar_one_or_none()

    # 2. Lookup by slug or id if not found via domain OR if domain matched an unapproved/pending record but an approved/live one exists
    if target_slug and (not rest or rest.lifecycle_status != "LIVE"):
        from sqlalchemy import case
        rest_stmt = select(Restaurant).where(
            Restaurant.deleted_at.is_(None),
            or_(
                func.lower(Restaurant.public_slug) == target_slug,
                func.lower(Restaurant.slug) == target_slug,
                Restaurant.id == target_slug
            )
        ).order_by(
            case((Restaurant.lifecycle_status == "LIVE", 1), else_=0).desc(),
            case((Restaurant.is_approved.is_(True), 1), else_=0).desc(),
            Restaurant.created_at.desc()
        ).limit(1)
        rest_res = await db.execute(rest_stmt)
        candidate_rest = rest_res.scalar_one_or_none()
        if candidate_rest and (not rest or candidate_rest.lifecycle_status == "LIVE" or candidate_rest.is_approved):
            rest = candidate_rest

    if not rest:
        identifier = clean_host or target_slug or "unknown"
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant '{identifier}' not found."
        )

    if rest.lifecycle_status in ["ARCHIVED", "DELETED", "SUSPENDED"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant '{rest.name}' is inactive."
        )

    pub_slug = rest.public_slug or rest.slug or rest.id
    canonical_domain = f"https://{pub_slug}.dinely.food"

    return ResolvedTenantContext(
        restaurant_id=rest.id,
        name=rest.name,
        slug=rest.slug,
        public_slug=pub_slug,
        public_domain=canonical_domain,
        lifecycle_status=rest.lifecycle_status or "LIVE",
        status=rest.status or "OPEN",
        is_approved=bool(rest.is_approved),
        raw_restaurant={
            "id": rest.id,
            "name": rest.name,
            "slug": rest.slug,
            "public_slug": pub_slug,
            "publicSlug": pub_slug,          # camelCase alias for frontend & tests
            "public_domain": canonical_domain,
            "publicDomain": canonical_domain,  # camelCase alias
            "domain": canonical_domain,        # short alias expected by tests
            "cuisine": rest.cuisine,
            "businessType": rest.business_type,
            "hasBar": rest.has_bar,
            "hasTables": rest.has_tables,
            "hasKitchen": rest.has_kitchen,
            "hasWaiter": rest.has_waiter,
            "hasInventory": rest.has_inventory,
            "hasBilling": rest.has_billing,
            "enabledModules": rest.enabled_modules,
            "currency": rest.currency,
            "taxPercentage": rest.tax_percentage,
            "theme": rest.theme_json,
            "is_approved": bool(rest.is_approved),
            "isApproved": bool(rest.is_approved),
            "lifecycle_status": rest.lifecycle_status or ("LIVE" if rest.is_approved else "PENDING_APPROVAL"),
            "lifecycleStatus": rest.lifecycle_status or ("LIVE" if rest.is_approved else "PENDING_APPROVAL"),
            "status": rest.status or "OPEN",
            "owner_name": rest.owner_name,
            "owner_email": rest.owner_email,
        }
    )


async def resolve_owner_tenant(
    db: AsyncSession,
    user_uid: str,
    target_restaurant_id: Optional[str] = None,
    user_email: Optional[str] = None,
    is_admin: bool = False
) -> ResolvedTenantContext:
    """
    Owner Platform Resolver:
    authenticated Firebase UID -> memberships -> restaurant_id

    Enforces:
    - User must be authenticated (401 handled before caller, but verified here).
    - Checks memberships for user_uid (and fallback owner_uid).
    - If target_restaurant_id is supplied:
        - Asserts user has valid membership (or is_admin).
        - 403 Forbidden if user does NOT belong to that restaurant.
        - 404 Not Found if restaurant does not exist.
    - NEVER uses restaurants[0] fallback.
    """
    if not user_uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required."
        )

    # 1. If target_restaurant_id is specified, verify specific tenant access
    if target_restaurant_id:
        clean_target = target_restaurant_id.strip()

        # Check if restaurant exists
        rest_stmt = select(Restaurant).where(
            Restaurant.deleted_at.is_(None),
            or_(
                Restaurant.id == clean_target,
                func.lower(Restaurant.slug) == clean_target.lower(),
                func.lower(Restaurant.public_slug) == clean_target.lower()
            )
        ).limit(1)
        rest_res = await db.execute(rest_stmt)
        restaurant = rest_res.scalar_one_or_none()

        if not restaurant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Restaurant '{target_restaurant_id}' not found."
            )

        # Platform admin bypass
        if is_admin:
            pub_slug = restaurant.public_slug or restaurant.slug or restaurant.id
            return ResolvedTenantContext(
                restaurant_id=restaurant.id,
                name=restaurant.name,
                slug=restaurant.slug,
                public_slug=pub_slug,
                public_domain=f"https://{pub_slug}.dinely.food",
                lifecycle_status=restaurant.lifecycle_status or "LIVE",
                status=restaurant.status or "OPEN",
                is_approved=bool(restaurant.is_approved),
                role="PLATFORM_ADMIN",
                user_uid=user_uid,
                user_email=user_email
            )

        # Check membership in PostgreSQL
        mem_stmt = select(RestaurantMembership).where(
            RestaurantMembership.restaurant_id == restaurant.id,
            or_(
                RestaurantMembership.user_uid == user_uid,
                (RestaurantMembership.user_email == user_email.lower()) if user_email else False
            )
        ).limit(1)
        mem_res = await db.execute(mem_stmt)
        membership = mem_res.scalar_one_or_none()

        # Fallback check on direct owner_uid / owner_email
        is_direct_owner = (
            (restaurant.owner_uid and restaurant.owner_uid == user_uid) or
            (user_email and restaurant.owner_email and restaurant.owner_email.lower() == user_email.lower())
        )

        if not membership and not is_direct_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: You do not have membership or ownership access to restaurant '{restaurant.name}'."
            )

        role = membership.role if membership else "OWNER"
        pub_slug = restaurant.public_slug or restaurant.slug or restaurant.id

        return ResolvedTenantContext(
            restaurant_id=restaurant.id,
            name=restaurant.name,
            slug=restaurant.slug,
            public_slug=pub_slug,
            public_domain=f"https://{pub_slug}.dinely.food",
            lifecycle_status=restaurant.lifecycle_status or "LIVE",
            status=restaurant.status or "OPEN",
            is_approved=bool(restaurant.is_approved),
            role=role,
            user_uid=user_uid,
            user_email=user_email
        )

    # 2. If NO target_restaurant_id specified, fetch all accessible restaurants for this user
    # Query via memberships table
    stmt = select(Restaurant, RestaurantMembership.role).join(
        RestaurantMembership,
        RestaurantMembership.restaurant_id == Restaurant.id
    ).where(
        Restaurant.deleted_at.is_(None),
        or_(
            RestaurantMembership.user_uid == user_uid,
            (RestaurantMembership.user_email == user_email.lower()) if user_email else False
        )
    )
    res = await db.execute(stmt)
    rows = res.all()

    # Also check direct owner_uid fallback in case memberships were not backfilled yet
    direct_stmt = select(Restaurant).where(
        Restaurant.deleted_at.is_(None),
        or_(
            Restaurant.owner_uid == user_uid,
            (func.lower(Restaurant.owner_email) == user_email.lower()) if user_email else False
        )
    )
    direct_res = await db.execute(direct_stmt)
    direct_rests = direct_res.scalars().all()

    combined_map: Dict[str, Dict[str, Any]] = {}
    for rest, role in rows:
        combined_map[rest.id] = {
            "id": rest.id,
            "name": rest.name,
            "slug": rest.slug,
            "publicSlug": rest.public_slug or rest.slug,
            "domain": f"https://{rest.public_slug or rest.slug}.dinely.food",
            "role": role,
            "lifecycleStatus": rest.lifecycle_status,
            "isApproved": rest.is_approved,
            "status": rest.status
        }
    for d_rest in direct_rests:
        if d_rest.id not in combined_map:
            combined_map[d_rest.id] = {
                "id": d_rest.id,
                "name": d_rest.name,
                "slug": d_rest.slug,
                "publicSlug": d_rest.public_slug or d_rest.slug,
                "domain": f"https://{d_rest.public_slug or d_rest.slug}.dinely.food",
                "role": "OWNER",
                "lifecycleStatus": d_rest.lifecycle_status,
                "isApproved": d_rest.is_approved,
                "status": d_rest.status
            }

    accessible = list(combined_map.values())

    # Never guess restaurants[0]!
    # Return context listing all accessible restaurants with empty primary ID
    return ResolvedTenantContext(
        restaurant_id="",
        name="Owner Workspace",
        slug="workspace",
        public_slug="workspace",
        public_domain="https://dinely.food/workspace",
        lifecycle_status="ACTIVE",
        status="OPEN",
        is_approved=True,
        role="OWNER",
        user_uid=user_uid,
        user_email=user_email,
        accessible_restaurants=accessible
    )


async def resolve_tenant(
    mode: TenantResolutionMode,
    db: AsyncSession,
    hostname: Optional[str] = None,
    slug: Optional[str] = None,
    user_uid: Optional[str] = None,
    user_email: Optional[str] = None,
    target_restaurant_id: Optional[str] = None,
    is_admin: bool = False,
    allow_platform_root: bool = False
) -> Optional[ResolvedTenantContext]:
    """
    Unified canonical entrypoint for tenant resolution across all of Dinely.
    """
    if mode == TenantResolutionMode.PUBLIC_TENANT:
        return await resolve_public_tenant(
            db=db,
            hostname=hostname,
            slug=slug,
            allow_platform_root=allow_platform_root
        )
    elif mode == TenantResolutionMode.OWNER_PLATFORM:
        return await resolve_owner_tenant(
            db=db,
            user_uid=user_uid or "",
            target_restaurant_id=target_restaurant_id,
            user_email=user_email,
            is_admin=is_admin
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported tenant resolution mode: {mode}"
        )

import re
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Optional, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, File, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database.connection import get_db
from app.core.security.tenant_auth import require_tenant_owner_or_admin, get_caller_context, CallerContext
from app.modules.restaurants.models import Restaurant, RestaurantLifecycleLog, RestaurantDomain, RestaurantMembership
from app.core.tenant.resolver import resolve_public_tenant, resolve_tenant, TenantResolutionMode, resolve_owner_tenant
from app.modules.restaurants.tenant_resolver import resolve_public_tenant_from_host
from app.modules.tables.models import Table
from app.modules.websocket.manager import ws_manager
from app.core.tenant.qr import generate_canonical_qr_url
from app.core.storage.provider import get_storage_provider

router = APIRouter()

async def generate_unique_public_slug(db: AsyncSession, name: str, exclude_id: Optional[str] = None) -> str:
    clean = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    if not clean:
        clean = "restaurant"
    candidate = clean
    counter = 1
    while True:
        stmt = select(Restaurant.id).where(
            or_(Restaurant.slug == candidate, Restaurant.public_slug == candidate),
            Restaurant.deleted_at.is_(None)
        )
        if exclude_id:
            stmt = stmt.where(Restaurant.id != exclude_id)
        res = await db.execute(stmt)
        if not res.scalar_one_or_none():
            return candidate
        counter += 1
        candidate = f"{clean}-{counter}"


class CreateRestaurantSchema(BaseModel):
    id: Optional[str] = None
    name: str
    cuisine: Optional[str] = "Multi-Cuisine"
    businessType: Optional[str] = "RESTAURANT"
    hasKitchen: Optional[bool] = True
    hasWaiter: Optional[bool] = True
    hasBar: Optional[bool] = True
    hasInventory: Optional[bool] = True
    hasBilling: Optional[bool] = True
    hasTables: Optional[bool] = True
    enabledModules: Optional[List[str]] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    ownerName: Optional[str] = None
    ownerEmail: Optional[str] = None
    ownerUid: Optional[str] = None
    currency: Optional[str] = "INR (₹)"
    taxPercentage: Optional[float] = 5.0
    tableCount: Optional[int] = 8
    theme: Optional[Any] = None
    lifecycleStatus: Optional[str] = None
    initialStatus: Optional[str] = None


class UpdateRestaurantSchema(BaseModel):
    name: Optional[str] = None
    cuisine: Optional[str] = None
    businessType: Optional[str] = None
    hasKitchen: Optional[bool] = None
    hasWaiter: Optional[bool] = None
    hasBar: Optional[bool] = None
    hasInventory: Optional[bool] = None
    hasBilling: Optional[bool] = None
    hasTables: Optional[bool] = None
    enabledModules: Optional[List[str]] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    ownerName: Optional[str] = None
    ownerEmail: Optional[str] = None
    ownerUid: Optional[str] = None
    lifecycleStatus: Optional[str] = None
    submittedAt: Optional[Any] = None
    currency: Optional[str] = None
    taxPercentage: Optional[float] = None
    theme: Optional[Any] = None

class WorkspaceModulesSchema(BaseModel):
    enabledModules: List[str]
    hasKitchen: Optional[bool] = None
    hasWaiter: Optional[bool] = None
    hasBar: Optional[bool] = None
    hasInventory: Optional[bool] = None
    hasBilling: Optional[bool] = None
    hasTables: Optional[bool] = None

class RestaurantSignupSchema(BaseModel):
    restaurantName: str
    ownerName: str
    email: str
    password: Optional[str] = None
    desiredSlug: Optional[str] = None
    cuisine: Optional[str] = "Multi-Cuisine"
    businessType: Optional[str] = "RESTAURANT"
    phone: Optional[str] = None
    address: Optional[str] = None
    ownerUid: Optional[str] = None

@router.get("/public/resolve")
async def resolve_public_restaurant(
    request: Request,
    hostname: Optional[str] = Query(None),
    slug: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    eff_hostname = hostname
    if not eff_hostname and not slug:
        eff_hostname = request.headers.get("x-forwarded-host") or request.headers.get("host")
    ctx = await resolve_public_tenant(db=db, hostname=eff_hostname, slug=slug, allow_platform_root=True)
    if ctx is None:
        return {"isPlatformDomain": True, "message": "Platform root context"}
    return ctx.raw_restaurant

@router.get("/public/slug/{slug}")
async def resolve_public_restaurant_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db)
):
    ctx = await resolve_public_tenant(db=db, slug=slug)
    return ctx.raw_restaurant


@router.get("/check-slug")
async def check_slug_availability(
    slug: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import RESERVED_SUBDOMAINS
    clean_slug = re.sub(r"[^a-z0-9\-]+", "-", slug.strip().lower()).strip("-")
    if not clean_slug or clean_slug in RESERVED_SUBDOMAINS:
        return {"available": False, "slug": clean_slug, "reason": "Reserved or invalid slug name"}

    stmt = select(Restaurant.id).where(
        or_(
            func.lower(Restaurant.slug) == clean_slug,
            func.lower(Restaurant.public_slug) == clean_slug
        ),
        Restaurant.deleted_at.is_(None)
    )
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        counter = 1
        while True:
            alt = f"{clean_slug}-{counter}"
            alt_res = await db.execute(select(Restaurant.id).where(
                or_(
                    func.lower(Restaurant.slug) == alt,
                    func.lower(Restaurant.public_slug) == alt
                ),
                Restaurant.deleted_at.is_(None)
            ))
            if not alt_res.scalar_one_or_none():
                break
            counter += 1
        return {"available": False, "slug": clean_slug, "suggested": alt, "reason": "Slug is already registered"}

    return {"available": True, "slug": clean_slug, "domain": f"{clean_slug}.dinely.food"}


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup_restaurant_tenant(
    payload: RestaurantSignupSchema,
    db: AsyncSession = Depends(get_db)
):
    """
    Atomic multi-tenant restaurant signup:
    1. Validates and reserves unique slug & public_slug
    2. Creates Restaurant record with LIVE status
    3. Provisions primary RestaurantDomain for <slug>.dinely.food
    4. Creates RestaurantMembership linking owner to tenant with OWNER role
    5. Seeds default MenuCategories and starter MenuItems
    6. Seeds default Tables (01-06) with tenant-scoped QR codes
    7. Generates owner JWT access token
    8. Returns tenant details and tenant dashboard URL
    """
    from app.modules.menu.models import MenuCategory, MenuItem
    from app.core.security.jwt import create_access_token
    from app.core.tenant.resolver import RESERVED_SUBDOMAINS

    clean_name = payload.restaurantName.strip()
    if not clean_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Restaurant name is required.")

    clean_email = payload.email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Valid owner email is required.")

    # 1. Determine unique slug
    has_explicit_desired_slug = bool(payload.desiredSlug and payload.desiredSlug.strip())
    base_slug = payload.desiredSlug.strip().lower() if has_explicit_desired_slug else clean_name.lower()
    clean_slug = re.sub(r"[^a-z0-9\-]+", "-", base_slug).strip("-")
    if not clean_slug or clean_slug in RESERVED_SUBDOMAINS:
        if has_explicit_desired_slug:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The slug '{base_slug}' is reserved or invalid. Please choose a different subdomain slug."
            )
        clean_slug = "venue"

    # Check if explicit desired slug is already taken
    check_stmt = select(Restaurant.id).where(
        or_(
            func.lower(Restaurant.slug) == clean_slug,
            func.lower(Restaurant.public_slug) == clean_slug
        ),
        Restaurant.deleted_at.is_(None)
    )
    res_check = await db.execute(check_stmt)
    if res_check.scalar_one_or_none():
        if has_explicit_desired_slug:
            counter = 1
            while True:
                alt = f"{clean_slug}-{counter}"
                alt_res = await db.execute(select(Restaurant.id).where(
                    or_(
                        func.lower(Restaurant.slug) == alt,
                        func.lower(Restaurant.public_slug) == alt
                    ),
                    Restaurant.deleted_at.is_(None)
                ))
                if not alt_res.scalar_one_or_none():
                    break
                counter += 1
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"The slug '{clean_slug}' is already taken. Suggested alternative: '{alt}'."
            )
        else:
            counter = 1
            while True:
                candidate_slug = f"{clean_slug}-{counter}"
                c_res = await db.execute(select(Restaurant.id).where(
                    or_(
                        func.lower(Restaurant.slug) == candidate_slug,
                        func.lower(Restaurant.public_slug) == candidate_slug
                    ),
                    Restaurant.deleted_at.is_(None)
                ))
                if not c_res.scalar_one_or_none():
                    clean_slug = candidate_slug
                    break
                counter += 1

    public_slug = clean_slug
    rest_id = f"rest-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
    domain_url = f"https://{public_slug}.dinely.food"
    user_uid = payload.ownerUid or f"owner-{uuid.uuid4().hex[:10]}"

    b_type = (payload.businessType or "RESTAURANT").upper()
    has_bar = (b_type == "BAR")
    modules = ["kitchen", "waiter", "inventory", "billing"]
    if has_bar:
        modules.append("bar")

    # 2. Create Restaurant
    new_rest = Restaurant(
        id=rest_id,
        name=clean_name,
        slug=public_slug,
        public_slug=public_slug,
        domain=domain_url,
        cuisine=payload.cuisine or "Multi-Cuisine",
        business_type=b_type,
        has_bar=has_bar,
        has_tables=True,
        has_kitchen=True,
        has_waiter=True,
        has_inventory=True,
        has_billing=True,
        enabled_modules=modules,
        order_number_prefix="#ORD",
        phone=payload.phone or "",
        email=clean_email,
        address=payload.address or "",
        owner_name=payload.ownerName.strip() or "Owner",
        owner_email=clean_email,
        owner_uid=user_uid,
        currency="INR (₹)",
        tax_percentage=5.0,
        is_approved=False,
        lifecycle_status="PENDING_APPROVAL",
        status="CLOSED",
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(new_rest)
    await db.flush()

    # 3. Create Primary Domain
    new_dom = RestaurantDomain(
        id=f"dom-{rest_id}-primary",
        restaurant_id=rest_id,
        hostname=f"{public_slug}.dinely.food",
        domain=domain_url,
        domain_type="SUBDOMAIN",
        verification_status="VERIFIED",
        is_primary=True,
        is_verified=True,
        verified_at=datetime.now(timezone.utc)
    )
    db.add(new_dom)

    # 4. Create Membership
    membership = RestaurantMembership(
        id=f"mem-{rest_id}-{uuid.uuid4().hex[:8]}",
        restaurant_id=rest_id,
        user_uid=user_uid,
        user_email=clean_email,
        role="OWNER"
    )
    db.add(membership)

    # 5. Seed default categories
    cat_starters = MenuCategory(
        id=f"cat-{rest_id}-1",
        restaurant_id=rest_id,
        name="Starters & Appetizers",
        sort_order=1,
        is_enabled=True
    )
    cat_mains = MenuCategory(
        id=f"cat-{rest_id}-2",
        restaurant_id=rest_id,
        name="Main Course",
        sort_order=2,
        is_enabled=True
    )
    cat_desserts = MenuCategory(
        id=f"cat-{rest_id}-3",
        restaurant_id=rest_id,
        name="Desserts",
        sort_order=3,
        is_enabled=True
    )
    cat_drinks = MenuCategory(
        id=f"cat-{rest_id}-4",
        restaurant_id=rest_id,
        name="Beverages & Drinks",
        sort_order=4,
        is_enabled=True
    )
    db.add_all([cat_starters, cat_mains, cat_desserts, cat_drinks])
    await db.flush()

    # 6. Seed starter menu items
    starter_items = [
        MenuItem(
            id=f"item-{rest_id}-1",
            restaurant_id=rest_id,
            category_id=cat_starters.id,
            name="Crispy Truffle Fries",
            description="Hand-cut russet potatoes tossed in black truffle oil, rosemary, and parmesan.",
            price=290.0,
            image_url="https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600",
            is_available=True,
            is_vegetarian=True,
            dietary_type="VEG",
            target_destination="KITCHEN",
            is_alcoholic=False,
            preparation_time_minutes=12
        ),
        MenuItem(
            id=f"item-{rest_id}-2",
            restaurant_id=rest_id,
            category_id=cat_mains.id,
            name="Signature Gourmet Burger",
            description="Brioche bun, prime patty, aged cheddar, caramelized balsamic onions, and garlic aioli.",
            price=480.0,
            image_url="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600",
            is_available=True,
            is_vegetarian=False,
            dietary_type="NON_VEG",
            target_destination="KITCHEN",
            is_alcoholic=False,
            preparation_time_minutes=18
        ),
        MenuItem(
            id=f"item-{rest_id}-3",
            restaurant_id=rest_id,
            category_id=cat_drinks.id,
            name="Fresh Citrus Mint Cooler",
            description="Chilled sparkling cooler infused with crushed fresh mint and Valencia orange.",
            price=190.0,
            image_url="https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600",
            is_available=True,
            is_vegetarian=True,
            dietary_type="VEG",
            target_destination="BAR" if has_bar else "KITCHEN",
            is_alcoholic=False,
            preparation_time_minutes=6
        )
    ]
    db.add_all(starter_items)

    # 7. Seed starter tables (Tables 01 to 06)
    for idx in range(1, 7):
        clean_tbl = str(idx).zfill(2)
        tbl_num = f"Table {clean_tbl}"
        t_id = f"tbl-{rest_id}-table_{clean_tbl}"
        tbl_obj = Table(
            id=t_id,
            restaurant_id=rest_id,
            table_number=tbl_num,
            section="Main Hall",
            capacity=4,
            status="AVAILABLE",
            is_occupied=False,
            qr_code_url=f"https://{public_slug}.dinely.food/customer?table={clean_tbl}&tableId={t_id}"
        )
        db.add(tbl_obj)

    # 8. Create access token
    owner_token = create_access_token(
        subject=uuid.UUID(hex=uuid.uuid4().hex),
        scope="owner",
        extra_claims={
            "sub": user_uid,
            "uid": user_uid,
            "email": clean_email,
            "role": "RESTAURANT_OWNER",
            "restaurant_id": rest_id
        }
    )

    await db.commit()
    await db.refresh(new_rest)

    asyncio.create_task(ws_manager.broadcast_global({
        "type": "APPLICATION_CREATED",
        "restaurantId": new_rest.id,
        "restaurant_id": new_rest.id,
        "restaurantName": new_rest.name,
        "ownerEmail": new_rest.owner_email,
        "lifecycleStatus": "PENDING_APPROVAL",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }))

    return {
        "status": "success",
        "message": f"Tenant '{new_rest.name}' provisioned successfully.",
        "tenant": {
            "id": new_rest.id,
            "name": new_rest.name,
            "slug": new_rest.slug,
            "publicSlug": new_rest.public_slug,
            "public_slug": new_rest.public_slug,
            "domain": new_rest.domain,
            "lifecycleStatus": new_rest.lifecycle_status,
            "isApproved": new_rest.is_approved,
            "currency": new_rest.currency,
            "taxPercentage": new_rest.tax_percentage,
            "enabledModules": new_rest.enabled_modules,
        },
        "token": owner_token,
        "dashboardUrl": f"https://{public_slug}.dinely.food/restaurant/dashboard",
        "customerMenuUrl": f"https://{public_slug}.dinely.food/customer"
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_restaurant(
    payload: CreateRestaurantSchema,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    rest_id = payload.id or f"rest-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
    public_slug = await generate_unique_public_slug(db, payload.name, rest_id)
    domain_url = f"https://{public_slug}.dinely.food"

    effective_owner_uid = payload.ownerUid or (caller.uid if caller.is_authenticated else None)
    effective_owner_email = (payload.ownerEmail or (caller.email if caller.is_authenticated else "") or "").strip().lower() or None

    query = select(Restaurant).where(Restaurant.id == rest_id)
    result = await db.execute(query)
    existing = result.scalar_one_or_none()

    if existing:
        if not existing.public_slug:
            existing.public_slug = public_slug
            existing.domain = domain_url
        if effective_owner_uid and not existing.owner_uid:
            existing.owner_uid = effective_owner_uid
        if effective_owner_email and not existing.owner_email:
            existing.owner_email = effective_owner_email
        await db.commit()
        await db.refresh(existing)
        return existing

    # Compute default enabled modules if not provided
    b_type = (payload.businessType or "RESTAURANT").upper()
    if payload.enabledModules:
        modules = payload.enabledModules
    else:
        if b_type == "FOOD_CART":
            modules = ["kitchen", "inventory", "billing"]
            if payload.hasWaiter:
                modules.append("waiter")
        elif b_type == "BAR":
            modules = ["bar", "kitchen", "waiter", "inventory", "billing"]
        else: # RESTAURANT
            modules = ["kitchen", "waiter", "inventory", "billing"]
            if payload.hasBar:
                modules.append("bar")

    has_tables = payload.hasTables if payload.hasTables is not None else (b_type != "FOOD_CART" or "waiter" in modules)

    new_rest = Restaurant(
        id=rest_id,
        name=payload.name,
        slug=public_slug,
        public_slug=public_slug,
        domain=domain_url,
        cuisine=payload.cuisine or "Multi-Cuisine",
        business_type=b_type,
        has_kitchen=payload.hasKitchen if payload.hasKitchen is not None else ("kitchen" in modules),
        has_waiter=payload.hasWaiter if payload.hasWaiter is not None else ("waiter" in modules),
        has_bar=payload.hasBar if payload.hasBar is not None else ("bar" in modules),
        has_inventory=payload.hasInventory if payload.hasInventory is not None else ("inventory" in modules),
        has_billing=payload.hasBilling if payload.hasBilling is not None else ("billing" in modules),
        has_tables=has_tables,
        enabled_modules=modules,
        phone=payload.phone,
        email=payload.email,
        address=payload.address,
        owner_name=payload.ownerName,
        owner_email=effective_owner_email,
        owner_uid=effective_owner_uid,
        currency=payload.currency or "INR (₹)",
        tax_percentage=payload.taxPercentage or 5.0,
        is_approved=False,
        lifecycle_status=(payload.lifecycleStatus or payload.initialStatus or "PENDING_APPROVAL").strip().upper(),
        submitted_at=datetime.now(timezone.utc) if (payload.lifecycleStatus or payload.initialStatus or "PENDING_APPROVAL").strip().upper() == "PENDING_APPROVAL" else None,
        status="CLOSED",
        theme_json=payload.theme or {
            "restaurantId": rest_id,
            "restaurantName": payload.name,
            "primaryColor": "#e11d48",
            "currency": payload.currency or "INR (₹)",
        }
    )
    try:
        db.add(new_rest)
        await db.flush()

        # Pre-create tables strictly for this tenant with tenant subdomain QR url
        if has_tables:
            num_tables = max(1, min(payload.tableCount or 8, 100))
            for i in range(1, num_tables + 1):
                clean_num = str(i).zfill(2)
                t_num = f"Table {clean_num}"
                t_id = f"tbl-{rest_id}-table_{clean_num}"
                db.add(Table(
                    id=t_id,
                    restaurant_id=rest_id,
                    table_number=t_num,
                    section="Main Hall" if i <= max(1, int(num_tables * 0.7)) else "Terrace",
                    capacity=4,
                    status="AVAILABLE",
                    is_occupied=False,
                    qr_code_url=generate_canonical_qr_url(public_slug, clean_num, t_id)
                ))

        # Register Canonical Primary Domain
        db.add(RestaurantDomain(
            id=f"dom-{rest_id}",
            restaurant_id=rest_id,
            hostname=f"{public_slug}.dinely.food",
            domain=f"{public_slug}.dinely.food",
            domain_type="SUBDOMAIN",
            verification_status="VERIFIED",
            is_primary=True,
            is_verified=True,
            verified_at=datetime.now(timezone.utc),
        ))

        # Register Initial Owner Membership
        owner_u = payload.ownerUid or (new_rest.owner_uid if new_rest.owner_uid else None)
        if owner_u:
            db.add(RestaurantMembership(
                id=f"mem-{rest_id}-{uuid.uuid4().hex[:6]}",
                restaurant_id=rest_id,
                user_uid=owner_u,
                user_email=new_rest.owner_email or "",
                role="OWNER"
            ))

        # Record Initial Application Lifecycle Log
        initial_log = RestaurantLifecycleLog(
            id=f"log-{rest_id}-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
            restaurant_id=rest_id,
            event_type="CREATED",
            previous_status=None,
            new_status=new_rest.lifecycle_status,
            reason="Initial restaurant onboarding draft created" if new_rest.lifecycle_status == "DRAFT" else "Initial restaurant onboarding submission",
            performed_by=new_rest.owner_email or "Owner",
            performed_at=datetime.now(timezone.utc)
        )
        db.add(initial_log)

        await db.commit()
        await db.refresh(new_rest)
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create restaurant atomically: {str(e)}"
        )

    # Realtime notification to Platform Admin if created directly in PENDING_APPROVAL
    if new_rest.lifecycle_status == "PENDING_APPROVAL":
        asyncio.create_task(ws_manager.broadcast_to_platform_admin({
            "type": "RestaurantRegistrationSubmitted",
            "restaurantId": rest_id,
            "restaurant_id": rest_id,
            "restaurantName": new_rest.name,
            "publicSlug": public_slug,
            "domain": domain_url,
            "ownerEmail": new_rest.owner_email,
            "ownerName": new_rest.owner_name,
            "businessType": new_rest.business_type,
            "lifecycleStatus": new_rest.lifecycle_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }))

    return new_rest

@router.get("")
async def get_all_restaurants(
    owner_email: Optional[str] = Query(None),
    owner_uid: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    query = select(Restaurant).where(Restaurant.deleted_at.is_(None))
    if owner_email or owner_uid:
        conditions = []
        if owner_email:
            conditions.append(func.lower(Restaurant.owner_email) == owner_email.strip().lower())
        if owner_uid:
            conditions.append(Restaurant.owner_uid == owner_uid.strip())
        query = query.where(or_(*conditions))

    result = await db.execute(query)
    rests = result.scalars().all()
    return rests

@router.get("/owner/my")
async def get_owner_restaurants(
    owner_email: Optional[str] = Query(None),
    owner_uid: Optional[str] = Query(None),
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    # Enforce strict IDOR protection: Non-admin authenticated callers cannot query another owner's tenants
    if caller.is_authenticated and not caller.is_admin:
        if owner_email and caller.email and owner_email.strip().lower() != caller.email.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Cannot query restaurants for another owner account."
            )
        if owner_uid and caller.uid and owner_uid.strip() != caller.uid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Cannot query restaurants for another owner account."
            )
        target_email = caller.email or ""
        target_uid = caller.uid or ""
    else:
        target_email = (owner_email or (caller.email if caller.is_authenticated else None) or "").strip().lower()
        target_uid = (owner_uid or (caller.uid if caller.is_authenticated else None) or "").strip()

    if not target_email and not target_uid:
        return []

    # Find restaurant IDs user has membership for
    mem_conditions = []
    if target_uid:
        mem_conditions.append(RestaurantMembership.user_uid == target_uid)
    if target_email:
        mem_conditions.append(func.lower(RestaurantMembership.user_email) == target_email)

    mem_ids_stmt = select(RestaurantMembership.restaurant_id).where(or_(*mem_conditions))
    mem_ids_res = await db.execute(mem_ids_stmt)
    mem_rest_ids = mem_ids_res.scalars().all()

    conditions = []
    if target_email:
        conditions.append(func.lower(Restaurant.owner_email) == target_email)
    if target_uid:
        conditions.append(Restaurant.owner_uid == target_uid)
    if mem_rest_ids:
        conditions.append(Restaurant.id.in_(mem_rest_ids))

    query = select(Restaurant).where(
        or_(*conditions),
        Restaurant.deleted_at.is_(None)
    ).order_by(Restaurant.created_at.desc())

    result = await db.execute(query)
    rests = result.scalars().all()
    return rests

@router.get("/{restaurant_id}")
async def get_restaurant(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    clean_id = (restaurant_id or "").strip()
    if not clean_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Restaurant ID cannot be empty"
        )
    query = select(Restaurant).where(
        or_(
            Restaurant.id == clean_id,
            func.lower(Restaurant.id) == clean_id.lower(),
            Restaurant.public_slug == clean_id.lower(),
            Restaurant.slug == clean_id.lower()
        ),
        Restaurant.deleted_at.is_(None)
    )
    result = await db.execute(query)
    rest = result.scalar_one_or_none()
    if not rest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Restaurant '{restaurant_id}' not found."
        )
    return rest

@router.get("/{restaurant_id}/owner-context")
async def get_restaurant_owner_context(
    restaurant_id: str,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    ctx = await resolve_owner_tenant(
        db=db,
        user_uid=caller.uid or "",
        target_restaurant_id=restaurant_id,
        user_email=caller.email,
        is_admin=caller.is_admin
    )
    return ctx

@router.put("/{restaurant_id}")
async def update_restaurant(
    restaurant_id: str,
    payload: UpdateRestaurantSchema,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    query = select(Restaurant).where(Restaurant.id == restaurant_id)
    result = await db.execute(query)
    rest = result.scalar_one_or_none()
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")

    if payload.name:
        rest.name = payload.name
    if payload.cuisine:
        rest.cuisine = payload.cuisine
    if payload.businessType:
        rest.business_type = payload.businessType.upper()
    if payload.hasKitchen is not None:
        rest.has_kitchen = payload.hasKitchen
    if payload.hasWaiter is not None:
        rest.has_waiter = payload.hasWaiter
    if payload.hasBar is not None:
        rest.has_bar = payload.hasBar
    if payload.hasInventory is not None:
        rest.has_inventory = payload.hasInventory
    if payload.hasBilling is not None:
        rest.has_billing = payload.hasBilling
    if payload.hasTables is not None:
        rest.has_tables = payload.hasTables
    if payload.enabledModules is not None:
        rest.enabled_modules = payload.enabledModules
    if payload.ownerName:
        rest.owner_name = payload.ownerName
    if payload.ownerEmail:
        rest.owner_email = payload.ownerEmail.strip().lower()
    if payload.ownerUid:
        rest.owner_uid = payload.ownerUid
    if payload.lifecycleStatus:
        prev_status = rest.lifecycle_status
        new_stat = payload.lifecycleStatus.upper()
        if prev_status != new_stat:
            rest.lifecycle_status = new_stat
            if new_stat == "PENDING_APPROVAL":
                rest.is_approved = False
                rest.rejection_reason = None
                rest.requested_changes = None
                rest.submitted_at = datetime.now(timezone.utc)
                event_name = "RESUBMITTED" if prev_status in ["REJECTED", "CHANGES_REQUIRED"] else "SUBMITTED"
            else:
                event_name = new_stat

            db.add(RestaurantLifecycleLog(
                id=f"log-{rest.id}-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
                restaurant_id=rest.id,
                event_type=event_name,
                previous_status=prev_status,
                new_status=new_stat,
                reason=rest.rejection_reason,
                performed_by=payload.ownerEmail or rest.owner_email or "Owner",
                performed_at=datetime.now(timezone.utc)
            ))
    if payload.submittedAt is not None and rest.lifecycle_status != "PENDING_APPROVAL":
        rest.submitted_at = datetime.now(timezone.utc)
    if payload.phone:
        rest.phone = payload.phone
    if payload.email:
        rest.email = payload.email
    if payload.address:
        rest.address = payload.address
    if payload.currency:
        rest.currency = payload.currency
    if payload.taxPercentage is not None:
        rest.tax_percentage = payload.taxPercentage
    if payload.theme is not None:
        rest.theme_json = payload.theme

    await db.commit()
    await db.refresh(rest)

    # Broadcast realtime configuration update (non-blocking)
    asyncio.create_task(ws_manager.broadcast_to_restaurant(
        restaurant_id=restaurant_id,
        message={
            "type": "WorkspaceConfigUpdated",
            "restaurantId": restaurant_id,
            "businessType": rest.business_type,
            "enabledModules": rest.enabled_modules,
            "hasKitchen": rest.has_kitchen,
            "hasWaiter": rest.has_waiter,
            "hasBar": rest.has_bar,
            "hasInventory": rest.has_inventory,
            "hasBilling": rest.has_billing,
            "hasTables": rest.has_tables,
            "lifecycleStatus": rest.lifecycle_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    ))

    if rest.lifecycle_status == "PENDING_APPROVAL":
        asyncio.create_task(ws_manager.broadcast_global({
            "type": "RestaurantRegistrationSubmitted",
            "restaurantId": rest.id,
            "restaurant_id": rest.id,
            "restaurantName": rest.name,
            "ownerEmail": rest.owner_email,
            "ownerName": rest.owner_name,
            "businessType": rest.business_type,
            "lifecycleStatus": rest.lifecycle_status,
            "isApproved": False,
            "is_approved": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }))
        asyncio.create_task(ws_manager.broadcast_to_restaurant(
            restaurant_id=restaurant_id,
            message={
                "type": "RestaurantStatusUpdated",
                "restaurantId": rest.id,
                "restaurant_id": rest.id,
                "lifecycleStatus": "PENDING_APPROVAL",
                "isApproved": False,
                "is_approved": False,
                "rejectionReason": None,
                "requestedChanges": None,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ))

    return rest

@router.patch("/{restaurant_id}/workspace-modules")
async def update_workspace_modules(
    restaurant_id: str,
    payload: WorkspaceModulesSchema,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    query = select(Restaurant).where(Restaurant.id == restaurant_id)
    result = await db.execute(query)
    rest = result.scalar_one_or_none()
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")

    modules = payload.enabledModules
    rest.enabled_modules = modules
    rest.has_kitchen = payload.hasKitchen if payload.hasKitchen is not None else ("kitchen" in modules)
    rest.has_waiter = payload.hasWaiter if payload.hasWaiter is not None else ("waiter" in modules)
    rest.has_bar = payload.hasBar if payload.hasBar is not None else ("bar" in modules)
    rest.has_inventory = payload.hasInventory if payload.hasInventory is not None else ("inventory" in modules)
    rest.has_billing = payload.hasBilling if payload.hasBilling is not None else ("billing" in modules)
    if payload.hasTables is not None:
        rest.has_tables = payload.hasTables

    await db.commit()
    await db.refresh(rest)

    # Broadcast realtime configuration update (non-blocking)
    asyncio.create_task(ws_manager.broadcast_to_restaurant(
        restaurant_id=restaurant_id,
        message={
            "type": "WorkspaceConfigUpdated",
            "restaurantId": restaurant_id,
            "businessType": rest.business_type,
            "enabledModules": rest.enabled_modules,
            "hasKitchen": rest.has_kitchen,
            "hasWaiter": rest.has_waiter,
            "hasBar": rest.has_bar,
            "hasInventory": rest.has_inventory,
            "hasBilling": rest.has_billing,
            "hasTables": rest.has_tables,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    ))

    return {
        "status": "success",
        "restaurantId": restaurant_id,
        "businessType": rest.business_type,
        "enabledModules": rest.enabled_modules,
        "hasKitchen": rest.has_kitchen,
        "hasWaiter": rest.has_waiter,
        "hasBar": rest.has_bar,
        "hasInventory": rest.has_inventory,
        "hasBilling": rest.has_billing,
        "hasTables": rest.has_tables,
    }


class SubmitRestaurantSchema(BaseModel):
    name: Optional[str] = None
    restaurantName: Optional[str] = None
    cuisine: Optional[str] = None
    businessType: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    totalTablesCount: Optional[int] = None
    enabledModules: Optional[List[str]] = None


@router.post("/{restaurant_id}/submit")
async def submit_restaurant(
    restaurant_id: str,
    payload: Optional[SubmitRestaurantSchema] = None,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Submits a restaurant application for Platform Admin review.
    Transitions lifecycle_status from DRAFT (or REJECTED upon resubmission) to PENDING_APPROVAL.
    Notifies Platform Admin in real-time over the dedicated admin channel.
    """
    query = select(Restaurant).where(Restaurant.id == restaurant_id)
    result = await db.execute(query)
    rest = result.scalar_one_or_none()

    if not rest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Restaurant '{restaurant_id}' not found."
        )

    # Idempotent: If already PENDING_APPROVAL, return current state
    if rest.lifecycle_status == "PENDING_APPROVAL":
        return rest

    # Reject submission if already approved and LIVE
    if rest.lifecycle_status == "LIVE" or rest.is_approved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Restaurant is already approved and LIVE. Cannot resubmit."
        )

    # Only DRAFT and REJECTED states can transition to PENDING_APPROVAL
    if rest.lifecycle_status not in ("DRAFT", "REJECTED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit restaurant from lifecycle status '{rest.lifecycle_status}'."
        )

    prev_status = rest.lifecycle_status
    rest.lifecycle_status = "PENDING_APPROVAL"
    rest.is_approved = False
    rest.submitted_at = datetime.now(timezone.utc)
    rest.rejection_reason = None
    rest.requested_changes = None

    # Apply any updated application details if provided in submit payload
    if payload:
        new_name = payload.restaurantName or payload.name
        if new_name:
            rest.name = new_name.strip()
        if payload.cuisine:
            rest.cuisine = payload.cuisine.strip()
        if payload.businessType:
            rest.business_type = payload.businessType.strip()
        if payload.address:
            rest.address = payload.address.strip()
        if payload.phone:
            rest.phone = payload.phone.strip()
        if payload.email:
            rest.email = payload.email.strip()
        if payload.enabledModules:
            rest.enabled_modules = payload.enabledModules

    # Record Lifecycle History in PostgreSQL
    db.add(RestaurantLifecycleLog(
        id=f"log-{rest.id}-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        restaurant_id=rest.id,
        event_type="SUBMITTED",
        previous_status=prev_status,
        new_status="PENDING_APPROVAL",
        reason="Application submitted for platform approval" if prev_status == "DRAFT" else "Application resubmitted after addressing feedback",
        performed_by=caller.email or rest.owner_email or "Owner",
        performed_at=datetime.now(timezone.utc)
    ))

    await db.commit()
    await db.refresh(rest)

    # Realtime notification to Platform Admin over dedicated admin channel
    asyncio.create_task(ws_manager.broadcast_to_platform_admin({
        "type": "RestaurantRegistrationSubmitted",
        "restaurantId": rest.id,
        "restaurant_id": rest.id,
        "restaurantName": rest.name,
        "publicSlug": rest.public_slug or rest.slug,
        "domain": rest.domain,
        "ownerEmail": rest.owner_email,
        "ownerName": rest.owner_name,
        "businessType": rest.business_type,
        "lifecycleStatus": "PENDING_APPROVAL",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }))

    # Realtime notification to Restaurant room for owner live updates
    asyncio.create_task(ws_manager.broadcast_to_restaurant(
        restaurant_id=rest.id,
        message={
            "type": "RestaurantStatusUpdated",
            "restaurantId": rest.id,
            "restaurant_id": rest.id,
            "lifecycleStatus": "PENDING_APPROVAL",
            "isApproved": False,
            "is_approved": False,
            "rejectionReason": None,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    ))

    return rest


ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/{restaurant_id}/upload-image")
async def upload_restaurant_image(
    restaurant_id: str,
    category: str = Query("menu", pattern="^(menu|branding|cover)$"),
    file: UploadFile = File(...),
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Secure, tenant-isolated image upload endpoint.
    - Validates caller authorization (cannot upload to other restaurants)
    - Validates MIME type and image magic bytes (strictly rejects SVGs, scripts, executables)
    - Enforces 5MB maximum file size
    - Stores objects with tenant-isolated paths (restaurants/{restaurant_id}/{category}/{uuid}.webp)
    """
    # 1. Resolve canonical restaurant to verify existence & tenant match
    from app.core.tenant.resolver import resolve_canonical_restaurant
    rest = await resolve_canonical_restaurant(restaurant_id, db)
    canonical_id = rest.id

    # 2. Validate declared MIME type
    content_type = (file.content_type or "").lower().strip()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type '{content_type}'. Allowed types: JPEG, PNG, WEBP. SVG is disallowed for security."
        )

    # 3. Read content and enforce size bound
    data = await file.read()
    if len(data) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of 5 MB."
        )

    if len(data) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )

    # 4. Verify image content with PIL to prevent decompression bombs & malicious polyglots
    try:
        from io import BytesIO
        from PIL import Image
        with Image.open(BytesIO(data)) as img:
            img.verify()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Corrupted or invalid image content."
        )

    # 5. Generate secure random filename and tenant-isolated folder
    ext = ALLOWED_IMAGE_TYPES[content_type]
    safe_filename = f"{uuid.uuid4().hex}{ext}"
    folder_path = f"restaurants/{canonical_id}/{category}"

    # 6. Upload via configured storage provider (S3 in production)
    storage = get_storage_provider()
    public_url = await storage.upload(file_data=data, filename=safe_filename, folder=folder_path)

    return {
        "status": "success",
        "url": public_url,
        "filename": safe_filename,
        "restaurant_id": canonical_id,
        "category": category,
        "size_bytes": len(data)
    }



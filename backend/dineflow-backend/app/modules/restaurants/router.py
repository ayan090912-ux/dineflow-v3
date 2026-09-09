import re
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Optional, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database.connection import get_db
from app.core.security.tenant_auth import require_tenant_owner_or_admin, get_caller_context, CallerContext
from app.modules.restaurants.models import Restaurant, RestaurantLifecycleLog
from app.modules.tables.models import Table
from app.modules.websocket.manager import ws_manager

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

def extract_subdomain_from_hostname(hostname: Optional[str]) -> Optional[str]:
    if not hostname:
        return None
    host = hostname.split(":")[0].strip().lower()
    if host.endswith(".dinely.food"):
        sub = host[:-len(".dinely.food")].strip()
        if sub and sub not in ("www", "app", "api", "platform", "admin", "staging"):
            return sub
    if host.endswith(".dinely.app"):
        sub = host[:-len(".dinely.app")].strip()
        if sub and sub not in ("www", "app", "api", "platform", "admin", "staging"):
            return sub
    if host.endswith(".localhost"):
        sub = host[:-len(".localhost")].strip()
        if sub and sub not in ("www", "app", "api", "platform", "admin", "staging"):
            return sub
    return None

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

@router.get("/public/resolve")
async def resolve_public_restaurant(
    hostname: Optional[str] = Query(None),
    slug: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    target_slug = slug
    if not target_slug and hostname:
        target_slug = extract_subdomain_from_hostname(hostname)

    if not target_slug:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant subdomain or slug not specified"
        )

    clean_slug = target_slug.strip().lower()
    query = select(Restaurant).where(
        or_(
            func.lower(Restaurant.public_slug) == clean_slug,
            func.lower(Restaurant.slug) == clean_slug,
            Restaurant.id == target_slug.strip()
        ),
        Restaurant.deleted_at.is_(None)
    )
    result = await db.execute(query)
    rest = result.scalar_one_or_none()

    if not rest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Restaurant '{target_slug}' not found"
        )

    pub_slug = rest.public_slug or rest.slug
    return {
        "id": rest.id,
        "name": rest.name,
        "slug": rest.slug,
        "publicSlug": pub_slug,
        "domain": rest.domain if (rest.domain and ".dinely.app" not in rest.domain) else f"https://dinely.food/customer?tenant={pub_slug}",
        "cuisine": rest.cuisine,
        "businessType": rest.business_type,
        "hasBar": rest.has_bar,
        "hasTables": rest.has_tables,
        "hasKitchen": rest.has_kitchen,
        "hasWaiter": rest.has_waiter,
        "hasInventory": rest.has_inventory,
        "hasBilling": rest.has_billing,
        "enabledModules": rest.enabled_modules,
        "phone": rest.phone,
        "email": rest.email,
        "address": rest.address,
        "currency": rest.currency,
        "taxPercentage": rest.tax_percentage,
        "isApproved": rest.is_approved,
        "lifecycleStatus": rest.lifecycle_status,
        "status": rest.status,
        "upiId": rest.upi_id,
        "upiMerchantName": rest.upi_merchant_name,
        "upiQrUrl": rest.upi_qr_url,
        "upiEnabled": rest.upi_enabled,
        "theme": rest.theme_json,
    }

@router.get("/public/slug/{slug}")
async def get_public_restaurant_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    clean_slug = slug.strip().lower()
    query = select(Restaurant).where(
        or_(
            func.lower(Restaurant.public_slug) == clean_slug,
            func.lower(Restaurant.slug) == clean_slug,
            Restaurant.id == slug.strip()
        ),
        Restaurant.deleted_at.is_(None)
    )
    result = await db.execute(query)
    rest = result.scalar_one_or_none()

    if not rest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Restaurant '{slug}' not found"
        )

    pub_slug = rest.public_slug or rest.slug
    return {
        "id": rest.id,
        "name": rest.name,
        "slug": rest.slug,
        "publicSlug": pub_slug,
        "domain": rest.domain if (rest.domain and ".dinely.app" not in rest.domain) else f"https://dinely.food/customer?tenant={pub_slug}",
        "cuisine": rest.cuisine,
        "businessType": rest.business_type,
        "hasBar": rest.has_bar,
        "hasTables": rest.has_tables,
        "hasKitchen": rest.has_kitchen,
        "hasWaiter": rest.has_waiter,
        "hasInventory": rest.has_inventory,
        "hasBilling": rest.has_billing,
        "enabledModules": rest.enabled_modules,
        "phone": rest.phone,
        "email": rest.email,
        "address": rest.address,
        "currency": rest.currency,
        "taxPercentage": rest.tax_percentage,
        "isApproved": rest.is_approved,
        "lifecycleStatus": rest.lifecycle_status,
        "status": rest.status,
        "upiId": rest.upi_id,
        "upiMerchantName": rest.upi_merchant_name,
        "upiQrUrl": rest.upi_qr_url,
        "upiEnabled": rest.upi_enabled,
        "theme": rest.theme_json,
    }

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_restaurant(payload: CreateRestaurantSchema, db: AsyncSession = Depends(get_db)):
    rest_id = payload.id or f"rest-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
    public_slug = await generate_unique_public_slug(db, payload.name, rest_id)
    domain_url = f"https://dinely.food/customer?tenant={public_slug}"

    query = select(Restaurant).where(Restaurant.id == rest_id)
    result = await db.execute(query)
    existing = result.scalar_one_or_none()

    if existing:
        if not existing.public_slug:
            existing.public_slug = public_slug
            existing.domain = domain_url
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
        owner_email=payload.ownerEmail.strip().lower() if payload.ownerEmail else None,
        owner_uid=payload.ownerUid,
        currency=payload.currency or "INR (₹)",
        tax_percentage=payload.taxPercentage or 5.0,
        is_approved=False,
        lifecycle_status="PENDING_APPROVAL",
        submitted_at=datetime.now(timezone.utc),
        status="CLOSED",
        theme_json=payload.theme or {
            "restaurantId": rest_id,
            "restaurantName": payload.name,
            "primaryColor": "#e11d48",
            "currency": payload.currency or "INR (₹)",
        }
    )
    db.add(new_rest)
    await db.flush()

    # Pre-create tables strictly for this tenant with tenant subdomain QR url
    if has_tables:
        num_tables = max(1, min(payload.tableCount or 8, 100))
        for i in range(1, num_tables + 1):
            t_num = f"Table {str(i).zfill(2)}"
            t_id = f"tbl-{rest_id}-table_{str(i).zfill(2)}"
            db.add(Table(
                id=t_id,
                restaurant_id=rest_id,
                table_number=t_num,
                section="Main Hall" if i <= max(1, int(num_tables * 0.7)) else "Terrace",
                capacity=4,
                status="AVAILABLE",
                is_occupied=False,
                qr_code_url=f"https://dinely.food/customer?tenant={public_slug}&table={t_num}&tableId={t_id}"
            ))

    # Record Initial Application Lifecycle Log
    initial_log = RestaurantLifecycleLog(
        id=f"log-{rest_id}-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        restaurant_id=rest_id,
        event_type="CREATED",
        previous_status=None,
        new_status="PENDING_APPROVAL",
        reason="Initial restaurant onboarding submission",
        performed_by=new_rest.owner_email or "Owner",
        performed_at=datetime.now(timezone.utc)
    )
    db.add(initial_log)

    await db.commit()
    await db.refresh(new_rest)

    # Realtime notification to Platform Admin and Global Bus (non-blocking)
    asyncio.create_task(ws_manager.broadcast_global({
        "type": "RestaurantRegistrationSubmitted",
        "restaurantId": rest_id,
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

    conditions = []
    if target_email:
        conditions.append(func.lower(Restaurant.owner_email) == target_email)
    if target_uid:
        conditions.append(Restaurant.owner_uid == target_uid)

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

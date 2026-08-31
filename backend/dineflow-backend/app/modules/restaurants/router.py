import uuid
from datetime import datetime, timezone
from typing import Optional, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database.connection import get_db
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table
from app.modules.websocket.manager import ws_manager

router = APIRouter()

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

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_restaurant(payload: CreateRestaurantSchema, db: AsyncSession = Depends(get_db)):
    rest_id = payload.id or f"rest-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
    slug = payload.name.lower().replace(" ", "-").replace("'", "").replace('"', "")

    query = select(Restaurant).where(Restaurant.id == rest_id)
    result = await db.execute(query)
    existing = result.scalar_one_or_none()

    if existing:
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
        slug=slug,
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

    # Pre-create tables strictly for this tenant
    if has_tables:
        for i in range(1, 9):
            t_num = f"Table {str(i).zfill(2)}"
            t_id = f"tbl-{rest_id}-table_{str(i).zfill(2)}"
            db.add(Table(
                id=t_id,
                restaurant_id=rest_id,
                table_number=t_num,
                section="Main Hall" if i <= 5 else "Terrace",
                capacity=4,
                status="AVAILABLE",
                is_occupied=False,
                qr_code_url=f"https://dinely.food/customer?restaurant={rest_id}&tableId={t_id}&table={t_num}"
            ))

    await db.commit()
    await db.refresh(new_rest)

    # Realtime notification to Platform Admin and Global Bus
    await ws_manager.broadcast_global({
        "type": "RestaurantRegistrationSubmitted",
        "restaurantId": rest_id,
        "restaurantName": new_rest.name,
        "ownerEmail": new_rest.owner_email,
        "ownerName": new_rest.owner_name,
        "businessType": new_rest.business_type,
        "lifecycleStatus": new_rest.lifecycle_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

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
    db: AsyncSession = Depends(get_db)
):
    if not owner_email and not owner_uid:
        return []

    conditions = []
    if owner_email:
        conditions.append(func.lower(Restaurant.owner_email) == owner_email.strip().lower())
    if owner_uid:
        conditions.append(Restaurant.owner_uid == owner_uid.strip())

    query = select(Restaurant).where(
        or_(*conditions),
        Restaurant.deleted_at.is_(None)
    ).order_by(Restaurant.created_at.desc())

    result = await db.execute(query)
    rests = result.scalars().all()
    return rests

@router.get("/{restaurant_id}")
async def get_restaurant(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    clean_id = restaurant_id.strip()
    query = select(Restaurant).where(
        ((Restaurant.id == clean_id) | 
         (Restaurant.slug == clean_id.lower()) | 
         (func.lower(Restaurant.name) == clean_id.lower())),
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
async def update_restaurant(restaurant_id: str, payload: UpdateRestaurantSchema, db: AsyncSession = Depends(get_db)):
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

    # Broadcast realtime configuration update
    await ws_manager.broadcast_to_restaurant(
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
    )

    return rest

@router.patch("/{restaurant_id}/workspace-modules")
async def update_workspace_modules(restaurant_id: str, payload: WorkspaceModulesSchema, db: AsyncSession = Depends(get_db)):
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

    # Broadcast realtime configuration update
    await ws_manager.broadcast_to_restaurant(
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
    )

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

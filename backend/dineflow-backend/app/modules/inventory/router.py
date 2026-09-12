import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.core.database.connection import get_db
from app.core.security.tenant_auth import verify_tenant_authorization, CallerContext, get_caller_context
from app.modules.inventory.models import InventoryItemModel, SupplierModel
from app.modules.inventory.schemas import (
    CreateInventoryItemSchema,
    UpdateInventoryItemSchema,
    AdjustStockSchema,
    InventoryItemResponse,
    CreateSupplierSchema,
    SupplierResponse,
)
from app.modules.restaurants.models import Restaurant

router = APIRouter()


def _format_item_response(item: InventoryItemModel) -> dict:
    return {
        "id": item.id,
        "restaurantId": item.restaurant_id,
        "name": item.name,
        "category": item.category,
        "station": item.station,
        "quantity": float(item.quantity),
        "currentStock": float(item.quantity),
        "unit": item.unit,
        "minThreshold": float(item.min_threshold),
        "costPerUnit": float(item.cost_per_unit),
        "lastRestocked": item.last_restocked or (item.updated_at.isoformat() if item.updated_at else datetime.now(timezone.utc).isoformat()),
        "status": item.status,
        "supplierId": item.supplier_id,
        "supplierName": item.supplier_name,
        "supplierContact": item.supplier_contact,
        "storageLocation": item.storage_location,
    }


def _format_supplier_response(sup: SupplierModel) -> dict:
    return {
        "id": sup.id,
        "restaurantId": sup.restaurant_id,
        "name": sup.name,
        "contactPerson": sup.contact_person,
        "phone": sup.phone,
        "email": sup.email,
        "supplyCategory": sup.supply_category,
        "address": sup.address,
        "notes": sup.notes,
        "createdAt": sup.created_at.isoformat() if sup.created_at else datetime.now(timezone.utc).isoformat(),
    }


async def _resolve_actual_restaurant_id(restaurant_id: str, db: AsyncSession) -> str:
    clean_id = (restaurant_id or "").strip()
    res = await db.execute(
        select(Restaurant).where(
            Restaurant.deleted_at.is_(None),
            or_(
                Restaurant.id == clean_id,
                Restaurant.slug == clean_id.lower(),
                Restaurant.public_slug == clean_id.lower(),
            )
        )
    )
    rest = res.scalar_one_or_none()
    if rest:
        return rest.id
    return clean_id


# ─────────────────────────────────────────────────────────────
# Inventory Items Endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}/inventory")
@router.get("/inventory")
async def list_inventory_items(
    restaurant_id: Optional[str] = None,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    target_id = restaurant_id or caller.restaurant_id
    if not target_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="restaurant_id is required")

    actual_id = await _resolve_actual_restaurant_id(target_id, db)
    await verify_tenant_authorization(actual_id, caller=caller, db=db)

    query = select(InventoryItemModel).where(
        InventoryItemModel.restaurant_id == actual_id
    ).order_by(InventoryItemModel.name.asc())
    result = await db.execute(query)
    items = result.scalars().all()
    return [_format_item_response(i) for i in items]


@router.post("/restaurants/{restaurant_id}/inventory", status_code=status.HTTP_201_CREATED)
@router.post("/inventory", status_code=status.HTTP_201_CREATED)
async def create_inventory_item(
    payload: CreateInventoryItemSchema,
    restaurant_id: Optional[str] = None,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    target_id = restaurant_id or payload.restaurantId or payload.restaurant_id or caller.restaurant_id
    if not target_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="restaurant_id is required")

    actual_id = await _resolve_actual_restaurant_id(target_id, db)
    await verify_tenant_authorization(actual_id, caller=caller, db=db)

    min_thresh = payload.minThreshold if payload.minThreshold is not None else (payload.min_threshold or 2.0)
    cost = payload.costPerUnit if payload.costPerUnit is not None else (payload.cost_per_unit or 0.0)
    qty = float(payload.quantity or 0.0)
    stat = "OUT_OF_STOCK" if qty <= 0 else ("LOW_STOCK" if qty <= min_thresh else "IN_STOCK")

    new_item = InventoryItemModel(
        id=f"inv-{uuid.uuid4().hex[:12]}",
        restaurant_id=actual_id,
        name=payload.name.strip(),
        category=payload.category or "Pantry",
        station=(payload.station or "KITCHEN").upper(),
        quantity=qty,
        unit=payload.unit or "kg",
        min_threshold=float(min_thresh),
        cost_per_unit=float(cost),
        supplier_id=payload.supplierId or payload.supplier_id,
        supplier_name=payload.supplierName or payload.supplier_name,
        supplier_contact=payload.supplierContact or payload.supplier_contact,
        storage_location=payload.storageLocation or payload.storage_location,
        last_restocked=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        status=stat,
    )
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    return _format_item_response(new_item)


@router.patch("/restaurants/{restaurant_id}/inventory/{item_id}")
@router.patch("/inventory/{item_id}")
async def update_inventory_item(
    item_id: str,
    payload: UpdateInventoryItemSchema,
    restaurant_id: Optional[str] = None,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(InventoryItemModel).where(InventoryItemModel.id == item_id))
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")

    await verify_tenant_authorization(item.restaurant_id, caller=caller, db=db)

    if payload.name is not None:
        item.name = payload.name.strip()
    if payload.category is not None:
        item.category = payload.category
    if payload.station is not None:
        item.station = payload.station.upper()
    if payload.quantity is not None:
        item.quantity = float(payload.quantity)
    if payload.unit is not None:
        item.unit = payload.unit
    min_thresh = payload.minThreshold if payload.minThreshold is not None else payload.min_threshold
    if min_thresh is not None:
        item.min_threshold = float(min_thresh)
    cost = payload.costPerUnit if payload.costPerUnit is not None else payload.cost_per_unit
    if cost is not None:
        item.cost_per_unit = float(cost)
    if payload.supplierId or payload.supplier_id:
        item.supplier_id = payload.supplierId or payload.supplier_id
    if payload.supplierName or payload.supplier_name:
        item.supplier_name = payload.supplierName or payload.supplier_name
    if payload.supplierContact or payload.supplier_contact:
        item.supplier_contact = payload.supplierContact or payload.supplier_contact
    if payload.storageLocation or payload.storage_location:
        item.storage_location = payload.storageLocation or payload.storage_location

    if payload.quantity is not None or min_thresh is not None:
        if item.quantity <= 0:
            item.status = "OUT_OF_STOCK"
        elif item.quantity <= item.min_threshold:
            item.status = "LOW_STOCK"
        else:
            item.status = "IN_STOCK"
    elif payload.status is not None:
        item.status = payload.status

    await db.commit()
    await db.refresh(item)
    return _format_item_response(item)


@router.post("/restaurants/{restaurant_id}/inventory/{item_id}/adjust")
@router.post("/inventory/{item_id}/adjust")
async def adjust_inventory_quantity(
    item_id: str,
    payload: AdjustStockSchema,
    restaurant_id: Optional[str] = None,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(InventoryItemModel).where(InventoryItemModel.id == item_id))
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")

    await verify_tenant_authorization(item.restaurant_id, caller=caller, db=db)

    new_qty = max(0.0, float(item.quantity) + float(payload.delta))
    item.quantity = new_qty
    if new_qty <= 0:
        item.status = "OUT_OF_STOCK"
    elif new_qty <= item.min_threshold:
        item.status = "LOW_STOCK"
    else:
        item.status = "IN_STOCK"

    if payload.delta > 0:
        item.last_restocked = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    await db.commit()
    await db.refresh(item)
    return _format_item_response(item)


@router.delete("/restaurants/{restaurant_id}/inventory/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/inventory/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inventory_item(
    item_id: str,
    restaurant_id: Optional[str] = None,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(InventoryItemModel).where(InventoryItemModel.id == item_id))
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")

    await verify_tenant_authorization(item.restaurant_id, caller=caller, db=db)
    await db.delete(item)
    await db.commit()
    return None


# ─────────────────────────────────────────────────────────────
# Suppliers Endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/restaurants/{restaurant_id}/suppliers")
@router.get("/suppliers")
async def list_suppliers(
    restaurant_id: Optional[str] = None,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    target_id = restaurant_id or caller.restaurant_id
    if not target_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="restaurant_id is required")

    actual_id = await _resolve_actual_restaurant_id(target_id, db)
    await verify_tenant_authorization(actual_id, caller=caller, db=db)

    query = select(SupplierModel).where(
        SupplierModel.restaurant_id == actual_id
    ).order_by(SupplierModel.name.asc())
    result = await db.execute(query)
    suppliers = result.scalars().all()
    return [_format_supplier_response(s) for s in suppliers]


@router.post("/restaurants/{restaurant_id}/suppliers", status_code=status.HTTP_201_CREATED)
@router.post("/suppliers", status_code=status.HTTP_201_CREATED)
async def create_supplier(
    payload: CreateSupplierSchema,
    restaurant_id: Optional[str] = None,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    target_id = restaurant_id or payload.restaurantId or payload.restaurant_id or caller.restaurant_id
    if not target_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="restaurant_id is required")

    actual_id = await _resolve_actual_restaurant_id(target_id, db)
    await verify_tenant_authorization(actual_id, caller=caller, db=db)

    new_sup = SupplierModel(
        id=f"sup-{uuid.uuid4().hex[:12]}",
        restaurant_id=actual_id,
        name=payload.name.strip(),
        contact_person=payload.contactPerson or payload.contact_person,
        phone=payload.phone,
        email=payload.email,
        supply_category=payload.supplyCategory or payload.supply_category,
        address=payload.address,
        notes=payload.notes,
    )
    db.add(new_sup)
    await db.commit()
    await db.refresh(new_sup)
    return _format_supplier_response(new_sup)


@router.delete("/restaurants/{restaurant_id}/suppliers/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/suppliers/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(
    supplier_id: str,
    restaurant_id: Optional[str] = None,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(SupplierModel).where(SupplierModel.id == supplier_id))
    sup = res.scalar_one_or_none()
    if not sup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")

    await verify_tenant_authorization(sup.restaurant_id, caller=caller, db=db)
    await db.delete(sup)
    await db.commit()
    return None

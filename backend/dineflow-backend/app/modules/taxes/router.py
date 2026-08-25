from typing import Optional, List, Any, Dict
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database.connection import get_db
from app.modules.taxes.models import Tax, TaxCategory, TaxMenuItem, TaxAuditLog, InvoiceTaxSnapshot
from app.modules.taxes.calculation import calculate_taxes
from app.modules.menu.models import MenuCategory, MenuItem

router = APIRouter()

class CreateTaxSchema(BaseModel):
    name: str = Field(..., min_length=1)
    type: str = Field("PERCENTAGE", description="PERCENTAGE or FIXED")
    rate: float = Field(0.0, ge=0.0)
    fixedAmount: Optional[float] = Field(0.0, ge=0.0)
    isInclusive: bool = False
    appliesTo: str = Field("ORDER", description="ORDER, CATEGORY, or ITEM")
    applicableOrderTypes: Optional[List[str]] = Field(default_factory=lambda: ["DINE_IN", "TAKEAWAY", "DELIVERY"])
    categoryIds: Optional[List[str]] = Field(default_factory=list)
    menuItemIds: Optional[List[str]] = Field(default_factory=list)
    status: str = Field("ACTIVE", description="ACTIVE or INACTIVE")

class UpdateTaxSchema(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    rate: Optional[float] = None
    fixedAmount: Optional[float] = None
    isInclusive: Optional[bool] = None
    appliesTo: Optional[str] = None
    applicableOrderTypes: Optional[List[str]] = None
    categoryIds: Optional[List[str]] = None
    menuItemIds: Optional[List[str]] = None
    status: Optional[str] = None

class CalculateTaxRequestSchema(BaseModel):
    items: List[Dict[str, Any]]
    orderType: Optional[str] = "DINE_IN"

def format_tax_response(
    tax: Tax,
    category_ids: List[str] = None,
    menu_item_ids: List[str] = None
) -> dict:
    return {
        "id": tax.id,
        "restaurant_id": tax.restaurant_id,
        "name": tax.name,
        "type": tax.type,
        "rate": tax.rate,
        "fixed_amount": tax.fixed_amount or 0.0,
        "is_inclusive": tax.is_inclusive,
        "applies_to": tax.applies_to,
        "applicable_order_types": tax.applicable_order_types or ["DINE_IN", "TAKEAWAY", "DELIVERY"],
        "category_ids": category_ids or [],
        "menu_item_ids": menu_item_ids or [],
        "status": tax.status,
        "created_at": tax.created_at.isoformat() if tax.created_at else None,
        "updated_at": tax.updated_at.isoformat() if tax.updated_at else None,
    }

async def get_tax_associations(tax_id: str, db: AsyncSession):
    cat_res = await db.execute(select(TaxCategory.category_id).where(TaxCategory.tax_id == tax_id))
    category_ids = [row[0] for row in cat_res.all()]

    item_res = await db.execute(select(TaxMenuItem.menu_item_id).where(TaxMenuItem.tax_id == tax_id))
    menu_item_ids = [row[0] for row in item_res.all()]

    return category_ids, menu_item_ids

@router.get("/{restaurant_id}/taxes")
async def get_taxes(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Tax).where(Tax.restaurant_id == restaurant_id).order_by(Tax.created_at.desc())
    res = await db.execute(query)
    taxes = res.scalars().all()

    result = []
    for t in taxes:
        cat_ids, item_ids = await get_tax_associations(t.id, db)
        result.append(format_tax_response(t, cat_ids, item_ids))
    return result

@router.post("/{restaurant_id}/taxes", status_code=status.HTTP_201_CREATED)
async def create_tax(restaurant_id: str, payload: CreateTaxSchema, db: AsyncSession = Depends(get_db)):
    if not payload.name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tax name cannot be empty")
    
    if payload.type == "PERCENTAGE" and payload.rate > 100.0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Percentage tax rate cannot exceed 100%")

    # Validate categories ownership if provided
    if payload.categoryIds:
        cat_chk = await db.execute(
            select(MenuCategory.id).where(
                (MenuCategory.restaurant_id == restaurant_id) &
                (MenuCategory.id.in_(payload.categoryIds))
            )
        )
        valid_cat_ids = set([r[0] for r in cat_chk.all()])
        invalid_cats = set(payload.categoryIds) - valid_cat_ids
        if invalid_cats:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Category IDs do not belong to restaurant: {list(invalid_cats)}")

    # Validate menu items ownership if provided
    if payload.menuItemIds:
        item_chk = await db.execute(
            select(MenuItem.id).where(
                (MenuItem.restaurant_id == restaurant_id) &
                (MenuItem.id.in_(payload.menuItemIds))
            )
        )
        valid_item_ids = set([r[0] for r in item_chk.all()])
        invalid_items = set(payload.menuItemIds) - valid_item_ids
        if invalid_items:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Menu Item IDs do not belong to restaurant: {list(invalid_items)}")

    tax_id = f"tax-{restaurant_id}-{int(datetime.utcnow().timestamp() * 1000)}"
    new_tax = Tax(
        id=tax_id,
        restaurant_id=restaurant_id,
        name=payload.name.strip(),
        type=payload.type,
        rate=payload.rate,
        fixed_amount=payload.fixedAmount or 0.0,
        is_inclusive=payload.isInclusive,
        applies_to=payload.appliesTo,
        applicable_order_types=payload.applicableOrderTypes or ["DINE_IN", "TAKEAWAY", "DELIVERY"],
        status=payload.status or "ACTIVE",
    )
    db.add(new_tax)

    if payload.categoryIds:
        for cid in payload.categoryIds:
            db.add(TaxCategory(id=f"tc-{tax_id}-{cid}", tax_id=tax_id, category_id=cid))

    if payload.menuItemIds:
        for item_id in payload.menuItemIds:
            db.add(TaxMenuItem(id=f"ti-{tax_id}-{item_id}", tax_id=tax_id, menu_item_id=item_id))

    # Audit Log
    audit = TaxAuditLog(
        id=f"audit-{tax_id}-{int(datetime.utcnow().timestamp() * 1000)}",
        restaurant_id=restaurant_id,
        user_id="Owner",
        action="CREATE",
        tax_id=tax_id,
        new_values=payload.model_dump(),
    )
    db.add(audit)

    await db.commit()
    await db.refresh(new_tax)
    return format_tax_response(new_tax, payload.categoryIds, payload.menuItemIds)

@router.get("/{restaurant_id}/taxes/{tax_id}")
async def get_tax(restaurant_id: str, tax_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Tax).where((Tax.id == tax_id) & (Tax.restaurant_id == restaurant_id)))
    tax = res.scalar_one_or_none()
    if not tax:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax not found")
    cat_ids, item_ids = await get_tax_associations(tax.id, db)
    return format_tax_response(tax, cat_ids, item_ids)

@router.put("/{restaurant_id}/taxes/{tax_id}")
async def update_tax(restaurant_id: str, tax_id: str, payload: UpdateTaxSchema, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Tax).where((Tax.id == tax_id) & (Tax.restaurant_id == restaurant_id)))
    tax = res.scalar_one_or_none()
    if not tax:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax not found for this restaurant")

    cat_ids, item_ids = await get_tax_associations(tax.id, db)
    prev_snapshot = format_tax_response(tax, cat_ids, item_ids)

    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tax name cannot be empty")
        tax.name = payload.name.strip()
    if payload.type is not None:
        tax.type = payload.type
    if payload.rate is not None:
        if tax.type == "PERCENTAGE" and payload.rate > 100.0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Percentage tax rate cannot exceed 100%")
        tax.rate = payload.rate
    if payload.fixedAmount is not None:
        tax.fixed_amount = payload.fixedAmount
    if payload.isInclusive is not None:
        tax.is_inclusive = payload.isInclusive
    if payload.appliesTo is not None:
        tax.applies_to = payload.appliesTo
    if payload.applicableOrderTypes is not None:
        tax.applicable_order_types = payload.applicableOrderTypes
    if payload.status is not None:
        tax.status = payload.status

    if payload.categoryIds is not None:
        await db.execute(delete(TaxCategory).where(TaxCategory.tax_id == tax_id))
        for cid in payload.categoryIds:
            db.add(TaxCategory(id=f"tc-{tax_id}-{cid}", tax_id=tax_id, category_id=cid))
        cat_ids = payload.categoryIds

    if payload.menuItemIds is not None:
        await db.execute(delete(TaxMenuItem).where(TaxMenuItem.tax_id == tax_id))
        for item_id in payload.menuItemIds:
            db.add(TaxMenuItem(id=f"ti-{tax_id}-{item_id}", tax_id=tax_id, menu_item_id=item_id))
        item_ids = payload.menuItemIds

    new_snapshot = format_tax_response(tax, cat_ids, item_ids)

    # Audit Log
    audit = TaxAuditLog(
        id=f"audit-{tax_id}-{int(datetime.utcnow().timestamp() * 1000)}",
        restaurant_id=restaurant_id,
        user_id="Owner",
        action="UPDATE",
        tax_id=tax_id,
        previous_values=prev_snapshot,
        new_values=new_snapshot,
    )
    db.add(audit)

    await db.commit()
    await db.refresh(tax)
    return new_snapshot

@router.post("/{restaurant_id}/taxes/{tax_id}/activate")
async def activate_tax(restaurant_id: str, tax_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Tax).where((Tax.id == tax_id) & (Tax.restaurant_id == restaurant_id)))
    tax = res.scalar_one_or_none()
    if not tax:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax not found")

    tax.status = "ACTIVE"
    audit = TaxAuditLog(
        id=f"audit-{tax_id}-{int(datetime.utcnow().timestamp() * 1000)}",
        restaurant_id=restaurant_id,
        user_id="Owner",
        action="ACTIVATE",
        tax_id=tax_id,
        new_values={"status": "ACTIVE"},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(tax)
    cat_ids, item_ids = await get_tax_associations(tax.id, db)
    return format_tax_response(tax, cat_ids, item_ids)

@router.post("/{restaurant_id}/taxes/{tax_id}/deactivate")
async def deactivate_tax(restaurant_id: str, tax_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Tax).where((Tax.id == tax_id) & (Tax.restaurant_id == restaurant_id)))
    tax = res.scalar_one_or_none()
    if not tax:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax not found")

    tax.status = "INACTIVE"
    audit = TaxAuditLog(
        id=f"audit-{tax_id}-{int(datetime.utcnow().timestamp() * 1000)}",
        restaurant_id=restaurant_id,
        user_id="Owner",
        action="DEACTIVATE",
        tax_id=tax_id,
        new_values={"status": "INACTIVE"},
    )
    db.add(audit)
    await db.commit()
    await db.refresh(tax)
    cat_ids, item_ids = await get_tax_associations(tax.id, db)
    return format_tax_response(tax, cat_ids, item_ids)

@router.post("/{restaurant_id}/taxes/calculate")
async def calculate_tax_endpoint(restaurant_id: str, payload: CalculateTaxRequestSchema, db: AsyncSession = Depends(get_db)):
    res_taxes = await db.execute(select(Tax).where((Tax.restaurant_id == restaurant_id) & (Tax.status == "ACTIVE")))
    active_taxes = res_taxes.scalars().all()

    tax_cats_map: Dict[str, List[str]] = {}
    tax_items_map: Dict[str, List[str]] = {}

    for t in active_taxes:
        c_ids, i_ids = await get_tax_associations(t.id, db)
        tax_cats_map[t.id] = c_ids
        tax_items_map[t.id] = i_ids

    calc_res = calculate_taxes(
        items=payload.items,
        active_taxes=active_taxes,
        tax_categories_map=tax_cats_map,
        tax_items_map=tax_items_map,
        order_type=payload.orderType or "DINE_IN"
    )
    return calc_res

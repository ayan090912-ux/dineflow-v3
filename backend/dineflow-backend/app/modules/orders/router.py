from typing import Optional, List, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database.connection import get_db
from app.modules.orders.models import Order, OrderItem, Bill
from app.modules.tables.models import Table

router = APIRouter()

class OrderItemInputSchema(BaseModel):
    id: Optional[str] = None
    menuItemId: Optional[str] = None
    name: str
    price: float
    quantity: int
    notes: Optional[str] = ""

class CreateOrderSchema(BaseModel):
    restaurantId: str
    tableId: str
    tableNumber: str
    tableSessionId: str
    items: List[OrderItemInputSchema]
    customerName: Optional[str] = "Guest"
    notes: Optional[str] = ""

class UpdateOrderStatusSchema(BaseModel):
    status: Optional[str] = None
    kitchenStatus: Optional[str] = None
    barStatus: Optional[str] = None
    estimatedPrepTimeMinutes: Optional[int] = None
    etaTargetTimestamp: Optional[str] = None

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_order(payload: CreateOrderSchema, db: AsyncSession = Depends(get_db)):
    subtotal = sum(i.price * i.quantity for i in payload.items)
    tax_amount = round(subtotal * 0.05, 2)
    total = round(subtotal + tax_amount, 2)

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    query_count = select(func.count(Order.id)).where(
        (Order.restaurant_id == payload.restaurantId) &
        (Order.created_at >= today_start)
    )
    res_count = await db.execute(query_count)
    daily_seq = (res_count.scalar() or 0) + 1
    order_num = f"#ORD-{daily_seq}"

    order_id = f"ord-{payload.restaurantId}-{int(datetime.utcnow().timestamp() * 1000)}"

    new_order = Order(
        id=order_id,
        restaurant_id=payload.restaurantId,
        table_id=payload.tableId,
        table_number=payload.tableNumber,
        table_session_id=payload.tableSessionId,
        status="PENDING",
        kitchen_status="PENDING",
        bar_status="PENDING",
        customer_name=payload.customerName or "Guest",
        notes=payload.notes or "",
        subtotal=subtotal,
        tax_amount=tax_amount,
        total_amount=total,
        order_number=order_num,
        estimated_prep_time_minutes=15,
        items_json=[i.model_dump() for i in payload.items],
    )
    db.add(new_order)

    # Lock table as occupied
    query_tbl = select(Table).where(
        (Table.restaurant_id == payload.restaurantId) &
        ((Table.id == payload.tableId) | (Table.table_number == payload.tableNumber))
    )
    res_tbl = await db.execute(query_tbl)
    tbls = res_tbl.scalars().all()
    if tbls:
        tbl = tbls[0]
        tbl.status = "OCCUPIED"
        tbl.is_occupied = True
        tbl.active_session_id = payload.tableSessionId

    for idx, i in enumerate(payload.items):
        new_item = OrderItem(
            id=f"oi-{int(datetime.utcnow().timestamp() * 1000)}-{idx}",
            order_id=order_id,
            menu_item_id=i.menuItemId or "item-unknown",
            name=i.name,
            quantity=i.quantity,
            unit_price=i.price,
            subtotal=i.price * i.quantity,
            notes=i.notes or "",
        )
        db.add(new_item)

    await db.commit()
    await db.refresh(new_order)
    return format_order_response(new_order)

def format_order_response(order: Order) -> dict:
    return {
        "id": order.id,
        "restaurant_id": order.restaurant_id,
        "table_id": order.table_id,
        "table_number": order.table_number,
        "table_session_id": order.table_session_id,
        "status": order.status,
        "kitchen_status": order.kitchen_status,
        "bar_status": order.bar_status,
        "customer_name": order.customer_name,
        "notes": order.notes,
        "subtotal": order.subtotal,
        "tax_amount": order.tax_amount,
        "total_amount": order.total_amount,
        "order_number": order.order_number,
        "estimated_prep_time_minutes": order.estimated_prep_time_minutes or 15,
        "eta_target_timestamp": order.eta_target_timestamp.isoformat() if order.eta_target_timestamp else None,
        "items_json": order.items_json or [],
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }

@router.get("/customer")
async def get_customer_orders(
    restaurant_id: str = Query(...),
    table_id: str = Query(...),
    table_session_id: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    query = select(Order).where(
        (Order.restaurant_id == restaurant_id) &
        (Order.table_session_id == table_session_id) &
        (Order.status != "CANCELLED")
    ).order_by(Order.created_at.desc())
    result = await db.execute(query)
    orders = result.scalars().all()
    return [format_order_response(o) for o in orders]

@router.get("/restaurant/{restaurant_id}")
async def get_restaurant_orders(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Order).where(Order.restaurant_id == restaurant_id).order_by(Order.created_at.desc())
    result = await db.execute(query)
    orders = result.scalars().all()
    return [format_order_response(o) for o in orders]

@router.put("/{order_id}/status")
async def update_order_status(order_id: str, payload: UpdateOrderStatusSchema, db: AsyncSession = Depends(get_db)):
    query = select(Order).where(Order.id == order_id)
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if payload.status:
        order.status = payload.status
    if payload.kitchenStatus:
        order.kitchen_status = payload.kitchenStatus
    if payload.barStatus:
        order.bar_status = payload.barStatus
    if payload.estimatedPrepTimeMinutes is not None:
        order.estimated_prep_time_minutes = payload.estimatedPrepTimeMinutes
    if payload.etaTargetTimestamp is not None:
        try:
            dt_val = datetime.fromisoformat(payload.etaTargetTimestamp.replace("Z", "+00:00"))
            order.eta_target_timestamp = dt_val
        except Exception:
            pass

    await db.commit()
    await db.refresh(order)
    return format_order_response(order)

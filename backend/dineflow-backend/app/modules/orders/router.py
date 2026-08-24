from typing import Optional, List, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database.connection import get_db
from app.modules.orders.models import Order, OrderItem, Bill

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
    status: str

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_order(payload: CreateOrderSchema, db: AsyncSession = Depends(get_db)):
    subtotal = sum(i.price * i.quantity for i in payload.items)
    tax_amount = round(subtotal * 0.05, 2)
    total = round(subtotal + tax_amount, 2)

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
        items_json=[i.model_dump() for i in payload.items],
    )
    db.add(new_order)

    for i in payload.items:
        new_item = OrderItem(
            id=f"oi-{order_id}-{i.name.lower().replace(' ', '_')}",
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
    return new_order

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
    return orders

@router.get("/restaurant/{restaurant_id}")
async def get_restaurant_orders(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Order).where(Order.restaurant_id == restaurant_id).order_by(Order.created_at.desc())
    result = await db.execute(query)
    orders = result.scalars().all()
    return orders

@router.put("/{order_id}/status")
async def update_order_status(order_id: str, payload: UpdateOrderStatusSchema, db: AsyncSession = Depends(get_db)):
    query = select(Order).where(Order.id == order_id)
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    order.status = payload.status
    await db.commit()
    await db.refresh(order)
    return order

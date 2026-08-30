from typing import Optional, List, Any, Dict
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database.connection import get_db
from app.modules.orders.models import Order, OrderItem, Bill
from app.modules.tables.models import Table, TableSession

from app.modules.restaurants.models import Restaurant
from app.modules.taxes.models import Tax, TaxCategory, TaxMenuItem, InvoiceTaxSnapshot
from app.modules.taxes.calculation import calculate_taxes

router = APIRouter()

class OrderItemInputSchema(BaseModel):
    id: Optional[str] = None
    menuItemId: Optional[str] = None
    name: str
    price: float
    quantity: int = 1
    notes: Optional[str] = ""
    targetDestination: Optional[str] = "KITCHEN"
    isAlcoholic: Optional[bool] = False
    category: Optional[str] = None
    categoryId: Optional[str] = None

class CreateOrderSchema(BaseModel):
    restaurantId: str
    tableId: Optional[str] = None
    tableNumber: Optional[str] = "Table 01"
    tableSessionId: Optional[str] = None
    items: List[OrderItemInputSchema]
    customerName: Optional[str] = "Guest"
    notes: Optional[str] = ""
    orderType: Optional[str] = "DINE_IN"

class UpdateOrderStatusSchema(BaseModel):
    status: Optional[str] = None
    kitchenStatus: Optional[str] = None
    barStatus: Optional[str] = None
    estimatedPrepTimeMinutes: Optional[int] = None
    etaTargetTimestamp: Optional[str] = None

def format_order_response(order: Order) -> dict:
    created_at_val = None
    if getattr(order, "created_at", None):
        try:
            created_at_val = order.created_at.isoformat()
        except Exception:
            created_at_val = str(order.created_at)

    eta_val = None
    if getattr(order, "eta_target_timestamp", None):
        try:
            eta_val = order.eta_target_timestamp.isoformat()
        except Exception:
            eta_val = str(order.eta_target_timestamp)

    ord_num = getattr(order, "order_number", None)
    if not ord_num and getattr(order, "id", None):
        ord_num = f"#ORD-{str(order.id)[-4:]}"

    sess_id = getattr(order, "table_session_id", None)
    rest_id = getattr(order, "restaurant_id", "")
    tbl_id = getattr(order, "table_id", None)
    tbl_num = getattr(order, "table_number", "Table 01")
    cust_name = getattr(order, "customer_name", "Guest")
    tot_amt = getattr(order, "total_amount", 0.0) or 0.0

    return {
        "id": getattr(order, "id", ""),
        "restaurant_id": rest_id,
        "restaurantId": rest_id,
        "table_id": tbl_id,
        "tableId": tbl_id,
        "table_number": tbl_num,
        "tableNumber": tbl_num,
        "table_session_id": sess_id,
        "tableSessionId": sess_id,
        "status": getattr(order, "status", "PENDING"),
        "kitchen_status": getattr(order, "kitchen_status", "PENDING"),
        "bar_status": getattr(order, "bar_status", "PENDING"),
        "customer_name": cust_name,
        "customerName": cust_name,
        "notes": getattr(order, "notes", ""),
        "subtotal": getattr(order, "subtotal", 0.0) or 0.0,
        "tax_amount": getattr(order, "tax_amount", 0.0) or 0.0,
        "total_amount": tot_amt,
        "totalAmount": tot_amt,
        "order_number": ord_num or "#ORD-1",
        "orderNumber": ord_num or "#ORD-1",
        "estimated_prep_time_minutes": getattr(order, "estimated_prep_time_minutes", 15) or 15,
        "estimatedPrepTimeMinutes": getattr(order, "estimated_prep_time_minutes", 15) or 15,
        "eta_target_timestamp": eta_val,
        "etaTargetTimestamp": eta_val,
        "items": getattr(order, "items_json", []) or [],
        "items_json": getattr(order, "items_json", []) or [],
        "tax_breakdown": getattr(order, "tax_breakdown_json", []) or [],
        "created_at": created_at_val,
        "createdAt": created_at_val,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_order(payload: CreateOrderSchema, db: AsyncSession = Depends(get_db)):
    try:
        print(f"[ORDER_CREATED_REQUEST] restaurant_id={payload.restaurantId} table_number={payload.tableNumber} items_count={len(payload.items or [])}")
        if not payload.restaurantId:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="restaurantId is required")
        if not payload.items or len(payload.items) == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order items cannot be empty")

        tbl_num = payload.tableNumber or "Table 01"
        tbl_id = payload.tableId or f"tbl-{payload.restaurantId}-{(tbl_num).lower().replace(' ', '_')}"
        session_id = payload.tableSessionId or f"sess-{payload.restaurantId}-{tbl_id}-{int(datetime.utcnow().timestamp())}"

        try:
            query_sess = select(TableSession).where(TableSession.id == session_id)
            res_sess = await db.execute(query_sess)
            existing_sess = res_sess.scalar_one_or_none()

            if not existing_sess or existing_sess.status == "CLOSED":
                query_active = select(TableSession).where(
                    (TableSession.restaurant_id == payload.restaurantId) &
                    ((TableSession.table_id == tbl_id) | (TableSession.table_number == tbl_num)) &
                    (TableSession.status == "ACTIVE")
                ).order_by(TableSession.session_started_at.desc())
                res_active = await db.execute(query_active)
                active_sess = res_active.scalars().first()

                if active_sess:
                    session_id = active_sess.id
                else:
                    new_sess_id = session_id if not existing_sess else f"sess-{payload.restaurantId}-{int(datetime.utcnow().timestamp() * 1000)}"
                    new_sess = TableSession(
                        id=new_sess_id,
                        restaurant_id=payload.restaurantId,
                        table_id=tbl_id,
                        table_number=tbl_num,
                        status="ACTIVE",
                        session_started_at=datetime.utcnow()
                    )
                    db.add(new_sess)
                    await db.flush()
                    session_id = new_sess.id
        except Exception as sess_err:
            print("[SESSION_CREATION_NOTICE] TableSession creation handled:", sess_err)

        items_list_dict = [i.model_dump() for i in payload.items]
        subtotal = sum((float(i.get("price") or 0) * int(i.get("quantity") or 1)) for i in items_list_dict)
        tax_amount = 0.0
        total = subtotal
        tax_breakdown = []

        try:
            res_taxes = await db.execute(
                select(Tax).where((Tax.restaurant_id == payload.restaurantId) & (Tax.status == "ACTIVE"))
            )
            active_taxes = res_taxes.scalars().all()

            tax_cats_map: Dict[str, List[str]] = {}
            tax_items_map: Dict[str, List[str]] = {}
            for t in active_taxes:
                c_res = await db.execute(select(TaxCategory.category_id).where(TaxCategory.tax_id == t.id))
                tax_cats_map[t.id] = [r[0] for r in c_res.all()]

                i_res = await db.execute(select(TaxMenuItem.menu_item_id).where(TaxMenuItem.tax_id == t.id))
                tax_items_map[t.id] = [r[0] for r in i_res.all()]

            calc = calculate_taxes(
                items=items_list_dict,
                active_taxes=active_taxes,
                tax_categories_map=tax_cats_map,
                tax_items_map=tax_items_map,
                order_type=payload.orderType or "DINE_IN"
            )

            subtotal = calc["subtotal"]
            tax_amount = calc["total_tax_amount"]
            total = calc["grand_total"]
            tax_breakdown = calc["tax_breakdown"]
        except Exception as tax_err:
            print("[TAX_CALCULATION_NOTICE] Exception during tax lookup, using base totals:", tax_err)

        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        query_count = select(func.count(Order.id)).where(
            (Order.restaurant_id == payload.restaurantId) &
            (Order.created_at >= today_start)
        )
        res_count = await db.execute(query_count)
        daily_seq = (res_count.scalar() or 0) + 1
        order_num = f"#ORD-{daily_seq}"

        order_id = f"ord-{payload.restaurantId}-{int(datetime.utcnow().timestamp() * 1000)}"

        print(f"[ORDER_DATABASE_INSERT] order_id={order_id} restaurant_id={payload.restaurantId} table_id={tbl_id} session_id={session_id}")

        new_order = Order(
            id=order_id,
            restaurant_id=payload.restaurantId,
            table_id=tbl_id,
            table_number=tbl_num,
            table_session_id=session_id,
            status="PENDING",
            kitchen_status="PENDING",
            bar_status="PENDING",
            customer_name=payload.customerName or "Guest",
            notes=payload.notes or "",
            subtotal=subtotal,
            tax_amount=tax_amount,
            total_amount=total,
            order_number=order_num,
            estimated_prep_time_minutes=None,
            eta_target_timestamp=None,
            items_json=items_list_dict,
            tax_breakdown_json=tax_breakdown,
        )
        db.add(new_order)

        try:
            query_tbl = select(Table).where(
                (Table.restaurant_id == payload.restaurantId) &
                ((Table.id == tbl_id) | (Table.table_number == tbl_num))
            )
            res_tbl = await db.execute(query_tbl)
            tbls = res_tbl.scalars().all()
            if tbls:
                tbl = tbls[0]
                tbl.status = "OCCUPIED"
                tbl.is_occupied = True
                tbl.active_session_id = session_id
        except Exception as tbl_err:
            print("[TABLE_UPDATE_NOTICE] Table update skipped:", tbl_err)

        for idx, i in enumerate(payload.items):
            new_item = OrderItem(
                id=f"oi-{int(datetime.utcnow().timestamp() * 1000)}-{idx}",
                order_id=order_id,
                menu_item_id=i.menuItemId or i.id or "item-unknown",
                name=i.name,
                quantity=i.quantity,
                unit_price=i.price,
                subtotal=i.price * i.quantity,
                notes=i.notes or "",
                target_destination=i.target_destination if hasattr(i, 'target_destination') else (getattr(i, 'targetDestination', None) or "KITCHEN"),
            )
            db.add(new_item)

        try:
            for t_snap in tax_breakdown:
                snapshot_rec = InvoiceTaxSnapshot(
                    id=f"its-{order_id}-{t_snap['tax_id']}",
                    order_id=order_id,
                    tax_id=t_snap["tax_id"],
                    tax_name_snapshot=t_snap["name"],
                    tax_type_snapshot=t_snap["type"],
                    tax_rate_snapshot=t_snap["rate"],
                    tax_amount=t_snap["amount"],
                    is_inclusive=t_snap["is_inclusive"],
                )
                db.add(snapshot_rec)
        except Exception as snap_err:
            print("[TAX_SNAPSHOT_NOTICE] Exception writing tax snapshots:", snap_err)

        await db.commit()
        print(f"[ORDER_DATABASE_COMMITTED] order_id={order_id} restaurant_id={payload.restaurantId} total={total}")
        await db.refresh(new_order)
        resp_data = format_order_response(new_order)

        try:
            from app.modules.websocket.manager import ws_manager
            await ws_manager.broadcast_event(
                restaurant_id=payload.restaurantId,
                event_type="order_created",
                payload=resp_data,
                target_audience=["KITCHEN", "BAR", "WAITER", "CUSTOMER", "OWNER"]
            )
        except Exception as ws_err:
            print("[WS_BROADCAST_NOTICE] order_created:", ws_err)

        return resp_data
    except HTTPException:
        raise
    except Exception as create_err:
        import traceback
        print("[CREATE_ORDER_CRITICAL_EXCEPT]:", traceback.format_exc())
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Order creation error: {str(create_err)}")

@router.get("/customer")
async def get_customer_orders(
    restaurant_id: str = Query(...),
    table_id: Optional[str] = Query(None),
    table_session_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    query = select(Order).where(
        (Order.restaurant_id == restaurant_id) &
        (Order.status != "CANCELLED")
    )
    if table_session_id:
        query = query.where(Order.table_session_id == table_session_id)
    elif table_id:
        from app.modules.tables.models import TableSession
        query_sess = select(TableSession).where(
            (TableSession.restaurant_id == restaurant_id) &
            ((TableSession.table_id == table_id) | (TableSession.table_number == table_id)) &
            (TableSession.status == "ACTIVE")
        )
        res_sess = await db.execute(query_sess)
        active_sess = res_sess.scalars().first()

        if active_sess:
            query = query.where(Order.table_session_id == active_sess.id)
        else:
            return []

    query = query.order_by(Order.created_at.desc())
    result = await db.execute(query)
    orders = result.scalars().all()
    return [format_order_response(o) for o in orders]



@router.get("/restaurant/{restaurant_id}")
async def get_restaurant_orders(
    restaurant_id: str,
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    try:
        query = select(Order).where(Order.restaurant_id == restaurant_id)
        if active_only:
            query_sess = select(TableSession.id).where(
                (TableSession.restaurant_id == restaurant_id) &
                (TableSession.status == "ACTIVE")
            )
            res_sess = await db.execute(query_sess)
            active_session_ids = [r[0] for r in res_sess.all()]

            if active_session_ids:
                query = query.where(
                    (Order.table_session_id.in_(active_session_ids)) |
                    (Order.status.in_(["PENDING", "PREPARING", "READY"]))
                )
            else:
                query = query.where(Order.status.in_(["PENDING", "PREPARING", "READY"]))

        query = query.order_by(Order.created_at.desc())
        result = await db.execute(query)
        orders = result.scalars().all()
        print(f"[KITCHEN_ORDER_FETCH] restaurant_id={restaurant_id} active_only={active_only} count={len(orders)}")
        return [format_order_response(o) for o in orders]
    except Exception as e:
        print("[KITCHEN_ORDER_FETCH_EXCEPT]:", e)
        return []


@router.put("/{order_id}/status")
@router.patch("/{order_id}/status")
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

    if (payload.kitchenStatus == "PREPARING" or payload.status == "PREPARING" or payload.status == "IN_KITCHEN") and not order.eta_target_timestamp:
        prep_mins = payload.estimatedPrepTimeMinutes or order.estimated_prep_time_minutes or 15
        order.estimated_prep_time_minutes = prep_mins
        order.eta_target_timestamp = datetime.utcnow() + timedelta(minutes=prep_mins)

    if payload.estimatedPrepTimeMinutes is not None:
        order.estimated_prep_time_minutes = payload.estimatedPrepTimeMinutes
        if not order.eta_target_timestamp:
            order.eta_target_timestamp = datetime.utcnow() + timedelta(minutes=payload.estimatedPrepTimeMinutes)
    if payload.etaTargetTimestamp is not None:
        try:
            dt_val = datetime.fromisoformat(payload.etaTargetTimestamp.replace("Z", "+00:00"))
            order.eta_target_timestamp = dt_val
        except Exception:
            pass

    await db.commit()
    print(f"[ORDER_STATUS_UPDATED] order_id={order_id} status={order.status} kitchen_status={order.kitchen_status}")
    await db.refresh(order)
    resp_data = format_order_response(order)

    try:
        from app.modules.websocket.manager import ws_manager
        if payload.status == "READY" or payload.kitchenStatus == "READY" or payload.barStatus == "READY":
            await ws_manager.broadcast_event(
                restaurant_id=order.restaurant_id,
                event_type="order_ready",
                payload=resp_data,
                target_audience=["WAITER", "CUSTOMER", "OWNER"]
            )
        await ws_manager.broadcast_event(
            restaurant_id=order.restaurant_id,
            event_type="order_status_updated",
            payload=resp_data,
            target_audience=["KITCHEN", "BAR", "WAITER", "CUSTOMER", "OWNER"]
        )
    except Exception as ws_err:
        print("[WS_BROADCAST_NOTICE] order_status_updated:", ws_err)

    return resp_data

@router.get("/{order_id}")
async def get_order_by_id(order_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Order).where(Order.id == order_id)
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return format_order_response(order)



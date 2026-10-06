import time
from typing import Optional, List, Any, Dict
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database.connection import get_db
from app.core.security.tenant_auth import get_caller_context, CallerContext, require_tenant_staff_or_owner
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
    id: Optional[str] = None
    idempotencyKey: Optional[str] = None
    clientOrderId: Optional[str] = None
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

class UpdateOrderETASchema(BaseModel):
    deltaMinutes: Optional[int] = None
    targetTimestamp: Optional[str] = None
    estimatedPrepTimeMinutes: Optional[int] = None
    reason: Optional[str] = None

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

    rest_id = getattr(order, "restaurant_id", "")
    tbl_id = getattr(order, "table_id", "")
    tbl_num = getattr(order, "table_number", "")
    sess_id = getattr(order, "table_session_id", "")
    ord_num = getattr(order, "order_number", "")
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
        "kitchenStatus": getattr(order, "kitchen_status", "PENDING"),
        "bar_status": getattr(order, "bar_status", "PENDING"),
        "barStatus": getattr(order, "bar_status", "PENDING"),
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


class CachedRestaurant:
    def __init__(
        self,
        id: str,
        lifecycle_status: str,
        owner_uid: Optional[str] = None,
        owner_email: Optional[str] = None,
        has_kitchen: bool = True,
        has_bar: bool = True,
        has_waiter: bool = True,
        enabled_modules: Optional[list] = None
    ):
        self.id = id
        self.lifecycle_status = lifecycle_status
        self.owner_uid = owner_uid
        self.owner_email = owner_email
        self.has_kitchen = has_kitchen
        self.has_bar = has_bar
        self.has_waiter = has_waiter
        self.enabled_modules = enabled_modules or ["kitchen", "bar", "waiter", "billing"]

class CachedTax:
    def __init__(self, id: str, name: str, type: str, rate: float, fixed_amount: float, is_inclusive: bool, status: str, applicable_order_types: list, applies_to: str):
        self.id = id
        self.name = name
        self.type = type
        self.rate = rate
        self.fixed_amount = fixed_amount
        self.is_inclusive = is_inclusive
        self.status = status
        self.applicable_order_types = applicable_order_types
        self.applies_to = applies_to

_ORDER_RESTAURANT_CACHE: dict = {}
_ORDER_RESTAURANT_CACHE_TTL: float = 60.0

_ORDER_TAX_CACHE: dict = {}
_ORDER_TAX_CACHE_TTL: float = 60.0

_ORDER_DAILY_SEQ: dict = {}

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: CreateOrderSchema,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    try:
        print(f"[ORDER_CREATED_REQUEST] restaurant_id={payload.restaurantId} table_number={payload.tableNumber} items_count={len(payload.items or [])}")
        if not payload.restaurantId:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="restaurantId is required")
        if not payload.items or len(payload.items) == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order items cannot be empty")

        # Fast in-memory cache for Restaurant lookup
        now_mono = time.time()
        restaurant = None
        cached_rest_entry = _ORDER_RESTAURANT_CACHE.get(payload.restaurantId) or _ORDER_RESTAURANT_CACHE.get(payload.restaurantId.lower())
        if cached_rest_entry:
            ts, cached_obj = cached_rest_entry
            if now_mono - ts < _ORDER_RESTAURANT_CACHE_TTL:
                restaurant = cached_obj

        if not restaurant:
            # Strict Tenant Verification: Must exist in database and be active
            query_rest = select(Restaurant).where(
                Restaurant.deleted_at.is_(None),
                or_(
                    Restaurant.id == payload.restaurantId,
                    Restaurant.slug == payload.restaurantId.lower(),
                    Restaurant.public_slug == payload.restaurantId.lower()
                )
            )
            res_rest = await db.execute(query_rest)
            db_rest = res_rest.scalar_one_or_none()
            if not db_rest:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Restaurant '{payload.restaurantId}' was not found"
                )
            if db_rest.lifecycle_status in ["SUSPENDED", "ARCHIVED"]:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Restaurant '{payload.restaurantId}' is archived or suspended"
                )
            restaurant = CachedRestaurant(
                id=db_rest.id,
                lifecycle_status=db_rest.lifecycle_status,
                owner_uid=db_rest.owner_uid,
                owner_email=db_rest.owner_email,
                has_kitchen=getattr(db_rest, "has_kitchen", True),
                has_bar=getattr(db_rest, "has_bar", True),
                has_waiter=getattr(db_rest, "has_waiter", True),
                enabled_modules=getattr(db_rest, "enabled_modules", None)
            )
            _ORDER_RESTAURANT_CACHE[payload.restaurantId] = (now_mono, restaurant)
            _ORDER_RESTAURANT_CACHE[restaurant.id] = (now_mono, restaurant)

        # Tenant Authorization Check: If caller provides credentials, verify they belong to this restaurant
        if caller.is_authenticated and not caller.is_admin:
            if caller.role in ["OWNER", "RESTAURANT_OWNER"]:
                is_owner = False
                if caller.uid and restaurant.owner_uid and caller.uid == restaurant.owner_uid:
                    is_owner = True
                elif caller.email and restaurant.owner_email and caller.email.lower() == restaurant.owner_email.lower():
                    is_owner = True
                if not is_owner:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Forbidden: You do not have permission to order or mutate into another tenant's restaurant."
                    )
            elif caller.role in ["WAITER", "CHEF", "KITCHEN", "BAR", "BARTENDER", "MANAGER"]:
                if caller.restaurant_id and caller.restaurant_id != restaurant.id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Forbidden: Staff member does not belong to this restaurant."
                    )

        now_utc = datetime.now(timezone.utc)
        tbl_num = payload.tableNumber or "Table 01"
        tbl_id = payload.tableId or f"tbl-{restaurant.id}-{(tbl_num).lower().replace(' ', '_')}"

        existing_tbl = None
        if payload.tableId:
            res_tbl_check = await db.execute(select(Table).where(Table.id == payload.tableId))
            existing_tbl = res_tbl_check.scalar_one_or_none()
            if existing_tbl and existing_tbl.restaurant_id != restaurant.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Table '{payload.tableId}' does not belong to restaurant '{restaurant.id}'"
                )
        else:
            res_tbl_check = await db.execute(select(Table).where(
                (Table.restaurant_id == restaurant.id) & 
                ((Table.table_number == tbl_num) | (Table.table_number == f"Table {tbl_num}"))
            ))
            existing_tbl = res_tbl_check.scalar_one_or_none()

        actual_session_id = None
        if existing_tbl:
            tbl_id = existing_tbl.id
            tbl_num = existing_tbl.table_number
        else:
            tbl_id = None

        session_id = payload.tableSessionId or f"sess-{restaurant.id}-{tbl_id or 'none'}-{int(now_utc.timestamp() * 1000)}"

        try:
            from sqlalchemy import case
            if payload.tableSessionId:
                res_direct_sess = await db.execute(
                    select(TableSession).where(
                        (TableSession.restaurant_id == restaurant.id) &
                        (TableSession.id == payload.tableSessionId) &
                        (TableSession.status == "ACTIVE")
                    )
                )
                direct_sess = res_direct_sess.scalar_one_or_none()
                if direct_sess:
                    actual_session_id = direct_sess.id
                    if direct_sess.table_id and not tbl_id:
                        tbl_id = direct_sess.table_id
                    if direct_sess.table_number:
                        tbl_num = direct_sess.table_number

            if not actual_session_id and tbl_id:
                query_sess = select(TableSession).where(
                    (TableSession.restaurant_id == restaurant.id) &
                    (
                        (TableSession.id == session_id) |
                        (
                            ((TableSession.table_id == tbl_id) | (TableSession.table_number == tbl_num)) &
                            (TableSession.status == "ACTIVE")
                        )
                    )
                ).order_by(
                    case((TableSession.id == session_id, 1), else_=0).desc(),
                    TableSession.session_started_at.desc()
                ).limit(1)
                res_sess = await db.execute(query_sess)
                matched_sess = res_sess.scalar_one_or_none()

                if matched_sess and matched_sess.status == "ACTIVE":
                    actual_session_id = matched_sess.id
                elif existing_tbl:
                    try:
                        async with db.begin_nested():
                            new_sess = TableSession(
                                id=session_id,
                                restaurant_id=restaurant.id,
                                table_id=tbl_id,
                                table_number=tbl_num,
                                status="ACTIVE",
                                session_started_at=now_utc
                            )
                            db.add(new_sess)
                            await db.flush()
                            actual_session_id = new_sess.id
                    except Exception as flush_err:
                        print("[SESSION_CREATION_RACE_HANDLED]:", flush_err)
                        res_sess_race = await db.execute(select(TableSession).where(
                            (TableSession.restaurant_id == restaurant.id) &
                            (TableSession.table_id == tbl_id) &
                            (TableSession.status == "ACTIVE")
                        ).order_by(TableSession.session_started_at.desc()).limit(1))
                        race_sess = res_sess_race.scalar_one_or_none()
                        if race_sess:
                            actual_session_id = race_sess.id
        except Exception as sess_err:
            print("[SESSION_CREATION_NOTICE] TableSession creation handled:", sess_err)

        items_list_dict = [i.model_dump() for i in payload.items]
        subtotal = sum((float(i.get("price") or 0) * int(i.get("quantity") or 1)) for i in items_list_dict)
        tax_amount = 0.0
        total = subtotal
        tax_breakdown = []

        try:
            cached_tax_entry = _ORDER_TAX_CACHE.get(restaurant.id)
            if cached_tax_entry and (now_mono - cached_tax_entry[0] < _ORDER_TAX_CACHE_TTL):
                active_taxes, tax_cats_map, tax_items_map = cached_tax_entry[1]
            else:
                res_taxes = await db.execute(
                    select(Tax).where((Tax.restaurant_id == restaurant.id) & (Tax.status == "ACTIVE"))
                )
                raw_taxes = res_taxes.scalars().all()
                active_taxes = [
                    CachedTax(
                        id=t.id,
                        name=t.name,
                        type=t.type,
                        rate=float(t.rate or 0.0),
                        fixed_amount=float(t.fixed_amount or 0.0),
                        is_inclusive=bool(t.is_inclusive),
                        status=t.status,
                        applicable_order_types=list(t.applicable_order_types or []),
                        applies_to=t.applies_to
                    )
                    for t in raw_taxes
                ]

                tax_cats_map: Dict[str, List[str]] = {}
                tax_items_map: Dict[str, List[str]] = {}
                if raw_taxes:
                    tax_ids = [t.id for t in raw_taxes]
                    c_res = await db.execute(select(TaxCategory.tax_id, TaxCategory.category_id).where(TaxCategory.tax_id.in_(tax_ids)))
                    for tid, cid in c_res.all():
                        tax_cats_map.setdefault(tid, []).append(cid)

                    i_res = await db.execute(select(TaxMenuItem.tax_id, TaxMenuItem.menu_item_id).where(TaxMenuItem.tax_id.in_(tax_ids)))
                    for tid, mid in i_res.all():
                        tax_items_map.setdefault(tid, []).append(mid)

                _ORDER_TAX_CACHE[restaurant.id] = (now_mono, (active_taxes, tax_cats_map, tax_items_map))

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

        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if restaurant.id in _ORDER_DAILY_SEQ and _ORDER_DAILY_SEQ[restaurant.id][0] == today_str:
            daily_seq = _ORDER_DAILY_SEQ[restaurant.id][1] + 1
            _ORDER_DAILY_SEQ[restaurant.id] = (today_str, daily_seq)
        else:
            today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
            query_count = select(func.count(Order.id)).where(
                (Order.restaurant_id == restaurant.id) &
                (Order.created_at >= today_start)
            )
            res_count = await db.execute(query_count)
            daily_seq = (res_count.scalar() or 0) + 1
            _ORDER_DAILY_SEQ[restaurant.id] = (today_str, daily_seq)
        order_num = f"#ORD-{daily_seq}"

        now_utc = datetime.now(timezone.utc)
        candidate_order_id = payload.id or payload.idempotencyKey or payload.clientOrderId
        if candidate_order_id:
            res_existing = await db.execute(select(Order).where(Order.id == candidate_order_id))
            existing_ord = res_existing.scalar_one_or_none()
            if existing_ord:
                print(f"[ORDER_IDEMPOTENCY_HIT] Returning existing order {candidate_order_id}")
                return format_order_response(existing_ord)
            order_id = candidate_order_id
        else:
            order_id = f"ord-{restaurant.id}-{int(now_utc.timestamp() * 1000)}"

        print(f"[ORDER_DATABASE_INSERT] order_id={order_id} restaurant_id={restaurant.id} table_id={tbl_id} session_id={session_id}")

        new_order = Order(
            id=order_id,
            restaurant_id=restaurant.id,
            table_id=tbl_id,
            table_number=tbl_num,
            table_session_id=actual_session_id,
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
            created_at=now_utc,
        )
        db.add(new_order)

        try:
            tbl_target = existing_tbl
            if not tbl_target:
                query_tbl = select(Table).where(
                    (Table.restaurant_id == restaurant.id) &
                    ((Table.id == tbl_id) | (Table.table_number == tbl_num))
                )
                res_tbl = await db.execute(query_tbl)
                tbls = res_tbl.scalars().all()
                if tbls:
                    tbl_target = tbls[0]
            if tbl_target:
                tbl_target.status = "OCCUPIED"
                tbl_target.is_occupied = True
                tbl_target.active_session_id = session_id
                from app.modules.tables.router import invalidate_tables_cache
                invalidate_tables_cache(restaurant.id)
        except Exception as tbl_err:
            print("[TABLE_UPDATE_NOTICE] Table update skipped:", tbl_err)

        for idx, i in enumerate(payload.items):
            new_item = OrderItem(
                id=f"oi-{int(now_utc.timestamp() * 1000)}-{idx}",
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
        print(f"[ORDER_DATABASE_COMMITTED] order_id={order_id} restaurant_id={restaurant.id} total={total}")
        resp_data = format_order_response(new_order)

        try:
            from app.modules.websocket.manager import ws_manager
            order_target_aud = ["CUSTOMER", "OWNER"]
            if restaurant.has_kitchen is not False and (not restaurant.enabled_modules or "kitchen" in restaurant.enabled_modules):
                order_target_aud.append("KITCHEN")
            if restaurant.has_bar is not False and (not restaurant.enabled_modules or "bar" in restaurant.enabled_modules):
                order_target_aud.append("BAR")
            if restaurant.has_waiter is not False and (not restaurant.enabled_modules or "waiter" in restaurant.enabled_modules):
                order_target_aud.append("WAITER")

            await ws_manager.broadcast_event(
                restaurant_id=restaurant.id,
                event_type="order_created",
                payload=resp_data,
                target_audience=order_target_aud
            )
            # Instantly update Active Tables across Owner, Waiter, and Customer terminals
            if tbl_id or tbl_num:
                table_evt_payload = {
                    "restaurant_id": restaurant.id,
                    "restaurantId": restaurant.id,
                    "table_id": tbl_id,
                    "tableId": tbl_id,
                    "table_number": tbl_num,
                    "tableNumber": tbl_num,
                    "status": "OCCUPIED",
                    "is_occupied": True,
                    "isOccupied": True,
                    "table_session_id": session_id,
                    "tableSessionId": session_id,
                    "order_id": order_id,
                    "orderId": order_id,
                    "order_number": order_num,
                    "orderNumber": order_num,
                    "total_amount": total,
                    "totalAmount": total,
                    "timestamp": now_utc.isoformat(),
                }
                await ws_manager.broadcast_event(
                    restaurant_id=restaurant.id,
                    event_type="table_updated",
                    payload=table_evt_payload,
                    target_audience=["WAITER", "OWNER", "CUSTOMER"]
                )
                await ws_manager.broadcast_event(
                    restaurant_id=restaurant.id,
                    event_type="table_status_updated",
                    payload=table_evt_payload,
                    target_audience=["WAITER", "OWNER", "CUSTOMER"]
                )
        except Exception as ws_err:
            print("[WS_BROADCAST_NOTICE] order_created / table_updated:", ws_err)

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
    try:
        from app.core.tenant.resolver import resolve_canonical_restaurant_id
        canonical_rest_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_rest_id = restaurant_id

    query = select(Order).where(
        (Order.restaurant_id == canonical_rest_id) &
        (Order.status != "CANCELLED")
    )
    if table_session_id:
        query = query.where(Order.table_session_id == table_session_id)
    elif table_id:
        from app.modules.tables.models import TableSession
        query_sess = select(TableSession).where(
            (TableSession.restaurant_id == canonical_rest_id) &
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
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    try:
        target_rest_id = caller.restaurant_id or restaurant_id
        try:
            from app.core.tenant.resolver import resolve_canonical_restaurant_id
            target_rest_id = await resolve_canonical_restaurant_id(target_rest_id, db)
        except Exception:
            pass

        query = select(Order).where(Order.restaurant_id == target_rest_id)
        if active_only:
            query_sess = select(TableSession.id).where(
                (TableSession.restaurant_id == target_rest_id) &
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

        query = query.order_by(Order.created_at.desc()).limit(limit).offset(offset)
        result = await db.execute(query)
        orders = result.scalars().all()
        return [format_order_response(o) for o in orders]
    except HTTPException:
        raise
    except Exception as e:
        print("[KITCHEN_ORDER_FETCH_EXCEPT]:", e)
        return []


@router.put("/{order_id}/status")
@router.patch("/{order_id}/status")
async def update_order_status(
    order_id: str,
    payload: UpdateOrderStatusSchema,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    query = select(Order).where(Order.id == order_id)
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if not caller.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to update order status"
        )

    res_r = await db.execute(select(Restaurant).where(Restaurant.id == order.restaurant_id))
    r_obj = res_r.scalar_one_or_none()
    if not r_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")

    if not caller.is_admin:
        if caller.role in ["OWNER", "RESTAURANT_OWNER"]:
            # Check owner
            is_owner = (caller.uid and r_obj.owner_uid == caller.uid) or (caller.email and r_obj.owner_email and caller.email.lower() == r_obj.owner_email.lower())
            if not is_owner:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Not authorized for this restaurant")
        elif caller.role in ["WAITER", "SERVER", "HOST", "CHEF", "COOK", "KITCHEN", "BAR", "BARTENDER", "MANAGER"]:
            if caller.restaurant_id and caller.restaurant_id != order.restaurant_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Staff member does not belong to this restaurant")
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Role not authorized to update order status")

    # Authoritative terminal enablement enforcement
    if payload.kitchenStatus and (r_obj.has_kitchen is False or (r_obj.enabled_modules and "kitchen" not in r_obj.enabled_modules)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kitchen terminal is disabled for this restaurant.")
    if payload.barStatus and (r_obj.has_bar is False or (r_obj.enabled_modules and "bar" not in r_obj.enabled_modules)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bar terminal is disabled for this restaurant.")

    # Role-based delivery authorization (Part A & Part F)
    # Kitchen responsibilities end at: NEW -> PREPARING -> READY
    # Kitchen and Bar roles must NOT be able to deliver plates to customer tables.
    # Only WAITER, SERVER, OWNER, RESTAURANT_OWNER, and MANAGER can mark an order DELIVERED.
    target_status = (payload.status or "").upper()
    target_kitchen = (payload.kitchenStatus or "").upper()
    is_delivery_attempt = target_status in ["DELIVERED", "COMPLETED"] or target_kitchen in ["DELIVERED", "COMPLETED"]
    if is_delivery_attempt:
        caller_role = (caller.role or "").upper()
        allowed_delivery_roles = ["WAITER", "SERVER", "OWNER", "RESTAURANT_OWNER", "MANAGER"]
        if not caller.is_admin and caller_role not in allowed_delivery_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Kitchen staff cannot deliver orders to tables. Role '{caller_role}' is not authorized to deliver. Only Waiter and Manager roles own delivery."
            )

    if payload.status:
        order.status = payload.status
        if payload.status == "DELIVERED":
            order.delivered_at = datetime.now(timezone.utc)
    if payload.kitchenStatus:
        order.kitchen_status = payload.kitchenStatus
    if payload.barStatus:
        order.bar_status = payload.barStatus

    if (payload.kitchenStatus == "PREPARING" or payload.status == "PREPARING" or payload.status == "IN_KITCHEN") and not order.eta_target_timestamp:
        prep_mins = payload.estimatedPrepTimeMinutes or order.estimated_prep_time_minutes or 15
        order.estimated_prep_time_minutes = prep_mins
        order.eta_target_timestamp = datetime.now(timezone.utc) + timedelta(minutes=prep_mins)

    if payload.estimatedPrepTimeMinutes is not None:
        order.estimated_prep_time_minutes = payload.estimatedPrepTimeMinutes
        if not order.eta_target_timestamp:
            order.eta_target_timestamp = datetime.now(timezone.utc) + timedelta(minutes=payload.estimatedPrepTimeMinutes)
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
            ready_payload = {
                **resp_data,
                "orderId": order.id,
                "order_id": order.id,
                "order": resp_data,
                "table_id": order.table_id,
                "tableId": order.table_id,
                "table_number": order.table_number,
                "tableNumber": order.table_number,
                "table_session_id": order.table_session_id,
                "tableSessionId": order.table_session_id,
            }
            await ws_manager.broadcast_event(
                restaurant_id=order.restaurant_id,
                event_type="order_ready",
                payload=ready_payload,
                target_audience=["WAITER", "CUSTOMER", "OWNER"]
            )
        if payload.status == "DELIVERED":
            delivered_payload = {
                **resp_data,
                "orderId": order.id,
                "order_id": order.id,
                "order": resp_data,
                "table_id": order.table_id,
                "tableId": order.table_id,
                "table_number": order.table_number,
                "tableNumber": order.table_number,
                "table_session_id": order.table_session_id,
                "tableSessionId": order.table_session_id,
            }
            await ws_manager.broadcast_event(
                restaurant_id=order.restaurant_id,
                event_type="order_delivered",
                payload=delivered_payload,
                target_audience=["WAITER", "CUSTOMER", "OWNER", "POS"]
            )
        if payload.estimatedPrepTimeMinutes is not None or payload.etaTargetTimestamp is not None:
            await ws_manager.broadcast_event(
                restaurant_id=order.restaurant_id,
                event_type="ETAUpdated",
                payload={
                    "orderId": order.id,
                    "order_id": order.id,
                    "restaurantId": order.restaurant_id,
                    "restaurant_id": order.restaurant_id,
                    "tableNumber": order.table_number,
                    "table_number": order.table_number,
                    "estimatedPrepTimeMinutes": order.estimated_prep_time_minutes,
                    "etaTargetTimestamp": resp_data.get("eta_target_timestamp") or resp_data.get("etaTargetTimestamp"),
                    "data": resp_data,
                },
                target_audience=["KITCHEN", "WAITER", "CUSTOMER", "OWNER"]
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

@router.put("/{order_id}/eta")
@router.patch("/{order_id}/eta")
async def update_order_eta(
    order_id: str,
    payload: UpdateOrderETASchema,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    query = select(Order).where(Order.id == order_id)
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if not caller.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to update order ETA"
        )

    if not caller.is_admin:
        if caller.role in ["WAITER", "SERVER", "HOST", "CHEF", "COOK", "KITCHEN", "BAR", "BARTENDER", "MANAGER"]:
            if caller.restaurant_id and caller.restaurant_id != order.restaurant_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Staff member does not belong to this restaurant")
        elif caller.role in ["OWNER", "RESTAURANT_OWNER"]:
            # Use cached restaurant context if available
            r_obj = None
            cached_r = _ORDER_RESTAURANT_CACHE.get(order.restaurant_id)
            if cached_r and (time.time() - cached_r[0] < _ORDER_RESTAURANT_CACHE_TTL):
                r_obj = cached_r[1]
            if not r_obj:
                res_r = await db.execute(select(Restaurant).where(Restaurant.id == order.restaurant_id))
                db_r_obj = res_r.scalar_one_or_none()
                if db_r_obj:
                    r_obj = CachedRestaurant(
                        id=db_r_obj.id,
                        lifecycle_status=db_r_obj.lifecycle_status,
                        owner_uid=db_r_obj.owner_uid,
                        owner_email=db_r_obj.owner_email
                    )
                    _ORDER_RESTAURANT_CACHE[order.restaurant_id] = (time.time(), r_obj)
            is_owner = r_obj and ((caller.uid and r_obj.owner_uid == caller.uid) or (caller.email and r_obj.owner_email and caller.email.lower() == r_obj.owner_email.lower()))
            if not is_owner:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Not authorized for this restaurant")
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Role not authorized to update order ETA")

    current_mins = order.estimated_prep_time_minutes or 15
    if payload.deltaMinutes is not None:
        new_mins = max(1, current_mins + payload.deltaMinutes)
        order.estimated_prep_time_minutes = new_mins
        base_time = order.eta_target_timestamp or datetime.now(timezone.utc)
        order.eta_target_timestamp = base_time + timedelta(minutes=payload.deltaMinutes)
    elif payload.estimatedPrepTimeMinutes is not None:
        order.estimated_prep_time_minutes = max(1, payload.estimatedPrepTimeMinutes)
        order.eta_target_timestamp = datetime.now(timezone.utc) + timedelta(minutes=order.estimated_prep_time_minutes)

    if payload.targetTimestamp:
        try:
            dt_val = datetime.fromisoformat(payload.targetTimestamp.replace("Z", "+00:00"))
            order.eta_target_timestamp = dt_val
        except Exception:
            pass

    await db.commit()
    resp_data = format_order_response(order)

    try:
        from app.modules.websocket.manager import ws_manager
        await ws_manager.broadcast_event(
            restaurant_id=order.restaurant_id,
            event_type="ETAUpdated",
            payload={
                "orderId": order.id,
                "order_id": order.id,
                "restaurantId": order.restaurant_id,
                "restaurant_id": order.restaurant_id,
                "tableNumber": order.table_number,
                "table_number": order.table_number,
                "estimatedPrepTimeMinutes": order.estimated_prep_time_minutes,
                "etaTargetTimestamp": resp_data.get("eta_target_timestamp") or resp_data.get("etaTargetTimestamp"),
                "reason": payload.reason or "ETA Updated",
                "data": resp_data,
            },
            target_audience=["KITCHEN", "WAITER", "CUSTOMER", "OWNER"]
        )
    except Exception as ws_err:
        print("[WS_BROADCAST_NOTICE]:", ws_err)

    return resp_data

@router.get("/{order_id}")
async def get_order_by_id(order_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Order).where(Order.id == order_id)
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return format_order_response(order)



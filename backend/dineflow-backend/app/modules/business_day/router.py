import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, or_, func

from app.core.database.connection import get_db
from app.core.security.tenant_auth import require_tenant_owner_or_admin, get_caller_context, CallerContext
from app.modules.restaurants.models import Restaurant
from app.modules.business_day.models import BusinessDay
from app.modules.business_day.schemas import CloseDaySchema, OpenDaySchema, BusinessDayPrecheckResponse
from app.modules.orders.models import Order, Bill
from app.modules.tables.models import Table, TableSession
from app.modules.customer_requests.models import CustomerRequestModel
from app.modules.websocket.manager import ws_manager
from app.modules.admin.audit_service import AdminAuditLogger

logger = logging.getLogger(__name__)

router = APIRouter()


def compute_next_business_date(current_date_str: str) -> str:
    """
    Authoritative computation of next business date from a date formatted as '%d %b %Y' (e.g. '04 Oct 2026').
    Safely advances the calendar day and supports cross-midnight operational shifts.
    """
    try:
        dt = datetime.strptime(current_date_str.strip(), "%d %b %Y")
        next_dt = dt + timedelta(days=1)
        return next_dt.strftime("%d %b %Y")
    except Exception:
        now_utc = datetime.now(timezone.utc)
        return (now_utc + timedelta(days=1)).strftime("%d %b %Y")


async def _resolve_restaurant(restaurant_id: str, db: AsyncSession) -> Restaurant:
    clean_id = (restaurant_id or "").strip()
    query = select(Restaurant).where(
        or_(
            Restaurant.id == clean_id,
            func.lower(Restaurant.id) == clean_id.lower(),
            Restaurant.slug == clean_id.lower(),
            Restaurant.public_slug == clean_id.lower(),
        ),
        Restaurant.deleted_at.is_(None)
    )
    result = await db.execute(query)
    rest = result.scalar_one_or_none()
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")
    return rest


def _format_business_day(bday: BusinessDay) -> dict:
    next_date = compute_next_business_date(bday.business_date) if bday.business_date else None
    avg_order_val = round(bday.total_sales / bday.total_orders, 2) if bday.total_orders > 0 else 0.0

    return {
        "id": bday.id,
        "restaurant_id": bday.restaurant_id,
        "restaurantId": bday.restaurant_id,
        "business_date": bday.business_date,
        "businessDate": bday.business_date,
        "date": bday.business_date,
        "current_business_date": bday.business_date,
        "currentBusinessDate": bday.business_date,
        "next_business_date": next_date,
        "nextBusinessDate": next_date,
        "status": bday.status,
        "opened_at": bday.opened_at.isoformat() if bday.opened_at else None,
        "openedAt": bday.opened_at.isoformat() if bday.opened_at else None,
        "opened_by": bday.opened_by,
        "openedBy": bday.opened_by,
        "closed_at": bday.closed_at.isoformat() if bday.closed_at else None,
        "closedAt": bday.closed_at.isoformat() if bday.closed_at else None,
        "closed_by": bday.closed_by,
        "closedBy": bday.closed_by,
        "total_orders": bday.total_orders,
        "totalOrders": bday.total_orders,
        "food_orders": bday.food_orders,
        "foodOrders": bday.food_orders,
        "bar_orders": bday.bar_orders,
        "barOrders": bday.bar_orders,
        "completed_orders": bday.completed_orders,
        "completedOrders": bday.completed_orders,
        "cancelled_orders": bday.cancelled_orders,
        "cancelledOrders": bday.cancelled_orders,
        "total_sales": bday.total_sales,
        "totalSales": bday.total_sales,
        "food_sales": bday.food_sales,
        "foodSales": bday.food_sales,
        "bar_sales": bday.bar_sales,
        "barSales": bday.bar_sales,
        "tax_amount": bday.tax_amount,
        "taxAmount": bday.tax_amount,
        "discount_amount": bday.discount_amount,
        "discountAmount": bday.discount_amount,
        "cash_sales": bday.cash_sales,
        "cashSales": bday.cash_sales,
        "card_sales": bday.card_sales,
        "cardSales": bday.card_sales,
        "upi_sales": bday.upi_sales,
        "upiSales": bday.upi_sales,
        "average_order_value": avg_order_val,
        "averageOrderValue": avg_order_val,
        "closing_notes": bday.closing_notes,
        "closingNotes": bday.closing_notes,
        "summary": bday.summary_json or {
            "totalOrders": bday.total_orders,
            "completedOrders": bday.completed_orders,
            "cancelledOrders": bday.cancelled_orders,
            "totalSales": bday.total_sales,
            "foodSales": bday.food_sales,
            "barSales": bday.bar_sales,
            "cashSales": bday.cash_sales,
            "cardSales": bday.card_sales,
            "upiSales": bday.upi_sales,
            "taxAmount": bday.tax_amount,
            "discountAmount": bday.discount_amount,
            "averageOrderValue": avg_order_val,
        },
    }


@router.get("/current")
async def get_current_business_day(
    restaurant_id: str,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    rest = await _resolve_restaurant(restaurant_id, db)
    
    # Query latest OPEN business day
    query = select(BusinessDay).where(
        BusinessDay.restaurant_id == rest.id,
        BusinessDay.status == "OPEN"
    ).order_by(BusinessDay.opened_at.desc())
    res = await db.execute(query)
    current_bday = res.scalar_one_or_none()

    if not current_bday:
        # Check if restaurant has any existing closed business days
        any_day_res = await db.execute(
            select(BusinessDay).where(
                BusinessDay.restaurant_id == rest.id
            ).order_by(BusinessDay.closed_at.desc(), BusinessDay.opened_at.desc()).limit(1)
        )
        latest_bday = any_day_res.scalar_one_or_none()
        if not latest_bday:
            # Brand new restaurant with no business day records at all: auto-initialize initial day
            now_utc = datetime.now(timezone.utc)
            today_str = now_utc.strftime("%d %b %Y")
            new_id = f"bday-{rest.id}-{uuid.uuid4().hex[:10]}"
            current_bday = BusinessDay(
                id=new_id,
                restaurant_id=rest.id,
                business_date=today_str,
                status="OPEN",
                opened_at=now_utc,
                opened_by=caller.email or caller.role or "System / Auto-Init",
            )
            db.add(current_bday)
            await db.commit()
            await db.refresh(current_bday)
        else:
            # Return the latest business day (which is currently CLOSED)
            current_bday = latest_bday

    formatted = _format_business_day(current_bday)

    # Enrich with live operational counters
    tbl_res = await db.execute(
        select(func.count(Table.id)).where(Table.restaurant_id == rest.id, Table.status == "OCCUPIED")
    )
    active_tables_count = tbl_res.scalar() or 0
    formatted["active_tables_count"] = active_tables_count
    formatted["activeTablesCount"] = active_tables_count

    sess_res = await db.execute(
        select(func.count(TableSession.id)).where(TableSession.restaurant_id == rest.id, TableSession.status == "ACTIVE")
    )
    active_sessions_count = sess_res.scalar() or 0
    formatted["active_sessions_count"] = active_sessions_count
    formatted["activeSessionsCount"] = active_sessions_count

    bills_res = await db.execute(
        select(func.count(Bill.id)).where(
            Bill.restaurant_id == rest.id,
            or_(
                Bill.status.in_(["OPEN", "PENDING", "BILL_REQUESTED", "PAYMENT_PENDING"]),
                Bill.payment_status.in_(["UNPAID", "PAYMENT_PENDING", "PAYMENT_VERIFICATION_REQUIRED", "PENDING"])
            ),
            Bill.status.notin_(["CANCELLED", "PAID"])
        )
    )
    unpaid_bills_count = bills_res.scalar() or 0
    formatted["unpaid_bills_count"] = unpaid_bills_count
    formatted["unpaidBillsCount"] = unpaid_bills_count

    k_res = await db.execute(
        select(func.count(Order.id)).where(
            Order.restaurant_id == rest.id,
            Order.kitchen_status.in_(["PENDING", "ACCEPTED", "PREPARING"])
        )
    )
    kitchen_pending_count = k_res.scalar() or 0
    formatted["kitchen_pending_count"] = kitchen_pending_count
    formatted["kitchenPendingCount"] = kitchen_pending_count

    b_res = await db.execute(
        select(func.count(Order.id)).where(
            Order.restaurant_id == rest.id,
            Order.bar_status.in_(["PENDING", "ACCEPTED", "PREPARING"])
        )
    )
    bar_pending_count = b_res.scalar() or 0
    formatted["bar_pending_count"] = bar_pending_count
    formatted["barPendingCount"] = bar_pending_count

    w_res = await db.execute(
        select(func.count(CustomerRequestModel.id)).where(
            CustomerRequestModel.restaurant_id == rest.id,
            CustomerRequestModel.status == "PENDING"
        )
    )
    waiter_pending_count = w_res.scalar() or 0
    formatted["waiter_pending_count"] = waiter_pending_count
    formatted["waiterPendingCount"] = waiter_pending_count

    return formatted


@router.get("/precheck")
async def get_business_day_precheck(
    restaurant_id: str,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    rest = await _resolve_restaurant(restaurant_id, db)

    # 1. Open Tables
    tbl_rows_res = await db.execute(
        select(Table).where(Table.restaurant_id == rest.id, Table.status == "OCCUPIED")
    )
    occupied_tables = tbl_rows_res.scalars().all()
    open_tables_count = len(occupied_tables)

    # 2. Active Table Sessions
    sess_res = await db.execute(
        select(func.count(TableSession.id)).where(TableSession.restaurant_id == rest.id, TableSession.status == "ACTIVE")
    )
    active_sessions_count = sess_res.scalar() or 0

    # 3. Open Orders Count (distinct orders not yet completed or cancelled)
    ord_open_res = await db.execute(
        select(func.count(Order.id)).where(
            Order.restaurant_id == rest.id,
            Order.status.in_(["PENDING", "ACCEPTED", "PREPARING", "READY"])
        )
    )
    open_orders_count = ord_open_res.scalar() or 0

    # 4. Uncompleted Kitchen Orders
    k_res = await db.execute(
        select(func.count(Order.id)).where(
            Order.restaurant_id == rest.id,
            Order.kitchen_status.in_(["PENDING", "ACCEPTED", "PREPARING"])
        )
    )
    uncompleted_kitchen_count = k_res.scalar() or 0

    # 5. Uncompleted Bar Orders
    b_res = await db.execute(
        select(func.count(Order.id)).where(
            Order.restaurant_id == rest.id,
            Order.bar_status.in_(["PENDING", "ACCEPTED", "PREPARING"])
        )
    )
    uncompleted_bar_count = b_res.scalar() or 0

    # 6. Open Waiter Requests
    w_res = await db.execute(
        select(func.count(CustomerRequestModel.id)).where(
            CustomerRequestModel.restaurant_id == rest.id,
            CustomerRequestModel.status == "PENDING"
        )
    )
    open_waiter_requests_count = w_res.scalar() or 0

    # 7. Unpaid Bills
    bills_rows_res = await db.execute(
        select(Bill).where(
            Bill.restaurant_id == rest.id,
            or_(
                Bill.status.in_(["OPEN", "PENDING", "BILL_REQUESTED", "PAYMENT_PENDING"]),
                Bill.payment_status.in_(["UNPAID", "PAYMENT_PENDING", "PAYMENT_VERIFICATION_REQUIRED", "PENDING"])
            ),
            Bill.status.notin_(["CANCELLED", "PAID"])
        )
    )
    unpaid_bills = bills_rows_res.scalars().all()
    unpaid_bills_count = len(unpaid_bills)

    # Summary metrics today
    curr_bday_res = await db.execute(
        select(BusinessDay).where(BusinessDay.restaurant_id == rest.id, BusinessDay.status == "OPEN").order_by(BusinessDay.opened_at.desc())
    )
    open_bday = curr_bday_res.scalar_one_or_none()
    
    since_time = open_bday.opened_at if open_bday else datetime.now(timezone.utc).replace(hour=0, minute=0, second=0)
    
    ords_res = await db.execute(
        select(func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0.0)).where(
            Order.restaurant_id == rest.id,
            Order.created_at >= since_time,
            Order.status != "CANCELLED"
        )
    )
    ord_row = ords_res.first()
    total_orders_today = ord_row[0] if ord_row else 0
    total_sales_today = float(ord_row[1]) if ord_row else 0.0

    warnings = []
    blocking_reasons: List[Dict[str, Any]] = []

    for t in occupied_tables:
        label = f"Table {t.table_number} is still occupied."
        warnings.append(label)
        blocking_reasons.append({
            "type": "TABLE",
            "id": t.id,
            "table_number": t.table_number,
            "label": label,
            "link": "/tables",
        })

    for b in unpaid_bills:
        inv = b.invoice_number or b.id[:8]
        label = f"Bill #{inv} for Table {b.table_number} is unpaid."
        warnings.append(label)
        blocking_reasons.append({
            "type": "BILL",
            "id": b.id,
            "table_number": b.table_number,
            "amount": b.grand_total,
            "label": label,
            "link": "/billing",
        })

    if uncompleted_kitchen_count > 0:
        warnings.append(f"{uncompleted_kitchen_count} order(s) still in preparation in Kitchen KDS.")
    if uncompleted_bar_count > 0:
        warnings.append(f"{uncompleted_bar_count} beverage order(s) pending in Bar station.")
    if open_waiter_requests_count > 0:
        warnings.append(f"{open_waiter_requests_count} customer service request(s) open.")

    can_close = len(warnings) == 0

    return {
        "canClose": can_close,
        "can_close_safely": can_close,
        "openTablesCount": open_tables_count,
        "active_tables_count": open_tables_count,
        "activeSessionsCount": active_sessions_count,
        "active_sessions_count": active_sessions_count,
        "uncompletedKitchenOrdersCount": uncompleted_kitchen_count,
        "uncompletedBarOrdersCount": uncompleted_bar_count,
        "open_orders_count": open_orders_count,
        "openOrdersCount": open_orders_count,
        "openWaiterRequestsCount": open_waiter_requests_count,
        "open_waiter_requests_count": open_waiter_requests_count,
        "unpaidBillsCount": unpaid_bills_count,
        "unpaid_bills_count": unpaid_bills_count,
        "totalOrdersToday": total_orders_today,
        "total_orders_today": total_orders_today,
        "totalSalesToday": total_sales_today,
        "total_sales_today": total_sales_today,
        "warnings": warnings,
        "blocking_reasons": blocking_reasons,
    }


@router.post("/close")
async def close_business_day(
    restaurant_id: str,
    payload: CloseDaySchema = CloseDaySchema(),
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    rest = await _resolve_restaurant(restaurant_id, db)

    # 1. Fetch current OPEN day with database row lock (concurrency / double-close protection)
    query = select(BusinessDay).where(
        BusinessDay.restaurant_id == rest.id,
        BusinessDay.status == "OPEN"
    ).with_for_update().order_by(BusinessDay.opened_at.desc())
    res = await db.execute(query)
    current_bday = res.scalar_one_or_none()

    if not current_bday:
        any_day_res = await db.execute(select(func.count(BusinessDay.id)).where(BusinessDay.restaurant_id == rest.id))
        count = any_day_res.scalar() or 0
        if count == 0:
            now_utc = datetime.now(timezone.utc)
            today_str = now_utc.strftime("%d %b %Y")
            current_bday = BusinessDay(
                id=f"bday-{rest.id}-{uuid.uuid4().hex[:10]}",
                restaurant_id=rest.id,
                business_date=today_str,
                status="OPEN",
                opened_at=now_utc,
                opened_by=caller.email or caller.role or "System / Auto-Init",
            )
            db.add(current_bday)
            await db.flush()
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No active open business day found. The current business day is already closed."
            )

    # Precheck enforcement: if force_close is not set, verify that active tables / unpaid bills do not block closing
    is_force_close = bool(payload.force_close or payload.forceCloseActiveTables)
    if not is_force_close:
        tbl_res = await db.execute(
            select(func.count(Table.id)).where(Table.restaurant_id == rest.id, Table.status == "OCCUPIED")
        )
        occupied_count = tbl_res.scalar() or 0

        bills_res = await db.execute(
            select(func.count(Bill.id)).where(
                Bill.restaurant_id == rest.id,
                or_(
                    Bill.status.in_(["OPEN", "PENDING", "BILL_REQUESTED", "PAYMENT_PENDING"]),
                    Bill.payment_status.in_(["UNPAID", "PAYMENT_PENDING", "PAYMENT_VERIFICATION_REQUIRED", "PENDING"])
                ),
                Bill.status.notin_(["CANCELLED", "PAID"])
            )
        )
        unpaid_count = bills_res.scalar() or 0

        if occupied_count > 0 or unpaid_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot close day yet. {occupied_count} table(s) are occupied and {unpaid_count} bill(s) are unpaid. Please settle them or confirm force close."
            )

    now_utc = datetime.now(timezone.utc)
    since_time = current_bday.opened_at

    # 2. Calculate authoritative operational and financial summary for the day
    orders_res = await db.execute(
        select(Order).where(
            Order.restaurant_id == rest.id,
            or_(Order.created_at >= since_time, Order.business_day_id == current_bday.id)
        )
    )
    day_orders = orders_res.scalars().all()

    total_orders = len(day_orders)
    completed_orders = sum(1 for o in day_orders if o.status in ["COMPLETED", "DELIVERED"])
    cancelled_orders = sum(1 for o in day_orders if o.status == "CANCELLED")

    total_sales = 0.0
    food_sales = 0.0
    bar_sales = 0.0
    food_orders = 0
    bar_orders = 0
    tax_amount = 0.0

    tables_served_set = set()

    for o in day_orders:
        if o.table_id:
            tables_served_set.add(o.table_id)
        if o.status != "CANCELLED":
            total_sales += o.total_amount or 0.0
            tax_amount += o.tax_amount or 0.0
            items = o.items_json or []
            has_food = False
            has_bar = False
            for item in items:
                it_price = float(item.get("price", 0.0))
                it_qty = int(item.get("quantity", 1))
                it_total = it_price * it_qty
                if item.get("station") == "BAR" or item.get("target_destination") == "BAR":
                    bar_sales += it_total
                    has_bar = True
                else:
                    food_sales += it_total
                    has_food = True
            if has_food:
                food_orders += 1
            if has_bar:
                bar_orders += 1

    # Payment breakdown from bills
    bills_res = await db.execute(
        select(Bill).where(Bill.restaurant_id == rest.id, Bill.created_at >= since_time, Bill.status == "PAID")
    )
    paid_bills = bills_res.scalars().all()

    cash_sales = sum(b.grand_total for b in paid_bills if b.payment_method == "CASH")
    card_sales = sum(b.grand_total for b in paid_bills if b.payment_method == "CARD")
    upi_sales = sum(b.grand_total for b in paid_bills if b.payment_method == "UPI")
    discount_amount = sum(b.discount_amount for b in paid_bills)

    avg_order_val = round(total_sales / total_orders, 2) if total_orders > 0 else 0.0

    # 3. Finalize current BusinessDay
    current_bday.status = "CLOSED"
    current_bday.closed_at = now_utc
    current_bday.closed_by = caller.email or caller.role or "Manager"
    current_bday.total_orders = total_orders
    current_bday.food_orders = food_orders
    current_bday.bar_orders = bar_orders
    current_bday.completed_orders = completed_orders
    current_bday.cancelled_orders = cancelled_orders
    current_bday.total_sales = total_sales
    current_bday.food_sales = food_sales
    current_bday.bar_sales = bar_sales
    current_bday.tax_amount = tax_amount
    current_bday.discount_amount = discount_amount
    current_bday.cash_sales = cash_sales
    current_bday.card_sales = card_sales
    current_bday.upi_sales = upi_sales
    current_bday.closing_notes = payload.closingNotes or payload.notes
    current_bday.summary_json = {
        "closedAt": now_utc.isoformat(),
        "closedBy": current_bday.closed_by,
        "totalOrders": total_orders,
        "completedOrders": completed_orders,
        "cancelledOrders": cancelled_orders,
        "totalSales": total_sales,
        "foodSales": food_sales,
        "barSales": bar_sales,
        "cashSales": cash_sales,
        "cardSales": card_sales,
        "upiSales": upi_sales,
        "taxAmount": tax_amount,
        "discountAmount": discount_amount,
        "tablesServed": len(tables_served_set),
        "averageOrderValue": avg_order_val,
        "paidBillsCount": len(paid_bills),
    }

    # 4. Clean Operational Reset for the NEXT business day (Non-destructive to history!)
    # A. Reset tables to AVAILABLE baseline
    await db.execute(
        update(Table).where(Table.restaurant_id == rest.id).values(
            status="AVAILABLE",
            is_occupied=False,
            active_session_id=None,
        )
    )

    # B. Close all open table sessions
    await db.execute(
        update(TableSession).where(
            TableSession.restaurant_id == rest.id,
            TableSession.status == "ACTIVE"
        ).values(
            status="CLOSED",
            session_closed_at=now_utc
        )
    )

    # C. Clear live operational queue: finalize uncompleted orders so they don't linger on live KDS/Bar
    await db.execute(
        update(Order).where(
            Order.restaurant_id == rest.id,
            Order.status.in_(["PENDING", "ACCEPTED", "PREPARING"])
        ).values(
            status="COMPLETED",
            kitchen_status="COMPLETED",
            bar_status="COMPLETED"
        )
    )

    # D. Resolve open customer requests (Waiter)
    await db.execute(
        update(CustomerRequestModel).where(
            CustomerRequestModel.restaurant_id == rest.id,
            CustomerRequestModel.status == "PENDING"
        ).values(
            status="COMPLETED"
        )
    )

    # Commit entire day-close transaction atomically!
    await db.commit()
    await db.refresh(current_bday)

    closed_formatted = _format_business_day(current_bday)
    next_business_date = compute_next_business_date(current_bday.business_date)
    closed_formatted["next_business_date"] = next_business_date
    closed_formatted["nextBusinessDate"] = next_business_date
    closed_formatted["previous_business_date"] = current_bday.business_date
    closed_formatted["previousBusinessDate"] = current_bday.business_date

    # 5. Audit Log (Never log tokens or passwords)
    AdminAuditLogger.log_action(
        admin_uid=caller.uid or caller.email or "unknown",
        action="DAY_CLOSED",
        target_resource="BusinessDay",
        target_id=current_bday.id,
        details={
            "restaurant_id": rest.id,
            "business_day_id": current_bday.id,
            "business_date": current_bday.business_date,
            "actor_id": caller.uid or caller.email,
            "actor_role": caller.role,
            "total_sales": total_sales,
            "total_orders": total_orders,
        }
    )
    logger.info(
        f"[AUDIT] DAY_CLOSED: restaurant_id={rest.id} business_day_id={current_bday.id} "
        f"business_date={current_bday.business_date} actor={caller.email or caller.role}"
    )

    # 6. Broadcast Realtime Events across all connected terminals
    event_id = f"evt-{uuid.uuid4().hex[:10]}"
    try:
        await ws_manager.broadcast_event(
            restaurant_id=rest.id,
            event_type="BusinessDayClosed",
            payload={
                "event_id": event_id,
                "restaurant_id": rest.id,
                "business_day_id": current_bday.id,
                "business_date": current_bday.business_date,
                "next_business_date": next_business_date,
                "closedDay": closed_formatted,
                "timestamp": now_utc.isoformat(),
            },
            target_audience=["OWNER", "MANAGER", "WAITER", "KITCHEN", "BAR", "CUSTOMER"]
        )
        await ws_manager.broadcast_event(
            restaurant_id=rest.id,
            event_type="DayClosed",
            payload={
                "event_id": event_id,
                "restaurant_id": rest.id,
                "business_day_id": current_bday.id,
                "business_date": current_bday.business_date,
                "next_business_date": next_business_date,
                "closedDay": closed_formatted,
                "timestamp": now_utc.isoformat(),
            },
            target_audience=["OWNER", "MANAGER", "WAITER", "KITCHEN", "BAR", "CUSTOMER"]
        )
    except Exception as ws_err:
        logger.warning(f"[WS_BROADCAST_NOTICE] DayClosed error: {ws_err}")

    return {
        **closed_formatted,
        "success": True,
        "message": f"Business Day {current_bday.business_date} successfully closed.",
        "closedDay": closed_formatted,
        "nextBusinessDate": next_business_date,
        "previousBusinessDate": current_bday.business_date,
    }


@router.post("/open")
async def open_business_day(
    restaurant_id: str,
    payload: OpenDaySchema = OpenDaySchema(),
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    rest = await _resolve_restaurant(restaurant_id, db)

    # 1. Check if an open business day already exists (Strictly idempotent!)
    query = select(BusinessDay).where(
        BusinessDay.restaurant_id == rest.id,
        BusinessDay.status == "OPEN"
    )
    res = await db.execute(query)
    existing = res.scalar_one_or_none()
    if existing:
        return _format_business_day(existing)

    now_utc = datetime.now(timezone.utc)
    
    # 2. Authoritative determination of business date:
    # A. If explicitly provided in payload and valid, use it
    # B. Otherwise determine from last closed business day (+ 1 day) or current calendar date
    chosen_date: Optional[str] = None
    input_date = payload.business_date or payload.businessDate
    if input_date and input_date.strip():
        chosen_date = input_date.strip()
    else:
        # Check last closed day
        last_closed_query = select(BusinessDay).where(
            BusinessDay.restaurant_id == rest.id,
            BusinessDay.status == "CLOSED"
        ).order_by(BusinessDay.closed_at.desc(), BusinessDay.opened_at.desc()).limit(1)
        last_closed_res = await db.execute(last_closed_query)
        last_closed = last_closed_res.scalar_one_or_none()
        if last_closed and last_closed.business_date:
            chosen_date = compute_next_business_date(last_closed.business_date)
        else:
            chosen_date = now_utc.strftime("%d %b %Y")

    new_id = f"bday-{rest.id}-{uuid.uuid4().hex[:10]}"
    new_bday = BusinessDay(
        id=new_id,
        restaurant_id=rest.id,
        business_date=chosen_date,
        status="OPEN",
        opened_at=now_utc,
        opened_by=caller.email or caller.role or payload.openedBy or "Manager",
    )
    db.add(new_bday)

    # Clean operational baseline for the new open day
    await db.execute(
        update(Table).where(Table.restaurant_id == rest.id).values(
            status="AVAILABLE",
            is_occupied=False,
            active_session_id=None,
        )
    )
    await db.execute(
        update(TableSession).where(
            TableSession.restaurant_id == rest.id,
            TableSession.status == "ACTIVE"
        ).values(
            status="CLOSED",
            session_closed_at=now_utc
        )
    )

    await db.commit()
    await db.refresh(new_bday)

    formatted = _format_business_day(new_bday)

    # Audit Log
    AdminAuditLogger.log_action(
        admin_uid=caller.uid or caller.email or "unknown",
        action="DAY_OPENED",
        target_resource="BusinessDay",
        target_id=new_bday.id,
        details={
            "restaurant_id": rest.id,
            "business_day_id": new_bday.id,
            "business_date": new_bday.business_date,
            "actor_id": caller.uid or caller.email,
            "actor_role": caller.role,
        }
    )
    logger.info(
        f"[AUDIT] DAY_OPENED: restaurant_id={rest.id} business_day_id={new_bday.id} "
        f"business_date={new_bday.business_date} actor={caller.email or caller.role}"
    )

    # Broadcast Realtime Event
    event_id = f"evt-{uuid.uuid4().hex[:10]}"
    try:
        await ws_manager.broadcast_event(
            restaurant_id=rest.id,
            event_type="BusinessDayOpened",
            payload={
                "event_id": event_id,
                "restaurant_id": rest.id,
                "business_day_id": new_bday.id,
                "business_date": new_bday.business_date,
                "businessDay": formatted,
                "timestamp": now_utc.isoformat()
            },
            target_audience=["OWNER", "MANAGER", "WAITER", "KITCHEN", "BAR"]
        )
        await ws_manager.broadcast_event(
            restaurant_id=rest.id,
            event_type="DayOpened",
            payload={
                "event_id": event_id,
                "restaurant_id": rest.id,
                "business_day_id": new_bday.id,
                "business_date": new_bday.business_date,
                "businessDay": formatted,
                "timestamp": now_utc.isoformat()
            },
            target_audience=["OWNER", "MANAGER", "WAITER", "KITCHEN", "BAR"]
        )
    except Exception as e:
        logger.warning(f"[WS_BROADCAST_NOTICE] BusinessDayOpened error: {e}")

    return formatted


@router.get("/history")
async def get_business_day_history(
    restaurant_id: str,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    rest = await _resolve_restaurant(restaurant_id, db)
    query = select(BusinessDay).where(
        BusinessDay.restaurant_id == rest.id,
        BusinessDay.status == "CLOSED"
    ).order_by(BusinessDay.closed_at.desc(), BusinessDay.opened_at.desc()).limit(30)
    res = await db.execute(query)
    days = res.scalars().all()
    return [_format_business_day(d) for d in days]


@router.get("/history/{day_id}")
async def get_historical_business_day_detail(
    restaurant_id: str,
    day_id: str,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    rest = await _resolve_restaurant(restaurant_id, db)
    clean_day_id = (day_id or "").strip()
    query = select(BusinessDay).where(
        BusinessDay.restaurant_id == rest.id,
        or_(
            BusinessDay.id == clean_day_id,
            BusinessDay.business_date == clean_day_id,
        )
    )
    res = await db.execute(query)
    bday = res.scalar_one_or_none()
    if not bday:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Historical business day record not found.")

    return _format_business_day(bday)

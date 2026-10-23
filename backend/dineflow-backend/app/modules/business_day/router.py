import uuid
import logging
import zoneinfo
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, or_, and_, func

from app.core.database.connection import get_db
from app.core.security.tenant_auth import require_tenant_owner_or_admin, get_caller_context, CallerContext
from app.modules.restaurants.models import Restaurant
from app.modules.business_day.models import BusinessDay
from app.modules.business_day.schemas import CloseDaySchema, OpenDaySchema, BusinessDayPrecheckResponse
from app.modules.business_day.service import (
    get_restaurant_tz,
    get_rollover_cutoff_time,
    get_current_restaurant_local_dt,
    get_operational_business_date,
    compute_next_rollover_timestamp,
    compute_next_business_date,
    determine_next_open_business_date,
    check_shift_requires_rollover,
    calculate_shift_financial_ledger,
    perform_business_day_rollover,
)
from app.modules.orders.models import Order, Bill
from app.modules.tables.models import Table, TableSession
from app.modules.customer_requests.models import CustomerRequestModel
from app.modules.websocket.manager import ws_manager
from app.modules.admin.audit_service import AdminAuditLogger

logger = logging.getLogger(__name__)

router = APIRouter()


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


def _format_business_day(bday: BusinessDay, rest: Optional[Restaurant] = None) -> dict:
    next_date = compute_next_business_date(bday.business_date) if bday.business_date else None
    recommended_date = determine_next_open_business_date(rest, bday)

    avg_order_val = round(bday.total_sales / bday.total_orders, 2) if bday.total_orders > 0 else 0.0

    requires_rollover, is_stale_shift = check_shift_requires_rollover(bday, rest)

    tz = get_restaurant_tz(rest)
    tz_name = getattr(rest, "timezone", None) or "Asia/Kolkata"
    local_now = get_current_restaurant_local_dt(rest)
    next_rollover_dt = compute_next_rollover_timestamp(rest)
    now_utc = datetime.now(timezone.utc)

    gross_sales = getattr(bday, "gross_sales", 0.0) or bday.total_sales
    net_sales = getattr(bday, "net_sales", 0.0) or bday.total_sales
    unpaid_bills_amount = getattr(bday, "unpaid_bills_amount", 0.0) or 0.0
    unbilled_orders_amount = getattr(bday, "unbilled_orders_amount", 0.0) or 0.0
    outstanding_receivables = round(unpaid_bills_amount + unbilled_orders_amount, 2)
    requires_reconciliation = getattr(bday, "requires_reconciliation", False) or (outstanding_receivables > 0 and bday.status == "CLOSED")
    is_auto_rolled = getattr(bday, "is_auto_rolled", False)

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
        "recommended_business_date": recommended_date,
        "recommendedBusinessDate": recommended_date,
        "status": bday.status,
        "opened_at": bday.opened_at.isoformat() if bday.opened_at else None,
        "openedAt": bday.opened_at.isoformat() if bday.opened_at else None,
        "opened_by": bday.opened_by,
        "openedBy": bday.opened_by,
        "closed_at": bday.closed_at.isoformat() if bday.closed_at else None,
        "closedAt": bday.closed_at.isoformat() if bday.closed_at else None,
        "closed_by": bday.closed_by,
        "closedBy": bday.closed_by,
        "requires_rollover": requires_rollover,
        "requiresRollover": requires_rollover,
        "is_stale_shift": is_stale_shift,
        "isStaleShift": is_stale_shift,
        "requires_reconciliation": requires_reconciliation,
        "requiresReconciliation": requires_reconciliation,
        "is_auto_rolled": is_auto_rolled,
        "isAutoRolled": is_auto_rolled,

        # Live Real-Time Timezone Metadata
        "restaurant_timezone": tz_name,
        "restaurantTimezone": tz_name,
        "current_local_time": local_now.isoformat(),
        "currentLocalTime": local_now.isoformat(),
        "current_local_date": local_now.strftime("%d %b %Y"),
        "currentLocalDate": local_now.strftime("%d %b %Y"),
        "next_rollover_at": next_rollover_dt.isoformat(),
        "nextRolloverAt": next_rollover_dt.isoformat(),
        "last_sync_time": now_utc.isoformat(),
        "lastSyncTime": now_utc.isoformat(),

        # Financial Ledger Metrics (Authoritative Separation)
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
        "settled_sales": bday.total_sales,
        "settledSales": bday.total_sales,
        "paid_revenue": bday.total_sales,
        "paidRevenue": bday.total_sales,

        "order_value": gross_sales,
        "orderValue": gross_sales,
        "gross_sales": gross_sales,
        "grossSales": gross_sales,
        "net_sales": net_sales,
        "netSales": net_sales,

        "food_sales": bday.food_sales,
        "foodSales": bday.food_sales,
        "bar_sales": bday.bar_sales,
        "barSales": bday.bar_sales,
        "tax_amount": bday.tax_amount,
        "taxAmount": bday.tax_amount,
        "discount_amount": bday.discount_amount,
        "discountAmount": bday.discount_amount,
        "service_charge_amount": getattr(bday, "service_charge_amount", 0.0) or 0.0,
        "serviceChargeAmount": getattr(bday, "service_charge_amount", 0.0) or 0.0,

        "cash_sales": bday.cash_sales,
        "cashSales": bday.cash_sales,
        "card_sales": bday.card_sales,
        "cardSales": bday.card_sales,
        "upi_sales": bday.upi_sales,
        "upiSales": bday.upi_sales,

        "unpaid_bills_amount": unpaid_bills_amount,
        "unpaidBillsAmount": unpaid_bills_amount,
        "unbilled_orders_amount": unbilled_orders_amount,
        "unbilledOrdersAmount": unbilled_orders_amount,
        "outstanding_receivables": outstanding_receivables,
        "outstandingReceivables": outstanding_receivables,

        "average_order_value": avg_order_val,
        "averageOrderValue": avg_order_val,
        "closing_notes": bday.closing_notes,
        "closingNotes": bday.closing_notes,
        "summary": bday.summary_json or {
            "totalOrders": bday.total_orders,
            "completedOrders": bday.completed_orders,
            "cancelledOrders": bday.cancelled_orders,
            "totalSales": bday.total_sales,
            "settledSales": bday.total_sales,
            "grossSales": gross_sales,
            "netSales": net_sales,
            "foodSales": bday.food_sales,
            "barSales": bday.bar_sales,
            "cashSales": bday.cash_sales,
            "cardSales": bday.card_sales,
            "upiSales": bday.upi_sales,
            "taxAmount": bday.tax_amount,
            "discountAmount": bday.discount_amount,
            "unpaidBillsAmount": unpaid_bills_amount,
            "unbilledOrdersAmount": unbilled_orders_amount,
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

    # Passive Auto-Rollover check: If current open day requires rollover and auto_rollover_enabled is True
    if current_bday and getattr(rest, "auto_rollover_enabled", True):
        requires_rollover, _ = check_shift_requires_rollover(current_bday, rest)
        if requires_rollover:
            try:
                rolled, closed_day, new_day = await perform_business_day_rollover(
                    rest, db, caller_actor="System / Auto-Rollover (Passive)"
                )
                if rolled and new_day:
                    current_bday = new_day
            except Exception as auto_err:
                logger.error(f"[PASSIVE_ROLLOVER_ERROR] restaurant={rest.id}: {auto_err}")

    if not current_bday:
        # Check if restaurant has any existing closed business days
        any_day_res = await db.execute(
            select(BusinessDay).where(
                BusinessDay.restaurant_id == rest.id
            ).order_by(BusinessDay.closed_at.desc(), BusinessDay.opened_at.desc()).limit(1)
        )
        latest_bday = any_day_res.scalar_one_or_none()
        if not latest_bday:
            # Brand new restaurant with no business day records at all: auto-initialize initial day with current operational date
            now_utc = datetime.now(timezone.utc)
            today_str = get_operational_business_date(now_utc, rest)
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

    formatted = _format_business_day(current_bday, rest)

    # If day is OPEN, compute authoritative live operational & financial counters scoped to this shift!
    if current_bday.status == "OPEN":
        metrics = await calculate_shift_financial_ledger(rest.id, current_bday, db)
        for k, v in metrics.items():
            formatted[k] = v
            # camelCase alias
            parts = k.split("_")
            cc = parts[0] + "".join(p.title() for p in parts[1:])
            formatted[cc] = v

    # Live operational station counters (with strict exclusion of DELIVERED / COMPLETED / CANCELLED orders)
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
            Order.kitchen_status.in_(["PENDING", "ACCEPTED", "PREPARING"]),
            Order.status.notin_(["COMPLETED", "DELIVERED", "CANCELLED"])
        )
    )
    kitchen_pending_count = k_res.scalar() or 0
    formatted["kitchen_pending_count"] = kitchen_pending_count
    formatted["kitchenPendingCount"] = kitchen_pending_count

    b_res = await db.execute(
        select(func.count(Order.id)).where(
            Order.restaurant_id == rest.id,
            Order.bar_status.in_(["PENDING", "ACCEPTED", "PREPARING"]),
            Order.status.notin_(["COMPLETED", "DELIVERED", "CANCELLED"])
        )
    )
    bar_pending_count = b_res.scalar() or 0
    formatted["bar_pending_count"] = bar_pending_count
    formatted["barPendingCount"] = bar_pending_count

    h_res = await db.execute(
        select(func.count(Order.id)).where(
            Order.restaurant_id == rest.id,
            Order.hookah_status.in_(["PENDING", "ACCEPTED", "PREPARING"]),
            Order.status.notin_(["COMPLETED", "DELIVERED", "CANCELLED"])
        )
    )
    hookah_pending_count = h_res.scalar() or 0
    formatted["hookah_pending_count"] = hookah_pending_count
    formatted["hookahPendingCount"] = hookah_pending_count

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

    # 4. Uncompleted Kitchen Orders (excluding orders already completed or delivered)
    k_res = await db.execute(
        select(func.count(Order.id)).where(
            Order.restaurant_id == rest.id,
            Order.kitchen_status.in_(["PENDING", "ACCEPTED", "PREPARING"]),
            Order.status.notin_(["COMPLETED", "DELIVERED", "CANCELLED"])
        )
    )
    uncompleted_kitchen_count = k_res.scalar() or 0

    # 5. Uncompleted Bar Orders (excluding orders already completed or delivered)
    b_res = await db.execute(
        select(func.count(Order.id)).where(
            Order.restaurant_id == rest.id,
            Order.bar_status.in_(["PENDING", "ACCEPTED", "PREPARING"]),
            Order.status.notin_(["COMPLETED", "DELIVERED", "CANCELLED"])
        )
    )
    uncompleted_bar_count = b_res.scalar() or 0

    # Hookah Orders (excluding orders already completed or delivered)
    h_res = await db.execute(
        select(func.count(Order.id)).where(
            Order.restaurant_id == rest.id,
            Order.hookah_status.in_(["PENDING", "ACCEPTED", "PREPARING"]),
            Order.status.notin_(["COMPLETED", "DELIVERED", "CANCELLED"])
        )
    )
    uncompleted_hookah_count = h_res.scalar() or 0

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

    total_orders_today = 0
    order_value_today = 0.0
    total_sales_today = 0.0
    unbilled_orders_count = 0
    unbilled_orders_amount = 0.0
    unpaid_bills_amount = float(sum(b.grand_total for b in unpaid_bills))

    if open_bday:
        ledger = await calculate_shift_financial_ledger(rest.id, open_bday, db)
        total_orders_today = ledger["total_orders"]
        order_value_today = ledger["order_value"]
        total_sales_today = ledger["settled_sales"]
        unpaid_bills_amount = ledger["unpaid_bills_amount"]
        unbilled_orders_count = ledger["unbilled_orders_count"]
        unbilled_orders_amount = ledger["unbilled_orders_amount"]

    warnings: List[str] = []
    blocking_reasons: List[Dict[str, Any]] = []

    if unbilled_orders_count > 0:
        label = f"{unbilled_orders_count} completed order(s) worth ₹{unbilled_orders_amount:.2f} have not been billed or settled."
        warnings.append(label)
        blocking_reasons.append({
            "type": "UNBILLED_ORDERS",
            "id": "unbilled-orders",
            "count": unbilled_orders_count,
            "amount": unbilled_orders_amount,
            "label": label,
            "link": "/billing",
        })

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
        label = f"{uncompleted_kitchen_count} order(s) still in preparation in Kitchen KDS."
        warnings.append(label)
        blocking_reasons.append({
            "type": "KITCHEN",
            "id": "kitchen-pending",
            "count": uncompleted_kitchen_count,
            "label": label,
            "link": "/kitchen",
        })

    if uncompleted_bar_count > 0:
        label = f"{uncompleted_bar_count} beverage order(s) pending in Bar station."
        warnings.append(label)
        blocking_reasons.append({
            "type": "BAR",
            "id": "bar-pending",
            "count": uncompleted_bar_count,
            "label": label,
            "link": "/bar",
        })

    if uncompleted_hookah_count > 0:
        label = f"{uncompleted_hookah_count} hookah order(s) pending in Hookah station."
        warnings.append(label)
        blocking_reasons.append({
            "type": "HOOKAH",
            "id": "hookah-pending",
            "count": uncompleted_hookah_count,
            "label": label,
            "link": "/hookah",
        })

    if open_waiter_requests_count > 0:
        label = f"{open_waiter_requests_count} customer service request(s) open."
        warnings.append(label)
        blocking_reasons.append({
            "type": "WAITER",
            "id": "waiter-pending",
            "count": open_waiter_requests_count,
            "label": label,
            "link": "/waiter",
        })

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
        "uncompletedHookahOrdersCount": uncompleted_hookah_count,
        "uncompleted_hookah_orders_count": uncompleted_hookah_count,
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
        "orderValueToday": order_value_today,
        "order_value_today": order_value_today,
        "unpaidBillsAmount": unpaid_bills_amount,
        "unpaid_bills_amount": unpaid_bills_amount,
        "unbilledOrdersAmount": unbilled_orders_amount,
        "unbilled_orders_amount": unbilled_orders_amount,
        "unbilledOrdersCount": unbilled_orders_count,
        "unbilled_orders_count": unbilled_orders_count,
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
        last_closed_res = await db.execute(
            select(BusinessDay).where(
                BusinessDay.restaurant_id == rest.id,
                BusinessDay.status == "CLOSED"
            ).order_by(BusinessDay.closed_at.desc(), BusinessDay.opened_at.desc()).limit(1)
        )
        last_closed = last_closed_res.scalar_one_or_none()
        if last_closed:
            # Idempotent return for repeated close requests
            closed_formatted = _format_business_day(last_closed, rest)
            next_business_date = determine_next_open_business_date(rest, last_closed) if last_closed.business_date else None
            closed_formatted["next_business_date"] = next_business_date
            closed_formatted["nextBusinessDate"] = next_business_date
            closed_formatted["previous_business_date"] = last_closed.business_date
            closed_formatted["previousBusinessDate"] = last_closed.business_date
            return {
                **closed_formatted,
                "success": True,
                "message": f"Business Day {last_closed.business_date} is already closed.",
                "is_already_closed": True,
                "closedDay": closed_formatted,
                "nextBusinessDate": next_business_date,
                "previousBusinessDate": last_closed.business_date,
            }

        any_day_res = await db.execute(select(func.count(BusinessDay.id)).where(BusinessDay.restaurant_id == rest.id))
        count = any_day_res.scalar() or 0
        if count == 0:
            now_utc = datetime.now(timezone.utc)
            today_str = get_operational_business_date(now_utc, rest)
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

    # Precheck enforcement: if force_close is not set, verify that active tables / unpaid bills / pending tickets do not block closing
    is_force_close = bool(payload.force_close or payload.forceCloseActiveTables or payload.forceFinalizeOrders)
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

        orders_res_check = await db.execute(
            select(func.count(Order.id)).where(
                Order.restaurant_id == rest.id,
                Order.status.notin_(["COMPLETED", "DELIVERED", "CANCELLED"]),
                or_(
                    Order.status.in_(["PENDING", "ACCEPTED", "PREPARING"]),
                    Order.kitchen_status.in_(["PENDING", "ACCEPTED", "PREPARING"]),
                    Order.bar_status.in_(["PENDING", "ACCEPTED", "PREPARING"]),
                    Order.hookah_status.in_(["PENDING", "ACCEPTED", "PREPARING"])
                )
            )
        )
        uncompleted_count = orders_res_check.scalar() or 0

        if occupied_count > 0 or unpaid_count > 0 or uncompleted_count > 0:
            reasons = []
            if occupied_count > 0:
                reasons.append(f"{occupied_count} table(s) are occupied")
            if unpaid_count > 0:
                reasons.append(f"{unpaid_count} bill(s) are unpaid")
            if uncompleted_count > 0:
                reasons.append(f"{uncompleted_count} preparation ticket(s) are active")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot close day yet. {', '.join(reasons)}. Please settle them or confirm force close."
            )

    now_utc = datetime.now(timezone.utc)
    since_time = current_bday.opened_at

    # 2. Calculate authoritative operational and financial summary for the day
    orders_res = await db.execute(
        select(Order).where(
            Order.restaurant_id == rest.id,
            or_(Order.business_day_id == current_bday.id, Order.created_at >= since_time)
        )
    )
    day_orders = orders_res.scalars().all()

    total_orders = len(day_orders)
    completed_orders = sum(1 for o in day_orders if o.status in ["COMPLETED", "DELIVERED"])
    cancelled_orders = sum(1 for o in day_orders if o.status == "CANCELLED")

    food_sales = 0.0
    bar_sales = 0.0
    food_orders = 0
    bar_orders = 0
    tables_served_set = set()

    for o in day_orders:
        if o.table_id:
            tables_served_set.add(o.table_id)
        if o.status != "CANCELLED":
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

    # Payment breakdown from bills belonging to this shift
    day_session_ids = {o.table_session_id for o in day_orders if o.table_session_id}
    bills_res = await db.execute(
        select(Bill).where(
            Bill.restaurant_id == rest.id,
            or_(
                Bill.business_day_id == current_bday.id,
                Bill.created_at >= since_time
            ),
            or_(Bill.status == "PAID", Bill.payment_status == "PAID")
        )
    )
    paid_bills = bills_res.scalars().all()

    cash_sales = round(sum(b.grand_total for b in paid_bills if b.payment_method == "CASH"), 2)
    card_sales = round(sum(b.grand_total for b in paid_bills if b.payment_method == "CARD"), 2)
    upi_sales = round(sum(b.grand_total for b in paid_bills if b.payment_method in ["UPI", "ONLINE_UPI", "QR_CODE"]), 2)
    tax_amount = round(sum(b.tax_amount for b in paid_bills), 2)
    discount_amount = round(sum(b.discount_amount for b in paid_bills), 2)
    total_sales = round(cash_sales + card_sales + upi_sales, 2)
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
    current_bday.food_sales = round(food_sales, 2)
    current_bday.bar_sales = round(bar_sales, 2)
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
        "foodSales": round(food_sales, 2),
        "barSales": round(bar_sales, 2),
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
        ).execution_options(synchronize_session=False)
    )

    # B. Close all open table sessions
    await db.execute(
        update(TableSession).where(
            TableSession.restaurant_id == rest.id,
            TableSession.status == "ACTIVE"
        ).values(
            status="CLOSED",
            session_closed_at=now_utc
        ).execution_options(synchronize_session=False)
    )

    # C. Authoritatively stamp business_day_id on all orders and bills from this operational shift
    await db.execute(
        update(Order).where(
            Order.restaurant_id == rest.id,
            or_(
                Order.business_day_id == current_bday.id,
                and_(Order.business_day_id.is_(None), Order.created_at >= since_time)
            )
        ).values(business_day_id=current_bday.id).execution_options(synchronize_session=False)
    )
    await db.execute(
        update(Bill).where(
            Bill.restaurant_id == rest.id,
            or_(
                Bill.business_day_id == current_bday.id,
                and_(Bill.business_day_id.is_(None), Bill.created_at >= since_time)
            )
        ).values(business_day_id=current_bday.id).execution_options(synchronize_session=False)
    )

    # D. Clear live operational queue: finalize uncompleted orders so they don't linger on live KDS/Bar/Hookah
    await db.execute(
        update(Order).where(
            Order.restaurant_id == rest.id,
            Order.business_day_id == current_bday.id,
            Order.status.in_(["PENDING", "ACCEPTED", "PREPARING", "READY"])
        ).values(
            status="COMPLETED",
            kitchen_status="COMPLETED",
            bar_status="COMPLETED",
            hookah_status="COMPLETED"
        ).execution_options(synchronize_session=False)
    )

    # Seal any completed orders with lingering station statuses
    await db.execute(
        update(Order).where(
            Order.restaurant_id == rest.id,
            Order.business_day_id == current_bday.id,
            Order.status.in_(["COMPLETED", "DELIVERED"]),
            or_(
                Order.bar_status.in_(["PENDING", "ACCEPTED", "PREPARING", "READY"]),
                Order.kitchen_status.in_(["PENDING", "ACCEPTED", "PREPARING", "READY"]),
                Order.hookah_status.in_(["PENDING", "ACCEPTED", "PREPARING", "READY"])
            )
        ).values(
            kitchen_status="COMPLETED",
            bar_status="COMPLETED",
            hookah_status="COMPLETED"
        ).execution_options(synchronize_session=False)
    )

    # E. Resolve open customer requests (Waiter)
    await db.execute(
        update(CustomerRequestModel).where(
            CustomerRequestModel.restaurant_id == rest.id,
            CustomerRequestModel.status == "PENDING"
        ).values(
            status="COMPLETED"
        ).execution_options(synchronize_session=False)
    )

    # Commit entire day-close transaction atomically!
    await db.commit()
    await db.refresh(current_bday)

    closed_formatted = _format_business_day(current_bday, rest)
    next_business_date = compute_next_business_date(current_bday.business_date) if current_bday.business_date else None
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
            target_audience=["OWNER", "MANAGER", "WAITER", "KITCHEN", "BAR", "HOOKAH", "CUSTOMER"]
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
            target_audience=["OWNER", "MANAGER", "WAITER", "KITCHEN", "BAR", "HOOKAH", "CUSTOMER"]
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
        return _format_business_day(existing, rest)

    now_utc = datetime.now(timezone.utc)
    
    # 2. Authoritative determination of business date:
    # A. If explicitly provided in payload and valid, use it
    # B. Otherwise determine from last closed business day synchronized with restaurant local timezone!
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
            chosen_date = get_operational_business_date(now_utc, rest)

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

    formatted = _format_business_day(new_bday, rest)

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
            target_audience=["OWNER", "MANAGER", "WAITER", "KITCHEN", "BAR", "HOOKAH"]
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
            target_audience=["OWNER", "MANAGER", "WAITER", "KITCHEN", "BAR", "HOOKAH"]
        )
    except Exception as e:
        logger.warning(f"[WS_BROADCAST_NOTICE] BusinessDayOpened error: {e}")

    return formatted


@router.post("/sync-and-advance")
async def sync_and_advance_stale_shift(
    restaurant_id: str,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Authoritative manual recovery workflow for stale or out-of-sync shifts.
    Seals any open shift from a prior date, archives its historical orders and ledger,
    and opens the current operational business day synchronized to today's date.
    """
    rest = await _resolve_restaurant(restaurant_id, db)
    actor = caller.email or caller.role or "Manager"
    rolled, closed_day, new_day = await perform_business_day_rollover(
        rest, db, caller_actor=f"{actor} (Manual Sync)", force_close=True,
        notes=f"Shift manually synchronized and advanced to current date by {actor}."
    )
    active_day = new_day or closed_day
    formatted = _format_business_day(active_day, rest)
    return {
        "success": True,
        "message": f"Business day successfully synchronized to {active_day.business_date}.",
        "activeDay": formatted,
        "closedDay": _format_business_day(closed_day, rest) if closed_day else None,
    }


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
    return [_format_business_day(d, rest) for d in days]


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

    return _format_business_day(bday, rest)


@router.get("/history/{day_id}/orders")
async def get_historical_business_day_orders(
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

    query_orders = select(Order).where(
        Order.restaurant_id == rest.id,
        or_(
            Order.business_day_id == bday.id,
            and_(
                Order.business_day_id.is_(None),
                Order.created_at >= bday.opened_at,
                Order.created_at <= (bday.closed_at or datetime.now(timezone.utc))
            )
        )
    ).order_by(Order.created_at.asc())
    res_orders = await db.execute(query_orders)
    orders = res_orders.scalars().all()
    from app.modules.orders.router import format_order_response
    return [format_order_response(o) for o in orders]

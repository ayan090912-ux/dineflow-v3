import uuid
import logging
import zoneinfo
from datetime import datetime, timezone, timedelta, time
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, or_, and_, func

from app.modules.restaurants.models import Restaurant
from app.modules.business_day.models import BusinessDay
from app.modules.orders.models import Order, Bill
from app.modules.tables.models import Table, TableSession
from app.modules.customer_requests.models import CustomerRequestModel
from app.modules.websocket.manager import ws_manager
from app.modules.admin.audit_service import AdminAuditLogger

logger = logging.getLogger(__name__)


def get_restaurant_tz(rest: Optional[Restaurant]) -> zoneinfo.ZoneInfo:
    """
    Returns the restaurant's configured IANA ZoneInfo.
    Falls back authoritatively to 'Asia/Kolkata'.
    """
    tz_str = getattr(rest, "timezone", None) or "Asia/Kolkata"
    try:
        return zoneinfo.ZoneInfo(tz_str)
    except Exception:
        return zoneinfo.ZoneInfo("Asia/Kolkata")


def get_rollover_cutoff_time(rest: Optional[Restaurant]) -> time:
    """
    Returns the daily rollover cutoff time (e.g. 04:00 AM) in restaurant-local time.
    """
    rollover_str = getattr(rest, "rollover_time", None) or "04:00"
    try:
        parts = rollover_str.strip().split(":")
        return time(int(parts[0]), int(parts[1]))
    except Exception:
        return time(4, 0)


def get_current_restaurant_local_dt(rest: Optional[Restaurant]) -> datetime:
    """
    Returns current timestamp in the restaurant's local timezone.
    """
    tz = get_restaurant_tz(rest)
    return datetime.now(tz)


def get_operational_business_date(dt: Optional[datetime], rest: Optional[Restaurant]) -> str:
    """
    Authoritative computation of operational business date formatted as '%d %b %Y' (e.g. '23 Oct 2026')
    in the restaurant's configured local timezone.
    If the current local time is before the rollover cutoff (e.g. 04:00 AM),
    the operational business day belongs to the preceding calendar day (overnight service).
    """
    if not dt:
        dt = datetime.now(timezone.utc)
    tz = get_restaurant_tz(rest)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local_dt = dt.astimezone(tz)

    cutoff = get_rollover_cutoff_time(rest)
    if local_dt.time() < cutoff:
        op_dt = local_dt - timedelta(days=1)
    else:
        op_dt = local_dt

    return op_dt.strftime("%d %b %Y")


def compute_next_rollover_timestamp(rest: Optional[Restaurant]) -> datetime:
    """
    Calculates the exact next rollover datetime in the restaurant's local timezone.
    """
    local_now = get_current_restaurant_local_dt(rest)
    cutoff = get_rollover_cutoff_time(rest)

    today_cutoff = local_now.replace(hour=cutoff.hour, minute=cutoff.minute, second=0, microsecond=0)
    if local_now < today_cutoff:
        return today_cutoff
    else:
        return today_cutoff + timedelta(days=1)


def compute_next_business_date(current_date_str: str) -> str:
    """
    Safely advances date string '%d %b %Y' by +1 day.
    """
    try:
        dt = datetime.strptime(current_date_str.strip(), "%d %b %Y")
        next_dt = dt + timedelta(days=1)
        return next_dt.strftime("%d %b %Y")
    except Exception:
        now_utc = datetime.now(timezone.utc)
        return (now_utc + timedelta(days=1)).strftime("%d %b %Y")


def determine_next_open_business_date(rest: Optional[Restaurant], last_closed: Optional[BusinessDay] = None) -> str:
    """
    Authoritatively determines what the next open business date should be.
    If a gap exists between the last closed business day and current operational date,
    synchronizes to the current operational business date instead of lagging days behind.
    """
    current_op_date_str = get_operational_business_date(datetime.now(timezone.utc), rest)
    if not last_closed or not last_closed.business_date:
        return current_op_date_str

    try:
        last_dt = datetime.strptime(last_closed.business_date.strip(), "%d %b %Y").date()
        current_op_date = datetime.strptime(current_op_date_str, "%d %b %Y").date()

        if current_op_date > last_dt:
            # Operational calendar date has moved past last closed day
            return current_op_date_str
        elif current_op_date == last_dt:
            # Last closed day was already closed today: default to tomorrow
            return (current_op_date + timedelta(days=1)).strftime("%d %b %Y")
        else:
            return (last_dt + timedelta(days=1)).strftime("%d %b %Y")
    except Exception:
        return current_op_date_str


def check_shift_requires_rollover(bday: BusinessDay, rest: Optional[Restaurant]) -> Tuple[bool, bool]:
    """
    Evaluates whether an active business day requires automatic rollover.
    Returns: (requires_rollover, is_stale_shift)
    """
    if bday.status != "OPEN" or not bday.opened_at:
        return False, False

    tz = get_restaurant_tz(rest)
    now_local = datetime.now(tz)
    opened_local = bday.opened_at.astimezone(tz) if bday.opened_at.tzinfo else bday.opened_at.replace(tzinfo=timezone.utc).astimezone(tz)

    current_op_date_str = get_operational_business_date(now_local, rest)
    shift_op_date_str = bday.business_date

    try:
        current_op_dt = datetime.strptime(current_op_date_str.strip(), "%d %b %Y").date()
        shift_op_dt = datetime.strptime(shift_op_date_str.strip(), "%d %b %Y").date()
        is_date_past = (current_op_dt > shift_op_dt)
    except Exception:
        is_date_past = False

    is_time_past = (now_local - opened_local > timedelta(hours=24))

    requires_rollover = is_date_past or is_time_past
    is_stale_shift = is_date_past or (now_local - opened_local > timedelta(hours=20))

    return requires_rollover, is_stale_shift


async def calculate_shift_financial_ledger(
    restaurant_id: str,
    business_day: BusinessDay,
    db: AsyncSession
) -> Dict[str, Any]:
    """
    Computes authoritative operational metrics and financial ledger for a shift.
    Distinguishes:
    - Gross Order Sales (total value of non-cancelled orders)
    - Net Sales (gross orders minus discounts)
    - Settled Revenue (actual cash, card, and upi collected from paid bills)
    - Unpaid Bills (bills issued but pending payment)
    - Unbilled Orders (completed orders with no bill generated)
    """
    since_time = business_day.opened_at

    # 1. Orders belonging to this active shift
    ord_query = select(Order).where(
        Order.restaurant_id == restaurant_id,
        or_(
            Order.business_day_id == business_day.id,
            and_(Order.business_day_id.is_(None), Order.created_at >= since_time)
        )
    )
    ord_res = await db.execute(ord_query)
    shift_orders = ord_res.scalars().all()

    total_orders = len(shift_orders)
    completed_orders = sum(1 for o in shift_orders if o.status in ["COMPLETED", "DELIVERED"])
    cancelled_orders = sum(1 for o in shift_orders if o.status == "CANCELLED")
    non_cancelled_orders = [o for o in shift_orders if o.status != "CANCELLED"]

    order_value = round(sum(o.total_amount or 0.0 for o in non_cancelled_orders), 2)
    food_sales = 0.0
    bar_sales = 0.0
    food_orders = 0
    bar_orders = 0
    tables_served_set = set()

    for o in non_cancelled_orders:
        if o.table_id:
            tables_served_set.add(o.table_id)
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

    # 2. Bills belonging to this active shift
    bill_query = select(Bill).where(
        Bill.restaurant_id == restaurant_id,
        or_(
            Bill.business_day_id == business_day.id,
            and_(Bill.business_day_id.is_(None), Bill.created_at >= since_time)
        )
    )
    bill_res = await db.execute(bill_query)
    shift_bills = bill_res.scalars().all()

    paid_bills = [b for b in shift_bills if b.status == "PAID" or b.payment_status == "PAID"]
    unpaid_bills = [b for b in shift_bills if b.status not in ["PAID", "CANCELLED"] and b.payment_status != "PAID"]

    cash_sales = round(sum(b.grand_total for b in paid_bills if b.payment_method == "CASH"), 2)
    card_sales = round(sum(b.grand_total for b in paid_bills if b.payment_method == "CARD"), 2)
    upi_sales = round(sum(b.grand_total for b in paid_bills if b.payment_method in ["UPI", "ONLINE_UPI", "QR_CODE"]), 2)
    tax_amount = round(sum(b.tax_amount for b in paid_bills), 2)
    discount_amount = round(sum(b.discount_amount for b in paid_bills), 2)
    service_charge_amount = round(sum(getattr(b, "service_charge_amount", 0.0) or 0.0 for b in paid_bills), 2)

    settled_revenue = round(cash_sales + card_sales + upi_sales, 2)
    unpaid_bills_amount = round(sum(b.grand_total for b in unpaid_bills), 2)

    # 3. Unbilled orders calculation: completed orders with no bill
    unbilled_orders_amount = 0.0
    unbilled_orders_count = 0
    if len(shift_bills) == 0:
        unbilled_orders_amount = order_value
        unbilled_orders_count = len(non_cancelled_orders)
    else:
        billed_order_ids = set()
        for b in shift_bills:
            if b.status != "CANCELLED":
                for item in (getattr(b, "orders_snapshot_json", None) or []):
                    oid = item.get("id") or item.get("order_id") if isinstance(item, dict) else str(item)
                    if oid:
                        billed_order_ids.add(oid)
        unbilled = [o for o in non_cancelled_orders if o.id not in billed_order_ids]
        unbilled_orders_amount = round(sum(o.total_amount or 0.0 for o in unbilled), 2)
        unbilled_orders_count = len(unbilled)

    net_sales = max(0.0, round(order_value - discount_amount, 2))
    avg_order_val = round(order_value / total_orders, 2) if total_orders > 0 else 0.0

    return {
        "total_orders": total_orders,
        "completed_orders": completed_orders,
        "cancelled_orders": cancelled_orders,
        "food_orders": food_orders,
        "bar_orders": bar_orders,
        "food_sales": round(food_sales, 2),
        "bar_sales": round(bar_sales, 2),
        "order_value": order_value,
        "gross_sales": order_value,
        "net_sales": net_sales,
        "settled_sales": settled_revenue,
        "total_sales": settled_revenue,
        "cash_sales": cash_sales,
        "card_sales": card_sales,
        "upi_sales": upi_sales,
        "tax_amount": tax_amount,
        "discount_amount": discount_amount,
        "service_charge_amount": service_charge_amount,
        "unpaid_bills_count": len(unpaid_bills),
        "unpaid_bills_amount": unpaid_bills_amount,
        "unbilled_orders_count": unbilled_orders_count,
        "unbilled_orders_amount": unbilled_orders_amount,
        "outstanding_receivables": round(unpaid_bills_amount + unbilled_orders_amount, 2),
        "tables_served": len(tables_served_set),
        "average_order_value": avg_order_val,
        "paid_bills_count": len(paid_bills),
    }


async def perform_business_day_rollover(
    rest: Restaurant,
    db: AsyncSession,
    caller_actor: str = "System / Auto-Rollover",
    force_close: bool = True,
    notes: Optional[str] = None
) -> Tuple[bool, Optional[BusinessDay], Optional[BusinessDay]]:
    """
    Executes atomic, concurrency-safe, idempotent business day rollover.
    Prevents duplicate rollovers with row-level database locking (with_for_update).
    Preserves historical day attribution, seals the shift, resets active operational state,
    and opens the new business day synchronized to current operational date.
    """
    # 1. Fetch current OPEN day with row lock
    query = select(BusinessDay).where(
        BusinessDay.restaurant_id == rest.id,
        BusinessDay.status == "OPEN"
    ).with_for_update().order_by(BusinessDay.opened_at.desc())
    res = await db.execute(query)
    current_bday = res.scalar_one_or_none()

    now_utc = datetime.now(timezone.utc)

    if not current_bday:
        # No OPEN day exists: ensure an open day exists for today
        target_date = get_operational_business_date(now_utc, rest)
        new_id = f"bday-{rest.id}-{uuid.uuid4().hex[:10]}"
        new_bday = BusinessDay(
            id=new_id,
            restaurant_id=rest.id,
            business_date=target_date,
            status="OPEN",
            opened_at=now_utc,
            opened_by=caller_actor,
        )
        db.add(new_bday)
        await db.commit()
        await db.refresh(new_bday)
        return True, None, new_bday

    # 2. Check if rollover is actually required
    requires_rollover, _ = check_shift_requires_rollover(current_bday, rest)
    if not requires_rollover and not force_close:
        return False, current_bday, None

    # 3. Compute financial metrics for the closing day
    metrics = await calculate_shift_financial_ledger(rest.id, current_bday, db)

    # Check reconciliation requirement
    has_unsettled = (metrics["unpaid_bills_amount"] > 0 or metrics["unbilled_orders_amount"] > 0)
    requires_reconciliation = has_unsettled

    close_note = notes or (
        f"Automated rollover on {now_utc.strftime('%d %b %Y %H:%M:%S UTC')}. "
        f"Shift operational date: {current_bday.business_date}. "
        f"Orders: {metrics['total_orders']} (₹{metrics['order_value']:.2f}), "
        f"Settled: ₹{metrics['settled_sales']:.2f}, "
        f"Unbilled/Pending: ₹{metrics['outstanding_receivables']:.2f}."
    )

    # 4. Seal current business day
    current_bday.status = "CLOSED"
    current_bday.closed_at = now_utc
    current_bday.closed_by = caller_actor
    current_bday.total_orders = metrics["total_orders"]
    current_bday.food_orders = metrics["food_orders"]
    current_bday.bar_orders = metrics["bar_orders"]
    current_bday.completed_orders = metrics["completed_orders"]
    current_bday.cancelled_orders = metrics["cancelled_orders"]
    current_bday.total_sales = metrics["settled_sales"]
    current_bday.gross_sales = metrics["gross_sales"]
    current_bday.net_sales = metrics["net_sales"]
    current_bday.food_sales = metrics["food_sales"]
    current_bday.bar_sales = metrics["bar_sales"]
    current_bday.tax_amount = metrics["tax_amount"]
    current_bday.discount_amount = metrics["discount_amount"]
    current_bday.service_charge_amount = metrics["service_charge_amount"]
    current_bday.cash_sales = metrics["cash_sales"]
    current_bday.card_sales = metrics["card_sales"]
    current_bday.upi_sales = metrics["upi_sales"]
    current_bday.unpaid_bills_amount = metrics["unpaid_bills_amount"]
    current_bday.unbilled_orders_amount = metrics["unbilled_orders_amount"]
    current_bday.requires_reconciliation = requires_reconciliation
    current_bday.is_auto_rolled = True
    current_bday.closing_notes = close_note
    current_bday.summary_json = {
        "closedAt": now_utc.isoformat(),
        "closedBy": caller_actor,
        "isAutoRolled": True,
        "requiresReconciliation": requires_reconciliation,
        **metrics,
    }

    # 5. Clean operational baseline for next business day (non-destructive to orders/bills)
    since_time = current_bday.opened_at

    # Authoritatively stamp business_day_id on all orders and bills from this operational shift
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

    # Reset tables to AVAILABLE baseline
    await db.execute(
        update(Table).where(Table.restaurant_id == rest.id).values(
            status="AVAILABLE",
            is_occupied=False,
            active_session_id=None,
        ).execution_options(synchronize_session=False)
    )

    # Close active table sessions
    await db.execute(
        update(TableSession).where(
            TableSession.restaurant_id == rest.id,
            TableSession.status == "ACTIVE"
        ).values(
            status="CLOSED",
            session_closed_at=now_utc
        ).execution_options(synchronize_session=False)
    )

    # Seal lingering preparation tickets
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

    # Complete waiter requests
    await db.execute(
        update(CustomerRequestModel).where(
            CustomerRequestModel.restaurant_id == rest.id,
            CustomerRequestModel.status == "PENDING"
        ).values(
            status="COMPLETED"
        ).execution_options(synchronize_session=False)
    )

    # 6. Establish the new business date synchronized to restaurant's local operational date
    # Concurrency guard: check if another worker opened a business day concurrently
    check_concurrent = select(BusinessDay).where(
        BusinessDay.restaurant_id == rest.id,
        BusinessDay.status == "OPEN"
    ).with_for_update()
    concurrent_res = await db.execute(check_concurrent)
    existing_open = concurrent_res.scalar_one_or_none()

    if existing_open:
        new_bday = existing_open
    else:
        next_date = get_operational_business_date(now_utc, rest)
        new_id = f"bday-{rest.id}-{uuid.uuid4().hex[:10]}"
        new_bday = BusinessDay(
            id=new_id,
            restaurant_id=rest.id,
            business_date=next_date,
            status="OPEN",
            opened_at=now_utc,
            opened_by=caller_actor,
        )
        db.add(new_bday)

    await db.commit()
    await db.refresh(current_bday)
    await db.refresh(new_bday)

    # 7. Durable Audit Log
    AdminAuditLogger.log_action(
        admin_uid=caller_actor,
        action="BUSINESS_DAY_ROLLOVER",
        target_resource="BusinessDay",
        target_id=current_bday.id,
        details={
            "restaurant_id": rest.id,
            "closed_business_day_id": current_bday.id,
            "closed_business_date": current_bday.business_date,
            "new_business_day_id": new_bday.id,
            "new_business_date": new_bday.business_date,
            "requires_reconciliation": requires_reconciliation,
            "total_orders": metrics["total_orders"],
            "order_value": metrics["order_value"],
            "settled_sales": metrics["settled_sales"],
            "outstanding_receivables": metrics["outstanding_receivables"],
        }
    )
    logger.info(
        f"[ROLLOVER_SUCCESS] restaurant={rest.id}: closed {current_bday.business_date} "
        f"-> opened {new_bday.business_date} (reconciliation={requires_reconciliation})"
    )

    # 8. Broadcast Realtime WebSocket Events across all restaurant terminals
    event_id = f"evt-{uuid.uuid4().hex[:10]}"
    try:
        await ws_manager.broadcast_event(
            restaurant_id=rest.id,
            event_type="BusinessDayRolledOver",
            payload={
                "event_id": event_id,
                "restaurant_id": rest.id,
                "closed_business_day_id": current_bday.id,
                "closed_business_date": current_bday.business_date,
                "new_business_day_id": new_bday.id,
                "new_business_date": new_bday.business_date,
                "requires_reconciliation": requires_reconciliation,
                "timestamp": now_utc.isoformat(),
            },
            target_audience=["OWNER", "MANAGER", "WAITER", "KITCHEN", "BAR", "HOOKAH"]
        )
    except Exception as ws_err:
        logger.warning(f"[WS_BROADCAST_NOTICE] Rollover event error: {ws_err}")

    return True, current_bday, new_bday

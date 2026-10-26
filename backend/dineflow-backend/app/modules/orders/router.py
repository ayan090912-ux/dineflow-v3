import time
from typing import Optional, List, Any, Dict
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Header
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_

from app.core.database.connection import get_db
from app.core.security.tenant_auth import get_caller_context, CallerContext, require_tenant_staff_or_owner
from app.modules.orders.models import Order, OrderItem, Bill
from app.modules.tables.models import Table, TableSession
from app.modules.menu.models import MenuItem
from app.modules.business_day.models import BusinessDay

from app.modules.restaurants.models import Restaurant
from app.modules.taxes.models import Tax, TaxCategory, TaxMenuItem, InvoiceTaxSnapshot
from app.modules.taxes.calculation import calculate_taxes
from app.modules.billing.service import BillingService, get_table_variants

router = APIRouter()

class OrderItemInputSchema(BaseModel):
    id: Optional[str] = None
    menuItemId: Optional[str] = None
    name: str
    price: Optional[float] = None
    quantity: int = 1
    notes: Optional[str] = ""
    targetDestination: Optional[str] = "KITCHEN"
    isAlcoholic: Optional[bool] = False
    category: Optional[str] = None
    categoryId: Optional[str] = None
    imageUrl: Optional[str] = None
    image: Optional[str] = None

class CreateOrderSchema(BaseModel):
    restaurantId: str
    id: Optional[str] = None
    idempotencyKey: Optional[str] = None
    clientOrderId: Optional[str] = None
    pickupCode: Optional[str] = None
    tableId: Optional[str] = None
    tableNumber: Optional[str] = "Table 01"
    tableSessionId: Optional[str] = None
    items: List[OrderItemInputSchema]
    customerName: Optional[str] = "Guest"
    notes: Optional[str] = ""
    orderType: Optional[str] = "DINE_IN"
    paymentMethod: Optional[str] = "CASH"
    payment_method: Optional[str] = None
    total: Optional[float] = None
    eventId: Optional[str] = None
    eventName: Optional[str] = None
    ageConfirmed: Optional[bool] = None
    legalDrinkingAgeAffirmed: Optional[bool] = None
    estimatedPrepTimeMinutes: Optional[int] = None
    estimated_prep_time_minutes: Optional[int] = None

class RedeemPickupCodeSchema(BaseModel):
    code: str
    restaurantId: Optional[str] = None
    redeemedBy: Optional[str] = "Counter Staff"
    force: Optional[bool] = False

class UpdateOrderStatusSchema(BaseModel):
    status: Optional[str] = None
    kitchenStatus: Optional[str] = None
    barStatus: Optional[str] = None
    hookahStatus: Optional[str] = None
    estimatedPrepTimeMinutes: Optional[int] = None
    etaTargetTimestamp: Optional[str] = None
    claimedBy: Optional[str] = None
    deliveryStatus: Optional[str] = None
    paymentStatus: Optional[str] = None
    paymentMethod: Optional[str] = None

class UpdateOrderETASchema(BaseModel):
    deltaMinutes: Optional[int] = None
    targetTimestamp: Optional[str] = None
    estimatedPrepTimeMinutes: Optional[int] = None
    reason: Optional[str] = None

def resolve_item_station(it: Any) -> str:
    """Canonical single-source-of-truth station routing for an order item."""
    if not isinstance(it, dict):
        return "KITCHEN"
    dest = (it.get("targetDestination") or it.get("target_destination") or it.get("station") or "").upper()
    if dest == "HOOKAH":
        return "HOOKAH"
    if dest == "BAR" or it.get("isAlcoholic") is True or it.get("is_alcoholic") is True:
        return "BAR"

    cat = (it.get("categoryName") or it.get("category") or it.get("barCategory") or "").lower()
    name = (it.get("name") or "").lower()

    if "hookah" in cat or "shisha" in cat or "hookah" in name or "shisha" in name:
        return "HOOKAH"

    bar_keywords = (
        "bar", "cocktail", "mocktail", "wine", "beer", "whiskey", "vodka",
        "gin", "rum", "beverage", "drink", "soda", "liquor", "mojito", "scotch", "tequila", "brandy"
    )
    if any(k in cat for k in bar_keywords) or any(k in name for k in bar_keywords):
        return "BAR"

    return "KITCHEN"

def format_order_response(order: Order, station: Optional[str] = None, hide_financials: bool = False) -> dict:
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

    raw_items = getattr(order, "items_json", []) or []
    eff_st = (station or "").upper()
    if eff_st == "BAR":
        filtered_items = [it for it in raw_items if resolve_item_station(it) == "BAR"]
    elif eff_st == "HOOKAH":
        filtered_items = [it for it in raw_items if resolve_item_station(it) == "HOOKAH"]
    elif eff_st == "KITCHEN":
        filtered_items = [it for it in raw_items if resolve_item_station(it) == "KITCHEN"]
    else:
        filtered_items = raw_items

    if hide_financials:
        subtotal_val = None
        tax_amount_val = None
        total_amount_val = None
        tax_breakdown_val = None
        sanitized_items = []
        for it in filtered_items:
            it_copy = dict(it) if isinstance(it, dict) else (it.copy() if hasattr(it, "copy") else dict(it))
            it_copy["price"] = None
            sanitized_items.append(it_copy)
        filtered_items = sanitized_items
    else:
        subtotal_val = getattr(order, "subtotal", 0.0) or 0.0
        tax_amount_val = getattr(order, "tax_amount", 0.0) or 0.0
        total_amount_val = tot_amt
        tax_breakdown_val = getattr(order, "tax_breakdown_json", []) or []

    is_event_order = (
        getattr(order, "order_type", "") in ["EVENT_ORDER", "WEDDING_EVENT"]
        or getattr(order, "event_id", None) is not None
    )
    if is_event_order:
        prep_time_val = None
        eff_eta_val = None
    else:
        raw_prep = getattr(order, "estimated_prep_time_minutes", None)
        prep_time_val = raw_prep if raw_prep is not None else 15
        eff_eta_val = eta_val

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
        "kitchen_status": getattr(order, "kitchen_status", None),
        "kitchenStatus": getattr(order, "kitchen_status", None),
        "bar_status": getattr(order, "bar_status", None),
        "barStatus": getattr(order, "bar_status", None),
        "hookah_status": getattr(order, "hookah_status", None),
        "hookahStatus": getattr(order, "hookah_status", None),
        "customer_name": cust_name,
        "customerName": cust_name,
        "notes": getattr(order, "notes", ""),
        "subtotal": subtotal_val,
        "tax_amount": tax_amount_val,
        "taxAmount": tax_amount_val,
        "total_amount": total_amount_val,
        "totalAmount": total_amount_val,
        "order_number": ord_num or "#ORD-1",
        "orderNumber": ord_num or "#ORD-1",
        "estimated_prep_time_minutes": prep_time_val,
        "estimatedPrepTimeMinutes": prep_time_val,
        "eta_target_timestamp": eff_eta_val,
        "etaTargetTimestamp": eff_eta_val,
        "items": filtered_items,
        "items_json": filtered_items,
        "tax_breakdown": tax_breakdown_val,
        "business_day_id": getattr(order, "business_day_id", None),
        "businessDayId": getattr(order, "business_day_id", None),
        "order_type": getattr(order, "order_type", "DINE_IN") or "DINE_IN",
        "orderType": getattr(order, "order_type", "DINE_IN") or "DINE_IN",
        "event_id": getattr(order, "event_id", None),
        "eventId": getattr(order, "event_id", None),
        "event_name": getattr(order, "event_name", None),
        "eventName": getattr(order, "event_name", None),
        "claimed_by": getattr(order, "claimed_by", None),
        "claimedBy": getattr(order, "claimed_by", None),
        "delivery_status": getattr(order, "delivery_status", None),
        "deliveryStatus": getattr(order, "delivery_status", None),
        "delivered_at": (order.delivered_at.isoformat() if getattr(order, "delivered_at", None) else None),
        "deliveredAt": (order.delivered_at.isoformat() if getattr(order, "delivered_at", None) else None),
        "pickup_code": getattr(order, "pickup_code", None),
        "pickupCode": getattr(order, "pickup_code", None),
        "pickup_status": getattr(order, "pickup_status", "UNCLAIMED") or "UNCLAIMED",
        "pickupStatus": getattr(order, "pickup_status", "UNCLAIMED") or "UNCLAIMED",
        "payment_status": getattr(order, "payment_status", "UNPAID") or "UNPAID",
        "paymentStatus": getattr(order, "payment_status", "UNPAID") or "UNPAID",
        "payment_method": getattr(order, "payment_method", "CASH") or "CASH",
        "paymentMethod": getattr(order, "payment_method", "CASH") or "CASH",
        "claimed_at": (order.claimed_at.isoformat() if getattr(order, "claimed_at", None) else None),
        "claimedAt": (order.claimed_at.isoformat() if getattr(order, "claimed_at", None) else None),
        "idempotency_key": getattr(order, "idempotency_key", None),
        "idempotencyKey": getattr(order, "idempotency_key", None),
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


def invalidate_order_tax_cache(restaurant_id: Optional[str] = None):
    """Invalidates the order tax cache for a specific restaurant or globally."""
    if restaurant_id:
        _ORDER_TAX_CACHE.pop(restaurant_id, None)
    else:
        _ORDER_TAX_CACHE.clear()

_ORDER_DAILY_SEQ: dict = {}

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: CreateOrderSchema,
    idempotency_key_header: Optional[str] = Header(None, alias="Idempotency-Key"),
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
            if db_rest.lifecycle_status in ["SUSPENDED", "ARCHIVED", "REJECTED"]:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Restaurant '{payload.restaurantId}' is archived or inactive"
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
            elif caller.role in ["WAITER", "CHEF", "KITCHEN", "BAR", "BARTENDER", "HOOKAH", "SHISHA", "MANAGER"]:
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
            res_tbl_check = await db.execute(select(Table).where(
                (Table.id == payload.tableId) & (Table.restaurant_id == restaurant.id)
            ))
            existing_tbl = res_tbl_check.scalar_one_or_none()
            if not existing_tbl:
                # Check if tableId was passed for table in another restaurant
                res_wrong_rest = await db.execute(select(Table).where(Table.id == payload.tableId))
                wrong_tbl = res_wrong_rest.scalar_one_or_none()
                if wrong_tbl and wrong_tbl.restaurant_id != restaurant.id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Table '{payload.tableId}' does not belong to restaurant '{restaurant.id}'"
                    )
                # Fallback: check if payload.tableId or tbl_num matches table_number
                res_tbl_check = await db.execute(select(Table).where(
                    (Table.restaurant_id == restaurant.id) &
                    ((Table.table_number == payload.tableId) | (Table.table_number == tbl_num) | (Table.table_number == f"Table {tbl_num}"))
                ))
                existing_tbl = res_tbl_check.scalar_one_or_none()
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

        is_wedding_event = (payload.orderType == "WEDDING_EVENT") or bool(payload.eventId)

        if not is_wedding_event:
            session_id = payload.tableSessionId or f"sess-{restaurant.id}-{tbl_id or 'tbl'}-{int(now_utc.timestamp() * 1000)}"
            t_candidates = get_table_variants(tbl_num)

            try:
                from sqlalchemy import case
                if payload.tableSessionId:
                    res_direct_sess = await db.execute(
                        select(TableSession).where(
                            (TableSession.restaurant_id == restaurant.id) &
                            (TableSession.id == payload.tableSessionId) &
                            (TableSession.status != "CLOSED")
                        )
                    )
                    direct_sess = res_direct_sess.scalar_one_or_none()
                    if direct_sess:
                        actual_session_id = direct_sess.id
                        if direct_sess.table_id and not tbl_id:
                            tbl_id = direct_sess.table_id
                        if direct_sess.table_number:
                            tbl_num = direct_sess.table_number

                if not actual_session_id:
                    table_sess_filters = []
                    if tbl_id:
                        table_sess_filters.append(TableSession.table_id == tbl_id)
                    if t_candidates:
                        table_sess_filters.append(TableSession.table_number.in_(t_candidates))

                    query_sess = select(TableSession).where(
                        (TableSession.restaurant_id == restaurant.id) &
                        (
                            (TableSession.id == session_id) |
                            (
                                or_(*table_sess_filters) &
                                (TableSession.status != "CLOSED")
                            ) if table_sess_filters else (TableSession.id == session_id)
                        )
                    ).order_by(
                        case((TableSession.id == session_id, 1), else_=0).desc(),
                        TableSession.session_started_at.desc()
                    ).limit(1)
                    res_sess = await db.execute(query_sess)
                    matched_sess = res_sess.scalar_one_or_none()

                    if matched_sess and matched_sess.status != "CLOSED":
                        actual_session_id = matched_sess.id
                    else:
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
                                (or_(*table_sess_filters) if table_sess_filters else (TableSession.id == session_id)) &
                                (TableSession.status != "CLOSED")
                            ).order_by(TableSession.session_started_at.desc()).limit(1))
                            race_sess = res_sess_race.scalar_one_or_none()
                            if race_sess:
                                actual_session_id = race_sess.id
            except Exception as sess_err:
                print("[SESSION_CREATION_NOTICE] TableSession creation handled:", sess_err)
        else:
            actual_session_id = None

        # 1. Authoritative MenuItem resolution from database
        menu_item_ids = [i.menuItemId or i.id for i in payload.items if (i.menuItemId or i.id)]
        item_names = [i.name.strip() for i in payload.items if i.name]

        query_menu = select(MenuItem).where(
            MenuItem.restaurant_id == restaurant.id,
            or_(
                MenuItem.id.in_(menu_item_ids),
                MenuItem.name.in_(item_names)
            )
        )
        res_menu = await db.execute(query_menu)
        db_menu_items = res_menu.scalars().all()
        menu_by_id = {m.id: m for m in db_menu_items}
        menu_by_name = {m.name.lower().strip(): m for m in db_menu_items}

        is_staff_caller = caller.is_authenticated and (caller.role in ["OWNER", "RESTAURANT_OWNER", "WAITER", "CHEF", "BAR", "HOOKAH", "SHISHA", "MANAGER", "ADMIN"])

        resolved_items_list = []
        for i in payload.items:
            m_rec = menu_by_id.get(i.menuItemId or i.id) or menu_by_name.get((i.name or "").lower().strip())
            if m_rec:
                if m_rec.deleted_at is not None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Item '{m_rec.name}' has been deleted from the menu."
                    )
                if not m_rec.is_available:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Item '{m_rec.name}' is currently unavailable or sold out."
                    )
                m_dest = (getattr(m_rec, "target_destination", None) or "").upper()
                m_name = (m_rec.name or "").lower()
                if m_dest == "HOOKAH" or "hookah" in m_name or "shisha" in m_name:
                    station = "HOOKAH"
                elif m_dest == "BAR" or m_rec.is_alcoholic or any(k in m_name for k in ("cocktail", "mocktail", "wine", "beer", "whiskey", "vodka", "gin", "rum", "beverage", "drink", "soda")):
                    station = "BAR"
                else:
                    station = "KITCHEN"
                is_alc = bool(m_rec.is_alcoholic)

                rec_price = float(m_rec.price or 0.0)
                if not is_wedding_event and rec_price <= 0.0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Item '{m_rec.name}' has invalid zero pricing for standard dining. Please contact staff."
                    )
                # Enforce that customer price cannot be arbitrarily lower than catalog price,
                # but allow legitimate modifiers/add-ons (price >= m_rec.price) and authorized staff discounts.
                if i.price is not None and float(i.price) >= rec_price:
                    auth_price = float(i.price)
                elif is_staff_caller and i.price is not None and float(i.price) > 0.0:
                    auth_price = float(i.price)
                elif rec_price > 0.0:
                    auth_price = rec_price
                elif i.price is not None and float(i.price) > 0.0:
                    auth_price = float(i.price)
                else:
                    auth_price = rec_price

                auth_name = m_rec.name
                item_mid = m_rec.id
            else:
                if len(db_menu_items) > 0 and not is_staff_caller and not is_wedding_event:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Item '{i.name or i.menuItemId or i.id}' is not found on the menu."
                    )
                p_dest = (i.targetDestination or "").upper()
                p_name = (i.name or "").lower()
                if p_dest == "HOOKAH" or "hookah" in p_name or "shisha" in p_name:
                    station = "HOOKAH"
                elif p_dest == "BAR" or i.isAlcoholic or any(k in p_name for k in ("cocktail", "mocktail", "wine", "beer", "whiskey", "vodka", "gin", "rum", "beverage", "drink", "soda")):
                    station = "BAR"
                else:
                    station = p_dest or "KITCHEN"
                is_alc = bool(i.isAlcoholic)
                auth_price = float(i.price or 0.0)
                if not is_wedding_event and auth_price <= 0.0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Item '{i.name or 'Custom item'}' requires a valid price greater than zero."
                    )
                auth_name = i.name
                item_mid = i.menuItemId or i.id or f"item-custom-{int(now_utc.timestamp())}"

            d = i.model_dump()
            d["id"] = item_mid
            d["menuItemId"] = item_mid
            d["name"] = auth_name
            d["price"] = auth_price
            img_url = (getattr(m_rec, "image_url", None) if m_rec else None) or i.imageUrl or i.image
            if img_url:
                d["imageUrl"] = img_url
                d["image"] = img_url
            eff_station = station if m_rec else resolve_item_station(d)
            d["targetDestination"] = eff_station
            d["target_destination"] = eff_station
            d["isAlcoholic"] = is_alc or (eff_station == "BAR")
            d["is_alcoholic"] = is_alc or (eff_station == "BAR")
            resolved_items_list.append(d)

        items_list_dict = resolved_items_list
        has_kitchen = any(resolve_item_station(it) == "KITCHEN" for it in items_list_dict)
        has_bar = any(resolve_item_station(it) == "BAR" for it in items_list_dict)
        has_hookah = any(resolve_item_station(it) == "HOOKAH" for it in items_list_dict)

        kitchen_status = "PENDING" if has_kitchen else None
        bar_status = "PENDING" if has_bar else None
        hookah_status = "PENDING" if has_hookah else None

        subtotal = sum((float(i.get("price") or 0) * int(i.get("quantity") or 1)) for i in items_list_dict)
        tax_amount = 0.0
        total = subtotal
        tax_breakdown = []

        try:
            cached_tax_entry = _ORDER_TAX_CACHE.get(restaurant.id)
            if cached_tax_entry and (now_mono - cached_tax_entry[0] < _ORDER_TAX_CACHE_TTL):
                active_taxes, tax_cats_map, tax_items_map = cached_tax_entry[1]
            else:
                # Resolve actual Restaurant DB model for tax configuration
                r_db_res = await db.execute(select(Restaurant).where(Restaurant.id == restaurant.id))
                rest_db_obj = r_db_res.scalar_one_or_none()
                if not rest_db_obj:
                    rest_db_obj = restaurant

                active_taxes, tax_cats_map, tax_items_map = await BillingService.get_effective_taxes(rest_db_obj, db)
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
        eff_idempotency_key = (
            idempotency_key_header
            or payload.idempotencyKey
            or payload.clientOrderId
            or (payload.id if payload.id and not payload.id.startswith("ord-") else None)
        )

        if eff_idempotency_key:
            res_existing = await db.execute(
                select(Order).where(
                    Order.restaurant_id == restaurant.id,
                    (Order.id == eff_idempotency_key) | (Order.idempotency_key == eff_idempotency_key)
                )
            )
            existing_ord = res_existing.scalar_one_or_none()
            if existing_ord:
                print(f"[ORDER_IDEMPOTENCY_HIT] Returning existing order {existing_ord.id} for idempotency key {eff_idempotency_key}")
                return format_order_response(existing_ord, hide_financials=(is_wedding_event and not is_staff_caller))

        if payload.id:
            res_existing_id = await db.execute(
                select(Order).where(
                    Order.restaurant_id == restaurant.id,
                    Order.id == payload.id
                )
            )
            existing_id_ord = res_existing_id.scalar_one_or_none()
            if existing_id_ord:
                print(f"[ORDER_IDEMPOTENCY_HIT] Returning existing order {existing_id_ord.id} for id {payload.id}")
                return format_order_response(existing_id_ord, hide_financials=(is_wedding_event and not is_staff_caller))

        order_id = payload.id or (f"ord-{restaurant.id}-{eff_idempotency_key}" if eff_idempotency_key else f"ord-{restaurant.id}-{int(now_utc.timestamp() * 1000)}")
        target_code = payload.pickupCode or f"C{daily_seq:04d}"
        if not payload.pickupCode:
            while True:
                code_exists_stmt = select(Order.id).where(
                    Order.restaurant_id == restaurant.id,
                    Order.pickup_code == target_code
                )
                res_exists = await db.execute(code_exists_stmt)
                if not res_exists.scalar_one_or_none():
                    break
                daily_seq += 1
                target_code = f"C{daily_seq:04d}"
        pickup_code = target_code

        # Rapid-tap duplicate guard for event orders
        if payload.eventId and (tbl_id or tbl_num):
            dup_cutoff = now_utc - timedelta(seconds=10)
            dup_stmt = select(Order).where(
                Order.restaurant_id == restaurant.id,
                Order.event_id == payload.eventId,
                Order.created_at >= dup_cutoff,
                Order.total_amount == total
            )
            dup_res = await db.execute(dup_stmt)
            for cand in dup_res.scalars().all():
                if cand.table_number == tbl_num or (tbl_id and cand.table_id == tbl_id):
                    print(f"[ORDER_RAPID_DUPLICATE_GUARD] Returning existing order {cand.id} to prevent double tap")
                    return format_order_response(cand, hide_financials=(is_wedding_event and not is_staff_caller))

        # Query active OPEN business day for authoritative attribution
        query_bday = select(BusinessDay.id).where(
            BusinessDay.restaurant_id == restaurant.id,
            BusinessDay.status == "OPEN"
        ).order_by(BusinessDay.opened_at.desc()).limit(1)
        res_bday = await db.execute(query_bday)
        active_bday_id = res_bday.scalar_one_or_none()

        # Event Verification & Association (Weddings & Events Module)
        eff_order_type = payload.orderType or "DINE_IN"
        eff_event_id = None
        eff_event_name = None
        if payload.eventId:
            from app.modules.weddings.models import WeddingEvent, EventTable
            from app.modules.weddings.service_period import validate_order_within_event_window

            evt_query = select(WeddingEvent).where(
                WeddingEvent.id == payload.eventId,
                WeddingEvent.restaurant_id == restaurant.id
            )
            evt_res = await db.execute(evt_query)
            evt_obj = evt_res.scalar_one_or_none()
            if not evt_obj:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Event '{payload.eventId}' was not found for this venue."
                )

            # Authoritative server-side service duration policy & status validation
            validate_order_within_event_window(evt_obj, now_utc)

            # Authoritative station availability enforcement
            has_food_event = getattr(evt_obj, "has_food", True) if getattr(evt_obj, "has_food", None) is not None else True
            has_bar_event = getattr(evt_obj, "has_bar", False) if getattr(evt_obj, "has_bar", None) is not None else False
            has_hookah_event = getattr(evt_obj, "has_hookah", False) if getattr(evt_obj, "has_hookah", None) is not None else False

            if has_kitchen and not has_food_event:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Food service is disabled for this event.",
                )
            if has_bar and not has_bar_event:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Bar & Drink service is disabled for this event.",
                )
            if has_hookah and not has_hookah_event:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Hookah / Shisha service is disabled for this event.",
                )

            # Alcohol legal age verification check
            has_alcoholic_items = any(bool(it.get("isAlcoholic")) for it in items_list_dict)
            if has_alcoholic_items:
                if not has_bar_event:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Alcoholic beverage service is disabled for this event.",
                    )
                age_ok = getattr(payload, "legalDrinkingAgeAffirmed", None) or getattr(payload, "ageConfirmed", None) or is_staff_caller
                if not age_ok:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Legal drinking age verification (21+) is required to order alcoholic beverages.",
                    )

            # Table mapping check: If tableId or tableNumber provided, verify/bind to EventTable
            if tbl_num or tbl_id:
                etbl_stmt = select(EventTable).where(
                    EventTable.event_id == evt_obj.id,
                    EventTable.restaurant_id == restaurant.id,
                    EventTable.is_active.is_(True),
                    (EventTable.table_number == tbl_num) | (EventTable.id == tbl_id)
                )
                etbl_res = await db.execute(etbl_stmt)
                matched_etbl = etbl_res.scalar_one_or_none()
                if matched_etbl:
                    tbl_num = matched_etbl.table_number
                tbl_id = None

            eff_order_type = "EVENT_ORDER" if (evt_obj.event_type and evt_obj.event_type != "WEDDING") else "WEDDING_EVENT"
            eff_event_id = evt_obj.id
            eff_event_name = evt_obj.title

        new_order = Order(
            id=order_id,
            restaurant_id=restaurant.id,
            table_id=tbl_id,
            table_number=tbl_num,
            table_session_id=actual_session_id,
            business_day_id=active_bday_id,
            status="PENDING",
            kitchen_status=kitchen_status,
            bar_status=bar_status,
            hookah_status=hookah_status,
            customer_name=payload.customerName or "Guest",
            notes=payload.notes or "",
            subtotal=subtotal,
            tax_amount=tax_amount,
            total_amount=total,
            order_number=order_num,
            estimated_prep_time_minutes=payload.estimatedPrepTimeMinutes or 15,
            eta_target_timestamp=now_utc + timedelta(minutes=(payload.estimatedPrepTimeMinutes or 15)),
            items_json=items_list_dict,
            tax_breakdown_json=tax_breakdown,
            order_type=eff_order_type,
            event_id=eff_event_id,
            event_name=eff_event_name,
            idempotency_key=eff_idempotency_key,
            pickup_code=pickup_code,
            pickup_status="UNCLAIMED",
            payment_status="UNPAID",
            payment_method=payload.paymentMethod or payload.payment_method or "CASH",
            created_at=now_utc,
        )
        db.add(new_order)

        # For event orders, do NOT modify ordinary restaurant floorplan tables
        if not payload.eventId:
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
            it_meta = items_list_dict[idx]
            eff_price = float(it_meta.get("price") if it_meta.get("price") is not None else i.price)
            eff_qty = int(it_meta.get("quantity") if it_meta.get("quantity") is not None else i.quantity)
            new_item = OrderItem(
                id=f"oi-{int(now_utc.timestamp() * 1000)}-{idx}",
                order_id=order_id,
                menu_item_id=it_meta.get("menuItemId") or it_meta.get("id") or i.menuItemId or i.id or "item-unknown",
                name=it_meta.get("name") or i.name,
                quantity=eff_qty,
                unit_price=eff_price,
                subtotal=eff_price * eff_qty,
                notes=i.notes or "",
                target_destination=it_meta["targetDestination"],
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

        # Authoritative Inventory & Menu Item Stock Decrement
        menu_stock_updated = False
        for it_meta in items_list_dict:
            qty_ordered = int(it_meta.get("quantity") or 1)
            mid = it_meta.get("menuItemId") or it_meta.get("id")
            m_name = (it_meta.get("name") or "").strip()

            # 1. Decrement MenuItem stock if tracked
            if mid and mid in menu_by_id:
                m_obj = menu_by_id[mid]
                if getattr(m_obj, "track_inventory", False) and getattr(m_obj, "stock_quantity", None) is not None:
                    new_sq = max(0, int(m_obj.stock_quantity) - qty_ordered)
                    m_obj.stock_quantity = new_sq
                    if new_sq <= 0:
                        m_obj.is_available = False
                    menu_stock_updated = True

            # 2. Decrement corresponding InventoryItemModel if exists
            try:
                from app.modules.inventory.models import InventoryItemModel
                inv_res = await db.execute(
                    select(InventoryItemModel).where(
                        InventoryItemModel.restaurant_id == restaurant.id,
                        func.lower(InventoryItemModel.name) == m_name.lower()
                    )
                )
                inv_rec = inv_res.scalar_one_or_none()
                if inv_rec:
                    new_inv_q = max(0.0, float(inv_rec.quantity) - qty_ordered)
                    inv_rec.quantity = new_inv_q
                    if new_inv_q <= 0:
                        inv_rec.status = "OUT_OF_STOCK"
                    elif new_inv_q <= inv_rec.min_threshold:
                        inv_rec.status = "LOW_STOCK"
                    else:
                        inv_rec.status = "IN_STOCK"
            except Exception as inv_err:
                print("[INVENTORY_SYNC_NOTICE] Inventory decrement handled:", inv_err)

        await db.commit()
        print(f"[ORDER_DATABASE_COMMITTED] order_id={order_id} restaurant_id={restaurant.id} total={total}")
        is_evt_order = bool(new_order.event_id) or (getattr(new_order, "order_type", "") in ["EVENT_ORDER", "WEDDING_EVENT"])
        resp_data = format_order_response(new_order, hide_financials=is_evt_order)

        try:
            from app.modules.websocket.manager import ws_manager
            order_target_aud = ["CUSTOMER", "OWNER"]
            if has_kitchen and restaurant.has_kitchen is not False and (not restaurant.enabled_modules or "kitchen" in restaurant.enabled_modules):
                order_target_aud.append("KITCHEN")
            if has_bar and restaurant.has_bar is not False and (not restaurant.enabled_modules or "bar" in restaurant.enabled_modules):
                order_target_aud.append("BAR")
            if has_hookah and (not restaurant.enabled_modules or "hookah" in restaurant.enabled_modules):
                order_target_aud.append("HOOKAH")
            if restaurant.has_waiter is not False and (not restaurant.enabled_modules or "waiter" in restaurant.enabled_modules):
                order_target_aud.append("WAITER")

            await ws_manager.broadcast_event(
                restaurant_id=restaurant.id,
                event_type="order_created",
                payload=resp_data,
                target_audience=order_target_aud
            )
            # Instantly update Active Tables across Owner, Waiter, and Customer terminals (ordinary orders only)
            if not payload.eventId and (tbl_id or tbl_num):
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

        if is_wedding_event and not is_staff_caller:
            return format_order_response(new_order, hide_financials=True)
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
        t_variants = get_table_variants(table_id)
        query_sess = select(TableSession).where(
            (TableSession.restaurant_id == canonical_rest_id) &
            ((TableSession.table_id == table_id) | (TableSession.table_number.in_(t_variants))) &
            (TableSession.status != "CLOSED")
        ).order_by(TableSession.session_started_at.desc())
        res_sess = await db.execute(query_sess)
        active_sess = res_sess.scalars().first()

        if active_sess:
            query = query.where(Order.table_session_id == active_sess.id)
        else:
            return []

    query = query.order_by(Order.created_at.desc())
    result = await db.execute(query)
    orders = result.scalars().all()
    return [
        format_order_response(
            o,
            hide_financials=(bool(o.event_id) or getattr(o, "order_type", "") in ["EVENT_ORDER", "WEDDING_EVENT"])
        )
        for o in orders
    ]



@router.get("/restaurant/{restaurant_id}")
async def get_restaurant_orders(
    restaurant_id: str,
    active_only: bool = Query(False),
    station: Optional[str] = Query(None),
    business_day_id: Optional[str] = Query(None),
    event_id: Optional[str] = Query(None),
    exclude_events: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    try:
        target_rest_id = restaurant_id or caller.restaurant_id
        try:
            from app.core.tenant.resolver import resolve_canonical_restaurant_id
            target_rest_id = await resolve_canonical_restaurant_id(target_rest_id, db)
        except Exception:
            pass

        if caller.restaurant_id and caller.restaurant_id != target_rest_id:
            caller_canon = caller.restaurant_id
            try:
                from app.core.tenant.resolver import resolve_canonical_restaurant_id
                caller_canon = await resolve_canonical_restaurant_id(caller.restaurant_id, db)
            except Exception:
                pass
            if caller_canon and caller_canon.lower() != target_rest_id.lower() and caller.role not in ["OWNER", "SUPER_ADMIN", "ADMIN"]:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Staff member does not belong to this restaurant")

        caller_role = (caller.role or "").upper()
        if caller_role in ["HOOKAH", "SHISHA", "HOOKAH_STAFF", "SHISHA_STAFF"]:
            if station and station.upper() not in ["HOOKAH", "SHISHA"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Forbidden: Hookah staff cannot access station '{station}'. Only Hookah station queue is accessible."
                )
            effective_station = "HOOKAH"
        elif caller_role in ["BAR", "BARTENDER"]:
            if station and station.upper() != "BAR":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Forbidden: Bar staff cannot access station '{station}'. Only Bar station queue is accessible."
                )
            effective_station = "BAR"
        elif caller_role in ["CHEF", "KITCHEN", "COOK"]:
            if station and station.upper() != "KITCHEN":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Forbidden: Kitchen staff cannot access station '{station}'. Only Kitchen station queue is accessible."
                )
            effective_station = "KITCHEN"
        else:
            effective_station = station.upper() if station else None

        query = select(Order).where(Order.restaurant_id == target_rest_id)

        if event_id:
            query = query.where(Order.event_id == event_id.strip())
        elif exclude_events:
            query = query.where(Order.event_id.is_(None), Order.order_type.notin_(["WEDDING_EVENT", "EVENT_ORDER"]))

        # 1. Explicit business day history filter
        if business_day_id:
            clean_bday_id = business_day_id.strip()
            query = query.where(Order.business_day_id == clean_bday_id)
        elif event_id:
            # Events operate independently of restaurant POS business day shifts
            pass
        else:
            # Check current open business day for active shift scoping
            open_bday_res = await db.execute(
                select(BusinessDay).where(
                    BusinessDay.restaurant_id == target_rest_id,
                    BusinessDay.status == "OPEN"
                ).order_by(BusinessDay.opened_at.desc()).limit(1)
            )
            open_bday = open_bday_res.scalar_one_or_none()

            if active_only:
                if not open_bday:
                    has_bday_res = await db.execute(
                        select(func.count(BusinessDay.id)).where(BusinessDay.restaurant_id == target_rest_id)
                    )
                    has_bday_count = has_bday_res.scalar() or 0
                    if has_bday_count > 0:
                        if effective_station:
                            query = query.where(Order.status.in_(["PENDING", "PREPARING", "READY"]))
                        else:
                            query = query.where(
                                (Order.event_id.isnot(None)) |
                                (Order.order_type.in_(["WEDDING_EVENT", "EVENT_ORDER", "TAKEAWAY", "COUNTER_WALK_IN"])) |
                                (Order.status.in_(["PENDING", "PREPARING", "READY"]))
                            )
                    else:
                        query = query.where(Order.status.in_(["PENDING", "PREPARING", "READY"]))
                else:
                    query = query.where(
                        or_(
                            Order.business_day_id == open_bday.id,
                            and_(Order.business_day_id.is_(None), Order.created_at >= open_bday.opened_at),
                            Order.event_id.isnot(None),
                            Order.order_type.in_(["WEDDING_EVENT", "EVENT_ORDER"])
                        )
                    )
            elif effective_station:
                if open_bday:
                    query = query.where(
                        or_(
                            Order.business_day_id == open_bday.id,
                            and_(Order.business_day_id.is_(None), Order.created_at >= open_bday.opened_at),
                            Order.event_id.isnot(None),
                            Order.order_type.in_(["WEDDING_EVENT", "EVENT_ORDER"])
                        )
                    )
                else:
                    query = query.where(Order.status.notin_(["COMPLETED", "DELIVERED", "CANCELLED"]))

        if effective_station == "BAR":
            bar_subq = (
                select(OrderItem.order_id)
                .join(Order, OrderItem.order_id == Order.id)
                .where(
                    Order.restaurant_id == target_rest_id,
                    OrderItem.target_destination == "BAR"
                )
                .scalar_subquery()
            )
            query = query.where(or_(Order.id.in_(bar_subq), Order.bar_status.isnot(None)))
            if active_only:
                query = query.where(
                    Order.bar_status.in_(["PENDING", "PREPARING", "READY"]),
                    Order.status.notin_(["COMPLETED", "DELIVERED", "CANCELLED"])
                )

        elif effective_station == "HOOKAH":
            hookah_subq = (
                select(OrderItem.order_id)
                .join(Order, OrderItem.order_id == Order.id)
                .where(
                    Order.restaurant_id == target_rest_id,
                    OrderItem.target_destination == "HOOKAH"
                )
                .scalar_subquery()
            )
            query = query.where(or_(Order.id.in_(hookah_subq), Order.hookah_status.isnot(None)))
            if active_only:
                query = query.where(
                    Order.hookah_status.in_(["PENDING", "PREPARING", "READY"]),
                    Order.status.notin_(["COMPLETED", "DELIVERED", "CANCELLED"])
                )

        elif effective_station == "KITCHEN":
            kitchen_subq = (
                select(OrderItem.order_id)
                .join(Order, OrderItem.order_id == Order.id)
                .where(
                    Order.restaurant_id == target_rest_id,
                    OrderItem.target_destination == "KITCHEN"
                )
                .scalar_subquery()
            )
            query = query.where(or_(Order.id.in_(kitchen_subq), Order.kitchen_status.isnot(None)))
            if active_only:
                query = query.where(
                    Order.kitchen_status.in_(["PENDING", "PREPARING", "READY"]),
                    Order.status.notin_(["COMPLETED", "DELIVERED", "CANCELLED"])
                )

        elif active_only:
            query_sess = select(TableSession.id).where(
                (TableSession.restaurant_id == target_rest_id) &
                (TableSession.status != "CLOSED")
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
        return [format_order_response(o, station=effective_station) for o in orders]
    except HTTPException:
        raise
    except Exception as e:
        print("[ORDER_FETCH_EXCEPT]:", e)
        return []


@router.put("/{order_id}/status")
@router.patch("/{order_id}/status")
async def update_order_status(
    order_id: str,
    payload: UpdateOrderStatusSchema,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    if not caller.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to update order status"
        )

    query = select(Order).where(Order.id == order_id)
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

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
        elif caller.role in ["RUNNER", "EVENT_RUNNER", "WAITER", "SERVER", "HOST", "CHEF", "COOK", "KITCHEN", "BAR", "BARTENDER", "HOOKAH", "SHISHA", "MANAGER", "EVENT_STAFF", "EVENT_MANAGER", "STAFF"]:
            if caller.restaurant_id and caller.restaurant_id != order.restaurant_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Staff member does not belong to this restaurant")
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Role not authorized to update order status")

    # Authoritative terminal enablement enforcement
    if payload.kitchenStatus and (r_obj.has_kitchen is False or (r_obj.enabled_modules and "kitchen" not in r_obj.enabled_modules)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Kitchen terminal is disabled for this restaurant.")
    if payload.barStatus and (r_obj.has_bar is False or (r_obj.enabled_modules and "bar" not in r_obj.enabled_modules)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bar terminal is disabled for this restaurant.")
    if payload.hookahStatus and (getattr(r_obj, "has_hookah", True) is False or (r_obj.enabled_modules and "hookah" not in r_obj.enabled_modules)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Hookah terminal is disabled for this restaurant.")

    target_status = (payload.status or "").upper()
    target_kitchen = (payload.kitchenStatus or "").upper()
    target_bar = (payload.barStatus or "").upper()
    target_hookah = (payload.hookahStatus or "").upper()
    caller_role = (caller.role or "").upper()

    # Kitchen, Bar, and Hookah cannot deliver overall orders to tables (waiter / event delivery responsibility)
    is_delivery_attempt = (
        target_status in ["DELIVERED", "COMPLETED", "OUT_FOR_DELIVERY"]
        or target_kitchen in ["DELIVERED", "COMPLETED"]
        or target_hookah in ["DELIVERED", "COMPLETED"]
        or (payload.deliveryStatus in ["DELIVERED", "OUT_FOR_DELIVERY", "CLAIMED"])
    )
    if is_delivery_attempt and not target_bar and not target_hookah:
        allowed_delivery_roles = ["RUNNER", "EVENT_RUNNER", "WAITER", "SERVER", "OWNER", "RESTAURANT_OWNER", "MANAGER", "EVENT_STAFF", "EVENT_MANAGER", "STAFF"]
        if not caller.is_admin and caller_role not in allowed_delivery_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Station staff / Kitchen staff cannot deliver orders to tables. Staff role '{caller_role}' is not authorized to deliver. Only Runner, Waiter, and Manager roles own delivery."
            )

    # Safe duplicate/stale claim protection
    if payload.deliveryStatus == "CLAIMED" and order.delivery_status in ["CLAIMED", "OUT_FOR_DELIVERY", "DELIVERED"]:
        if order.claimed_by and payload.claimedBy and order.claimed_by.strip().lower() != payload.claimedBy.strip().lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Order is already claimed by {order.claimed_by}."
            )

    # Delivery claiming and dispatch
    if payload.claimedBy is not None:
        order.claimed_by = payload.claimedBy
    if payload.deliveryStatus is not None:
        order.delivery_status = payload.deliveryStatus
        if payload.deliveryStatus in ["DELIVERED", "COMPLETED"]:
            order.delivered_at = datetime.now(timezone.utc)

    # Determine station items in order authoritatively from items and station statuses
    has_k_items = False
    has_b_items = False
    has_h_items = False
    if order.items_json:
        for it in order.items_json:
            st = resolve_item_station(it)
            if st == "HOOKAH":
                has_h_items = True
            elif st == "BAR":
                has_b_items = True
            elif st == "KITCHEN":
                has_k_items = True
    else:
        has_k_items = (order.kitchen_status is not None)
        has_b_items = (order.bar_status is not None)
        has_h_items = (order.hookah_status is not None)

    # Station-specific mutation role authorization
    if payload.hookahStatus:
        allowed_hookah_roles = [
            "HOOKAH", "SHISHA", "HOOKAH_STAFF", "SHISHA_STAFF", "MANAGER", "OWNER", "RESTAURANT_OWNER", "ADMIN", "SUPER_ADMIN",
            "EVENT_COORDINATOR", "EVENT_STAFF", "EVENT_MANAGER", "EVENT_RUNNER", "STAFF"
        ]
        if payload.hookahStatus in ["COMPLETED", "DELIVERED", "SERVED"]:
            allowed_hookah_roles.extend(["WAITER", "SERVER", "RUNNER"])
        if not caller.is_admin and caller_role not in allowed_hookah_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Staff role '{caller_role}' is not authorized to update Hookah status. Only Hookah staff and managers can update Hookah station."
            )
        order.hookah_status = payload.hookahStatus

    if payload.barStatus:
        allowed_bar_roles = [
            "BAR", "BARTENDER", "MANAGER", "OWNER", "RESTAURANT_OWNER", "ADMIN", "SUPER_ADMIN",
            "EVENT_COORDINATOR", "EVENT_STAFF", "EVENT_MANAGER", "EVENT_RUNNER", "STAFF"
        ]
        if payload.barStatus in ["COMPLETED", "DELIVERED", "SERVED"]:
            allowed_bar_roles.extend(["WAITER", "SERVER", "RUNNER"])
        if not caller.is_admin and caller_role not in allowed_bar_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Staff role '{caller_role}' is not authorized to update Bar status. Only Bar staff and managers can update Bar station."
            )
        order.bar_status = payload.barStatus

    eff_kitchen_status = payload.kitchenStatus
    if eff_kitchen_status is None and target_status in ["READY", "PREPARING", "ACCEPTED"] and has_k_items:
        eff_kitchen_status = target_status

    if eff_kitchen_status:
        allowed_kitchen_roles = [
            "KITCHEN", "CHEF", "COOK", "MANAGER", "OWNER", "RESTAURANT_OWNER", "ADMIN", "SUPER_ADMIN",
            "EVENT_COORDINATOR", "EVENT_STAFF", "EVENT_MANAGER", "EVENT_RUNNER", "STAFF"
        ]
        if eff_kitchen_status in ["COMPLETED", "DELIVERED", "SERVED"]:
            allowed_kitchen_roles.extend(["WAITER", "SERVER", "RUNNER"])
        if not caller.is_admin and caller_role not in allowed_kitchen_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Staff role '{caller_role}' is not authorized to update Kitchen status. Only Kitchen staff and managers can update Kitchen station."
            )
        order.kitchen_status = eff_kitchen_status

    # Reconcile overall status:
    # Terminal delivery/cancellation lifecycle:
    if target_status in ["DELIVERED", "COMPLETED", "SERVED", "OUT_FOR_DELIVERY", "CANCELLED"] and caller_role in ["WAITER", "SERVER", "OWNER", "RESTAURANT_OWNER", "MANAGER", "EVENT_STAFF", "EVENT_MANAGER", "EVENT_RUNNER", "RUNNER", "STAFF"]:
        order.status = target_status
        if target_status in ["DELIVERED", "COMPLETED", "SERVED"]:
            order.delivered_at = datetime.now(timezone.utc)
            order.delivery_status = "DELIVERED"
            if order.kitchen_status in ["PENDING", "ACCEPTED", "PREPARING", "READY"]:
                order.kitchen_status = "COMPLETED"
            if order.bar_status in ["PENDING", "ACCEPTED", "PREPARING", "READY"]:
                order.bar_status = "COMPLETED"
            if order.hookah_status in ["PENDING", "ACCEPTED", "PREPARING", "READY"]:
                order.hookah_status = "COMPLETED"
        elif target_status == "OUT_FOR_DELIVERY":
            order.delivery_status = "OUT_FOR_DELIVERY"
    else:
        k_comp = (not has_k_items) or (order.kitchen_status in ["COMPLETED", "DELIVERED", "SERVED"])
        b_comp = (not has_b_items) or (order.bar_status in ["COMPLETED", "DELIVERED", "SERVED"])
        h_comp = (not has_h_items) or (order.hookah_status in ["COMPLETED", "DELIVERED", "SERVED"])

        k_ready = (not has_k_items) or (order.kitchen_status in ["READY", "COMPLETED", "DELIVERED", "SERVED"])
        b_ready = (not has_b_items) or (order.bar_status in ["READY", "COMPLETED", "DELIVERED", "SERVED"])
        h_ready = (not has_h_items) or (order.hookah_status in ["READY", "COMPLETED", "DELIVERED", "SERVED"])

        if k_comp and b_comp and h_comp:
            order.status = "COMPLETED"
        elif k_ready and b_ready and h_ready:
            order.status = "READY"
        elif (has_k_items and order.kitchen_status in ["PREPARING", "READY"]) or (has_b_items and order.bar_status in ["PREPARING", "READY"]) or (has_h_items and order.hookah_status in ["PREPARING", "READY"]):
            order.status = "PREPARING"
        elif (has_k_items and order.kitchen_status == "ACCEPTED") or (has_b_items and order.bar_status == "ACCEPTED") or (has_h_items and order.hookah_status == "ACCEPTED") or target_status == "ACCEPTED":
            order.status = "ACCEPTED"
        elif target_status and target_status not in ["READY", "COMPLETED"]:
            order.status = target_status

    is_evt_order = (
        getattr(order, "order_type", "") in ["EVENT_ORDER", "WEDDING_EVENT"]
        or getattr(order, "event_id", None) is not None
    )

    # Optional ETA handling: Staff may set an ETA, but it must not be mandatory.
    # When staff do not set an ETA, do not invent a default completion time.
    if payload.estimatedPrepTimeMinutes is not None and not is_evt_order:
        order.estimated_prep_time_minutes = max(1, payload.estimatedPrepTimeMinutes)
        order.eta_target_timestamp = datetime.now(timezone.utc) + timedelta(minutes=order.estimated_prep_time_minutes)
    elif payload.etaTargetTimestamp is not None:
        try:
            dt_val = datetime.fromisoformat(payload.etaTargetTimestamp.replace("Z", "+00:00"))
            order.eta_target_timestamp = dt_val
        except Exception:
            pass

    if payload.paymentStatus:
        order.payment_status = payload.paymentStatus.upper()
    if payload.paymentMethod:
        order.payment_method = payload.paymentMethod.upper()

    await db.commit()
    print(f"[ORDER_STATUS_UPDATED] order_id={order_id} status={order.status} kitchen_status={order.kitchen_status} bar_status={order.bar_status} hookah_status={order.hookah_status} payment_status={order.payment_status}")
    await db.refresh(order)
    resp_data = format_order_response(order)

    try:
        from app.modules.websocket.manager import ws_manager
        if payload.barStatus:
            await ws_manager.broadcast_event(
                restaurant_id=order.restaurant_id,
                event_type="BarStatusUpdated",
                payload={
                    **resp_data,
                    "orderId": order.id,
                    "order_id": order.id,
                    "barStatus": order.bar_status,
                    "data": resp_data
                },
                target_audience=["BAR", "WAITER", "OWNER", "CUSTOMER"]
            )
        if payload.hookahStatus:
            await ws_manager.broadcast_event(
                restaurant_id=order.restaurant_id,
                event_type="HookahStatusUpdated",
                payload={
                    **resp_data,
                    "orderId": order.id,
                    "order_id": order.id,
                    "hookahStatus": order.hookah_status,
                    "data": resp_data
                },
                target_audience=["HOOKAH", "WAITER", "OWNER", "CUSTOMER"]
            )
        if payload.kitchenStatus:
            await ws_manager.broadcast_event(
                restaurant_id=order.restaurant_id,
                event_type="KitchenStatusUpdated",
                payload={
                    **resp_data,
                    "orderId": order.id,
                    "order_id": order.id,
                    "kitchenStatus": order.kitchen_status,
                    "data": resp_data
                },
                target_audience=["KITCHEN", "WAITER", "OWNER", "CUSTOMER"]
            )

        if order.status == "READY":
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
        if order.status == "DELIVERED":
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
            target_audience=["KITCHEN", "BAR", "HOOKAH", "WAITER", "CUSTOMER", "OWNER"]
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
        if caller.role in ["WAITER", "SERVER", "HOST", "CHEF", "COOK", "KITCHEN", "BAR", "BARTENDER", "HOOKAH", "SHISHA", "MANAGER"]:
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

@router.get("/restaurants/{restaurant_id}/orders/lookup-code/{code}")
@router.get("/lookup-code/{code}")
async def lookup_order_by_pickup_code(
    code: str,
    restaurant_id: Optional[str] = None,
    restaurantId: Optional[str] = Query(None),
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    target_rest_id = restaurant_id or restaurantId
    clean_code = (code or "").strip().upper()
    stripped_code = clean_code.lstrip("#")

    if not clean_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pickup code is required")

    digits_only = "".join(filter(str.isdigit, clean_code))
    match_conditions = [
        func.upper(Order.pickup_code) == clean_code,
        func.upper(Order.pickup_code) == stripped_code,
        func.upper(Order.pickup_code) == f"#{stripped_code}",
        func.upper(Order.pickup_code) == f"C-{stripped_code}",
        func.upper(Order.pickup_code) == f"C{stripped_code}",
        func.upper(Order.order_number) == clean_code,
        func.upper(Order.order_number) == stripped_code,
        func.upper(Order.order_number) == f"#{stripped_code}",
        func.upper(Order.order_number) == f"#ORD-{stripped_code}",
        Order.id == code.strip()
    ]
    if digits_only:
        match_conditions.extend([
            func.upper(Order.pickup_code) == f"C{digits_only.zfill(4)}",
            func.upper(Order.pickup_code) == f"C-{digits_only.zfill(3)}",
            func.upper(Order.pickup_code) == f"C{digits_only}",
            func.upper(Order.order_number) == f"#ORD-{int(digits_only)}",
        ])

    stmt = select(Order).where(or_(*match_conditions))

    actual_rid = None
    if target_rest_id:
        res_rest = await db.execute(select(Restaurant).where(
            or_(
                Restaurant.id == target_rest_id,
                Restaurant.slug == target_rest_id.lower(),
                Restaurant.public_slug == target_rest_id.lower()
            )
        ))
        r_obj = res_rest.scalar_one_or_none()
        actual_rid = r_obj.id if r_obj else target_rest_id
        stmt = stmt.where(Order.restaurant_id == actual_rid)

    res = await db.execute(stmt.order_by(Order.created_at.desc()))
    order = res.scalars().first()

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No order found matching code '{code}'")

    if actual_rid and order.restaurant_id != actual_rid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pickup code belongs to another business.")

    return format_order_response(order)


@router.post("/restaurants/{restaurant_id}/orders/redeem-code")
@router.post("/redeem-code")
async def redeem_pickup_code(
    payload: RedeemPickupCodeSchema,
    restaurant_id: Optional[str] = None,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    target_rest_id = restaurant_id or payload.restaurantId
    clean_code = (payload.code or "").strip().upper()
    stripped_code = clean_code.lstrip("#")

    if not clean_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pickup code is required")

    digits_only = "".join(filter(str.isdigit, clean_code))
    match_conditions = [
        func.upper(Order.pickup_code) == clean_code,
        func.upper(Order.pickup_code) == stripped_code,
        func.upper(Order.pickup_code) == f"#{stripped_code}",
        func.upper(Order.pickup_code) == f"C-{stripped_code}",
        func.upper(Order.pickup_code) == f"C{stripped_code}",
        func.upper(Order.order_number) == clean_code,
        func.upper(Order.order_number) == stripped_code,
        func.upper(Order.order_number) == f"#{stripped_code}",
        func.upper(Order.order_number) == f"#ORD-{stripped_code}",
        Order.id == payload.code.strip()
    ]
    if digits_only:
        match_conditions.extend([
            func.upper(Order.pickup_code) == f"C{digits_only.zfill(4)}",
            func.upper(Order.pickup_code) == f"C-{digits_only.zfill(3)}",
            func.upper(Order.pickup_code) == f"C{digits_only}",
            func.upper(Order.order_number) == f"#ORD-{int(digits_only)}",
        ])

    stmt = select(Order).where(or_(*match_conditions))

    actual_rid = None
    if target_rest_id:
        res_rest = await db.execute(select(Restaurant).where(
            or_(
                Restaurant.id == target_rest_id,
                Restaurant.slug == target_rest_id.lower(),
                Restaurant.public_slug == target_rest_id.lower()
            )
        ))
        r_obj = res_rest.scalar_one_or_none()
        actual_rid = r_obj.id if r_obj else target_rest_id
        stmt = stmt.where(Order.restaurant_id == actual_rid)

    res = await db.execute(stmt.order_by(Order.created_at.desc()))
    order = res.scalars().first()

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No order found matching code '{payload.code}'")

    if actual_rid and order.restaurant_id != actual_rid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot redeem pickup code for another business.")

    if getattr(order, "pickup_status", None) == "REDEEMED":
        claimed_str = str(order.claimed_at) if order.claimed_at else "earlier"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Pickup coupon '{payload.code}' has already been redeemed on {claimed_str}."
        )

    if order.status == "CANCELLED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order '{payload.code}' was CANCELLED and cannot be redeemed."
        )

    if order.status in ["PENDING", "ACCEPTED", "PREPARING"] and not payload.force:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order '{payload.code}' is currently {order.status} and not yet Ready for pickup."
        )

    now_utc = datetime.now(timezone.utc)
    order.pickup_status = "REDEEMED"
    order.claimed_at = now_utc
    order.claimed_by = payload.redeemedBy or "Counter Staff"
    order.status = "COMPLETED"

    await db.commit()
    await db.refresh(order)

    resp_data = format_order_response(order)

    try:
        from app.modules.websocket.manager import ws_manager
        await ws_manager.broadcast_event(
            restaurant_id=order.restaurant_id,
            event_type="order_redeemed",
            payload={
                "orderId": order.id,
                "pickupCode": order.pickup_code,
                "pickupStatus": "REDEEMED",
                "claimedAt": now_utc.isoformat(),
                "claimedBy": order.claimed_by,
                "status": "COMPLETED",
                "data": resp_data,
            },
            target_audience=["CUSTOMER", "OWNER", "KITCHEN", "WAITER"]
        )
    except Exception as ws_err:
        print("[WS_BROADCAST_REDEEM_NOTICE]:", ws_err)

    return resp_data


@router.get("/{order_id}")
async def get_order_by_id(
    order_id: str,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    query = select(Order).where(
        or_(
            Order.id == order_id,
            Order.pickup_code == order_id,
            Order.pickup_code == f"#{order_id}",
            Order.pickup_code == order_id.upper(),
            Order.order_number == order_id,
        )
    )
    result = await db.execute(query)
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    is_staff = caller.is_authenticated and (caller.role in ["OWNER", "RESTAURANT_OWNER", "WAITER", "CHEF", "BAR", "HOOKAH", "SHISHA", "MANAGER", "ADMIN"])
    is_event = bool(order.event_id) or (order.order_type in ["EVENT_ORDER", "WEDDING_EVENT"])
    hide_fin = is_event and not is_staff
    return format_order_response(order, hide_financials=hide_fin)



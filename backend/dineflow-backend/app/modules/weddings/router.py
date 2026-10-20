import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_

from app.core.database.connection import get_db
from app.core.security.tenant_auth import (
    get_caller_context,
    CallerContext,
    require_tenant_staff_or_owner,
    require_tenant_owner_or_admin,
    require_tenant_event_manager,
)
from app.modules.restaurants.models import Restaurant
from app.modules.weddings.models import WeddingEvent, EventTable, EventAssistanceRequest
from app.modules.orders.models import Order
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.websocket.manager import ws_manager

router = APIRouter()
public_router = APIRouter()

from app.modules.weddings.service_period import (
    calculate_event_service_window,
    get_authoritative_event_status,
    format_service_duration,
)

def _format_event(event: WeddingEvent, table_count: int = 0, order_count: int = 0, total_revenue: float = 0.0) -> dict:
    created_str = event.created_at.isoformat() if event.created_at else None
    updated_str = event.updated_at.isoformat() if event.updated_at else None
    now_utc = datetime.now(timezone.utc)
    auth_status = get_authoritative_event_status(event, now_utc)
    duration_fmt = format_service_duration(event.start_datetime_utc, event.end_datetime_utc) if (event.start_datetime_utc and event.end_datetime_utc) else None
    is_active_window = (auth_status == "ACTIVE")

    return {
        "id": event.id,
        "restaurantId": event.restaurant_id,
        "workspaceId": event.workspace_id,
        "organizerEmail": event.organizer_email,
        "title": event.title,
        "coupleNames": event.couple_names or "",
        "eventType": event.event_type or "WEDDING",
        "eventDate": event.event_date,
        "endDate": event.end_date or event.event_date,
        "startTime": event.start_time or "18:00",
        "endTime": event.end_time or "23:30",
        "timezone": event.timezone or "Asia/Kolkata",
        "serviceDays": event.service_days or 1,
        "startDatetimeUtc": event.start_datetime_utc.isoformat() if event.start_datetime_utc else None,
        "endDatetimeUtc": event.end_datetime_utc.isoformat() if event.end_datetime_utc else None,
        "durationFormatted": duration_fmt,
        "venueName": event.venue_name or "",
        "welcomeMessage": event.welcome_message or "",
        "themeColor": event.theme_color or "champagne",
        "coverImageUrl": event.cover_image_url or "",
        "status": auth_status,
        "rawStatus": event.status or "DRAFT",
        "isOrderingOpen": bool(event.is_ordering_open and auth_status == "ACTIVE"),
        "isServiceActive": is_active_window,
        "hasFood": getattr(event, "has_food", True) if getattr(event, "has_food", None) is not None else True,
        "hasBar": getattr(event, "has_bar", False) if getattr(event, "has_bar", None) is not None else False,
        "hasHookah": getattr(event, "has_hookah", False) if getattr(event, "has_hookah", None) is not None else False,
        "hasTableAssistance": getattr(event, "has_table_assistance", True) if getattr(event, "has_table_assistance", None) is not None else True,
        "alcoholPolicyNotes": getattr(event, "alcohol_policy_notes", None),
        "autoActivate": getattr(event, "auto_activate", True) if getattr(event, "auto_activate", None) is not None else True,
        "menuSelectionType": event.menu_selection_type or "FULL_MENU",
        "allowedCategoryIds": event.allowed_category_ids or [],
        "allowedItemIds": event.allowed_item_ids or [],
        "estimatedGuestCount": event.estimated_guest_count or 100,
        "notes": event.notes or "",
        "extendedAt": event.extended_at.isoformat() if getattr(event, "extended_at", None) else None,
        "extendedBy": getattr(event, "extended_by", None),
        "extendedReason": getattr(event, "extended_reason", None),
        "tableCount": table_count,
        "orderCount": order_count,
        "totalRevenue": round(total_revenue, 2),
        "createdAt": created_str,
        "updatedAt": updated_str,
    }

def _format_table(table: EventTable) -> dict:
    return {
        "id": table.id,
        "eventId": table.event_id,
        "restaurantId": table.restaurant_id,
        "tableNumber": table.table_number,
        "tableLabel": table.table_label or f"Table {table.table_number}",
        "capacity": table.capacity or 8,
        "qrCodeUrl": table.qr_code_url or "",
        "isActive": table.is_active,
    }

def _generate_event_qr_url(slug: str, event_id: str, table_number: str) -> str:
    clean_slug = (slug or "").strip().lower()
    clean_table = str(table_number or "").strip()
    if clean_slug:
        return f"https://{clean_slug}.dinely.food/event/{event_id}/table/{clean_table}"
    return f"https://dinely.food/event/{event_id}/table/{clean_table}"

def _format_assistance_request(req: EventAssistanceRequest) -> dict:
    created_str = req.created_at.isoformat() if req.created_at else None
    updated_str = req.updated_at.isoformat() if req.updated_at else None
    return {
        "id": req.id,
        "eventId": req.event_id,
        "restaurantId": req.restaurant_id,
        "tableNumber": req.table_number,
        "tableId": req.table_id,
        "items": req.request_items or [],
        "requestItems": req.request_items or [],
        "guestName": req.guest_name or "",
        "guestNote": req.guest_note or "",
        "status": req.status,
        "assignedStaffName": req.assigned_staff_name,
        "assignedStaffUid": req.assigned_staff_uid,
        "acknowledgedAt": req.acknowledged_at.isoformat() if req.acknowledged_at else None,
        "inProgressAt": req.in_progress_at.isoformat() if req.in_progress_at else None,
        "completedAt": req.completed_at.isoformat() if req.completed_at else None,
        "idempotencyKey": req.idempotency_key,
        "createdAt": created_str,
        "updatedAt": updated_str,
    }

def _format_public_assistance_request(req: EventAssistanceRequest) -> dict:
    """Sanitized public assistance representation. Strips internal staff database UID."""
    data = _format_assistance_request(req)
    data.pop("assignedStaffUid", None)
    return data

class CreateWeddingEventSchema(BaseModel):
    title: str
    coupleNames: Optional[str] = ""
    eventType: Optional[str] = "WEDDING"
    eventDate: str
    endDate: Optional[str] = None
    startTime: Optional[str] = "18:00"
    endTime: Optional[str] = "23:30"
    timezone: Optional[str] = "Asia/Kolkata"
    serviceDays: Optional[int] = 1
    autoActivate: Optional[bool] = True
    venueName: Optional[str] = ""
    welcomeMessage: Optional[str] = ""
    themeColor: Optional[str] = "champagne"
    coverImageUrl: Optional[str] = ""
    status: Optional[str] = "DRAFT"
    isOrderingOpen: Optional[bool] = True
    hasFood: Optional[bool] = True
    hasBar: Optional[bool] = False
    hasHookah: Optional[bool] = False
    hasTableAssistance: Optional[bool] = True
    alcoholPolicyNotes: Optional[str] = None
    menuSelectionType: Optional[str] = "FULL_MENU"
    allowedCategoryIds: Optional[List[str]] = None
    allowedItemIds: Optional[List[str]] = None
    estimatedGuestCount: Optional[int] = 100
    notes: Optional[str] = ""
    tableCount: Optional[int] = 10
    tables: Optional[List[Dict[str, Any]]] = None

class UpdateWeddingEventSchema(BaseModel):
    title: Optional[str] = None
    coupleNames: Optional[str] = None
    eventType: Optional[str] = None
    eventDate: Optional[str] = None
    endDate: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    timezone: Optional[str] = None
    serviceDays: Optional[int] = None
    autoActivate: Optional[bool] = None
    venueName: Optional[str] = None
    welcomeMessage: Optional[str] = None
    themeColor: Optional[str] = None
    coverImageUrl: Optional[str] = None
    status: Optional[str] = None
    isOrderingOpen: Optional[bool] = None
    hasFood: Optional[bool] = None
    hasBar: Optional[bool] = None
    hasHookah: Optional[bool] = None
    hasTableAssistance: Optional[bool] = None
    alcoholPolicyNotes: Optional[str] = None
    menuSelectionType: Optional[str] = None
    allowedCategoryIds: Optional[List[str]] = None
    allowedItemIds: Optional[List[str]] = None
    estimatedGuestCount: Optional[int] = None
    notes: Optional[str] = None

class ExtendEventServicePeriodSchema(BaseModel):
    extensionMinutes: Optional[int] = None
    newEndDatetimeUtc: Optional[str] = None
    newEndDate: Optional[str] = None
    newEndTime: Optional[str] = None
    reason: Optional[str] = "Host requested extension"

class CreateEventTableSchema(BaseModel):
    tableNumber: str
    tableLabel: Optional[str] = None
    capacity: Optional[int] = 8

class UpdateEventTableSchema(BaseModel):
    tableNumber: Optional[str] = None
    tableLabel: Optional[str] = None
    capacity: Optional[int] = None
    isActive: Optional[bool] = None

class CreateEventAssistanceSchema(BaseModel):
    tableNumber: Optional[str] = None
    table: Optional[str] = None
    table_number: Optional[str] = None
    tableId: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None
    requestItems: Optional[List[Dict[str, Any]]] = None
    guestName: Optional[str] = None
    guestNote: Optional[str] = None
    notes: Optional[str] = None
    note: Optional[str] = None
    idempotencyKey: Optional[str] = None

class UpdateEventAssistanceStatusSchema(BaseModel):
    status: str
    staffName: Optional[str] = None
    assignedStaffName: Optional[str] = None

# ==========================================
# RESTAURANT OWNER & STAFF EVENT ENDPOINTS
# ==========================================

@router.get("/{restaurant_id}/events")
async def list_restaurant_events(
    restaurant_id: str,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    r_stmt = select(Restaurant).where(Restaurant.id == canonical_id)
    r_res = await db.execute(r_stmt)
    rest = r_res.scalar_one_or_none()
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")

    if rest.enabled_modules and "weddings" not in rest.enabled_modules:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wedding & Event Ordering module is not enabled for this business",
        )

    stmt = select(WeddingEvent).where(WeddingEvent.restaurant_id == canonical_id).order_by(WeddingEvent.event_date.desc(), WeddingEvent.created_at.desc())
    res = await db.execute(stmt)
    events = res.scalars().all()

    result = []
    for ev in events:
        # Table count
        t_stmt = select(func.count(EventTable.id)).where(EventTable.event_id == ev.id, EventTable.is_active.is_(True))
        t_res = await db.execute(t_stmt)
        t_count = t_res.scalar() or 0

        # Orders stats
        o_stmt = select(func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0.0)).where(Order.event_id == ev.id)
        o_res = await db.execute(o_stmt)
        o_row = o_res.first()
        ord_count = o_row[0] if o_row else 0
        tot_rev = float(o_row[1]) if o_row else 0.0

        result.append(_format_event(ev, table_count=t_count, order_count=ord_count, total_revenue=tot_rev))

    return result

@router.post("/{restaurant_id}/events", status_code=status.HTTP_201_CREATED)
async def create_wedding_event(
    restaurant_id: str,
    payload: CreateWeddingEventSchema,
    caller: CallerContext = Depends(require_tenant_event_manager),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    r_stmt = select(Restaurant).where(Restaurant.id == canonical_id)
    r_res = await db.execute(r_stmt)
    rest = r_res.scalar_one_or_none()
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")

    if rest.enabled_modules and "weddings" not in rest.enabled_modules:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wedding & Event Ordering module is not enabled for this business",
        )
    if rest.is_approved is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Restaurant is pending platform approval",
        )

    slug = rest.public_slug or rest.slug or rest.id
    now_utc = datetime.now(timezone.utc)
    event_id = f"evt-{uuid.uuid4().hex[:10]}"

    start_dt_utc, end_dt_utc, eff_end_date, eff_days, duration_str, summary_str = calculate_event_service_window(
        start_date_str=payload.eventDate.strip(),
        start_time_str=payload.startTime or "18:00",
        end_date_str=payload.endDate.strip() if payload.endDate else None,
        end_time_str=payload.endTime or "23:30",
        service_days=payload.serviceDays or 1,
        tz_name=payload.timezone or "Asia/Kolkata",
    )

    is_auto = payload.autoActivate if payload.autoActivate is not None else True
    req_status = (payload.status or "DRAFT").strip().upper()
    if req_status in ("DRAFT", "PENDING_APPROVAL", "APPROVED_SETUP_PENDING"):
        eff_status = req_status
    elif end_dt_utc and now_utc > end_dt_utc:
        eff_status = "CLOSED"
    elif req_status == "SCHEDULED" or (is_auto and start_dt_utc and now_utc < start_dt_utc and req_status != "ACTIVE"):
        eff_status = "SCHEDULED"
    else:
        eff_status = req_status or "ACTIVE"

    has_bar_val = bool(payload.hasBar) if payload.hasBar is not None else False
    if has_bar_val and getattr(rest, "has_bar", True) is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot enable Alcohol & Bar service: Venue lacks bar authorization.",
        )
    has_hookah_val = bool(payload.hasHookah) if payload.hasHookah is not None else False
    if has_hookah_val and getattr(rest, "has_hookah", True) is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot enable Hookah/Shisha service: Venue lacks hookah lounge authorization.",
        )

    new_event = WeddingEvent(
        id=event_id,
        restaurant_id=canonical_id,
        title=payload.title.strip(),
        couple_names=payload.coupleNames.strip() if payload.coupleNames else None,
        event_type=(payload.eventType or "WEDDING").strip().upper(),
        event_date=payload.eventDate.strip(),
        end_date=eff_end_date,
        start_time=payload.startTime or "18:00",
        end_time=payload.endTime or "23:30",
        timezone=payload.timezone or "Asia/Kolkata",
        service_days=eff_days,
        start_datetime_utc=start_dt_utc,
        end_datetime_utc=end_dt_utc,
        auto_activate=is_auto,
        venue_name=payload.venueName or rest.name,
        welcome_message=payload.welcomeMessage or f"Welcome to our celebration! We are honored to celebrate with you.",
        theme_color=payload.themeColor or "champagne",
        cover_image_url=payload.coverImageUrl or None,
        status=eff_status,
        is_ordering_open=payload.isOrderingOpen if payload.isOrderingOpen is not None else True,
        has_food=payload.hasFood if payload.hasFood is not None else True,
        has_bar=has_bar_val,
        has_hookah=has_hookah_val,
        has_table_assistance=payload.hasTableAssistance if payload.hasTableAssistance is not None else True,
        alcohol_policy_notes=payload.alcoholPolicyNotes,
        menu_selection_type=payload.menuSelectionType or "FULL_MENU",
        allowed_category_ids=payload.allowedCategoryIds or [],
        allowed_item_ids=payload.allowedItemIds or [],
        estimated_guest_count=payload.estimatedGuestCount or 100,
        notes=payload.notes or "",
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(new_event)
    await db.flush()

    # Initialize tables
    initial_tables = []
    if payload.tables and len(payload.tables) > 0:
        for t_spec in payload.tables:
            t_num = str(t_spec.get("tableNumber") or t_spec.get("number") or "01").strip()
            t_lbl = t_spec.get("tableLabel") or f"Table {t_num}"
            t_cap = int(t_spec.get("capacity") or 8)
            initial_tables.append((t_num, t_lbl, t_cap))
    else:
        count = max(1, min(payload.tableCount or 10, 100))
        for idx in range(1, count + 1):
            padded = str(idx).zfill(2)
            initial_tables.append((padded, f"Table {padded}", 8))

    created_tables = []
    for t_num, t_lbl, t_cap in initial_tables:
        t_id = f"etbl-{event_id}-{t_num.lower().replace(' ', '_')}"
        qr_url = _generate_event_qr_url(slug, event_id, t_num)
        et = EventTable(
            id=t_id,
            event_id=event_id,
            restaurant_id=canonical_id,
            table_number=t_num,
            table_label=t_lbl,
            capacity=t_cap,
            qr_code_url=qr_url,
            is_active=True,
            created_at=now_utc,
            updated_at=now_utc,
        )
        db.add(et)
        created_tables.append(et)

    await db.commit()
    await db.refresh(new_event)

    resp = _format_event(new_event, table_count=len(created_tables))
    resp["tables"] = [_format_table(t) for t in created_tables]
    return resp

@router.get("/{restaurant_id}/events/{event_id}")
async def get_wedding_event(
    restaurant_id: str,
    event_id: str,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(WeddingEvent).where(WeddingEvent.id == event_id, WeddingEvent.restaurant_id == canonical_id)
    res = await db.execute(stmt)
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    t_stmt = select(EventTable).where(EventTable.event_id == ev.id).order_by(EventTable.table_number.asc())
    t_res = await db.execute(t_stmt)
    tables = t_res.scalars().all()

    o_stmt = select(func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0.0)).where(Order.event_id == ev.id)
    o_res = await db.execute(o_stmt)
    o_row = o_res.first()
    ord_count = o_row[0] if o_row else 0
    tot_rev = float(o_row[1]) if o_row else 0.0

    resp = _format_event(ev, table_count=len(tables), order_count=ord_count, total_revenue=tot_rev)
    resp["tables"] = [_format_table(t) for t in tables]
    return resp

@router.put("/{restaurant_id}/events/{event_id}")
async def update_wedding_event(
    restaurant_id: str,
    event_id: str,
    payload: UpdateWeddingEventSchema,
    caller: CallerContext = Depends(require_tenant_event_manager),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(WeddingEvent).where(WeddingEvent.id == event_id, WeddingEvent.restaurant_id == canonical_id)
    res = await db.execute(stmt)
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    r_stmt = select(Restaurant).where(Restaurant.id == canonical_id)
    r_res = await db.execute(r_stmt)
    rest = r_res.scalar_one_or_none()

    if payload.title is not None:
        ev.title = payload.title.strip()
    if payload.coupleNames is not None:
        ev.couple_names = payload.coupleNames.strip()
    if payload.eventType is not None:
        ev.event_type = payload.eventType.strip().upper()
    if payload.eventDate is not None:
        ev.event_date = payload.eventDate.strip()
    if payload.endDate is not None:
        ev.end_date = payload.endDate.strip()
    if payload.startTime is not None:
        ev.start_time = payload.startTime.strip()
    if payload.endTime is not None:
        ev.end_time = payload.endTime.strip()
    if payload.timezone is not None:
        ev.timezone = payload.timezone.strip()
    if payload.serviceDays is not None:
        ev.service_days = payload.serviceDays
    if payload.autoActivate is not None:
        ev.auto_activate = payload.autoActivate

    # Recalculate service window if date/time/tz changed
    if any(x is not None for x in (payload.eventDate, payload.endDate, payload.startTime, payload.endTime, payload.timezone, payload.serviceDays)):
        start_dt_utc, end_dt_utc, eff_end_date, eff_days, duration_str, summary_str = calculate_event_service_window(
            start_date_str=ev.event_date,
            start_time_str=ev.start_time or "18:00",
            end_date_str=ev.end_date,
            end_time_str=ev.end_time or "23:30",
            service_days=ev.service_days or 1,
            tz_name=ev.timezone or "Asia/Kolkata",
        )
        ev.start_datetime_utc = start_dt_utc
        ev.end_datetime_utc = end_dt_utc
        ev.end_date = eff_end_date
        ev.service_days = eff_days

    if payload.venueName is not None:
        ev.venue_name = payload.venueName.strip()
    if payload.welcomeMessage is not None:
        ev.welcome_message = payload.welcomeMessage.strip()
    if payload.themeColor is not None:
        ev.theme_color = payload.themeColor.strip()
    if payload.coverImageUrl is not None:
        ev.cover_image_url = payload.coverImageUrl.strip() or None
    if payload.status is not None:
        ev.status = payload.status.strip().upper()
    if payload.isOrderingOpen is not None:
        ev.is_ordering_open = payload.isOrderingOpen
        if payload.status is None:
            ev.status = "ACTIVE" if payload.isOrderingOpen else "PAUSED"
    if payload.menuSelectionType is not None:
        ev.menu_selection_type = payload.menuSelectionType
    if payload.allowedCategoryIds is not None:
        ev.allowed_category_ids = payload.allowedCategoryIds
    if payload.allowedItemIds is not None:
        ev.allowed_item_ids = payload.allowedItemIds
    if payload.estimatedGuestCount is not None:
        ev.estimated_guest_count = payload.estimatedGuestCount
    if payload.hasBar is not None:
        if payload.hasBar and getattr(rest, "has_bar", True) is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot enable Alcohol & Bar service: Venue lacks bar authorization."
            )
        ev.has_bar = bool(payload.hasBar)
    if payload.hasHookah is not None:
        if payload.hasHookah and getattr(rest, "has_hookah", True) is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot enable Hookah/Shisha service: Venue lacks hookah lounge authorization."
            )
        ev.has_hookah = bool(payload.hasHookah)
    if payload.hasFood is not None:
        ev.has_food = bool(payload.hasFood)
    if payload.hasTableAssistance is not None:
        ev.has_table_assistance = bool(payload.hasTableAssistance)
    if payload.alcoholPolicyNotes is not None:
        ev.alcohol_policy_notes = payload.alcoholPolicyNotes
    if payload.notes is not None:
        ev.notes = payload.notes

    ev.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ev)

    t_stmt = select(func.count(EventTable.id)).where(EventTable.event_id == ev.id, EventTable.is_active.is_(True))
    t_res = await db.execute(t_stmt)
    t_count = t_res.scalar() or 0

    return _format_event(ev, table_count=t_count)

@router.post("/{restaurant_id}/events/{event_id}/extend")
async def extend_wedding_event(
    restaurant_id: str,
    event_id: str,
    payload: ExtendEventServicePeriodSchema,
    caller: CallerContext = Depends(require_tenant_event_manager),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(WeddingEvent).where(WeddingEvent.id == event_id, WeddingEvent.restaurant_id == canonical_id)
    res = await db.execute(stmt)
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    from app.modules.weddings.service_period import _ensure_utc
    now_utc = datetime.now(timezone.utc)
    base_end = _ensure_utc(ev.end_datetime_utc) or now_utc
    if base_end < now_utc:
        base_end = now_utc

    if payload.extensionMinutes:
        new_end_utc = base_end + timedelta(minutes=payload.extensionMinutes)
    elif payload.newEndDatetimeUtc:
        try:
            dt = datetime.fromisoformat(payload.newEndDatetimeUtc.replace("Z", "+00:00"))
            new_end_utc = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid newEndDatetimeUtc format")
    elif payload.newEndDate and payload.newEndTime:
        from app.modules.weddings.service_period import _parse_local_datetime_to_utc
        tz_name = ev.timezone or "Asia/Kolkata"
        new_end_utc = _parse_local_datetime_to_utc(payload.newEndDate, payload.newEndTime, tz_name)
    else:
        new_end_utc = base_end + timedelta(minutes=60)

    import zoneinfo
    try:
        zi = zoneinfo.ZoneInfo(ev.timezone or "Asia/Kolkata")
    except Exception:
        zi = timezone.utc
    local_end_dt = new_end_utc.astimezone(zi)
    eff_new_end_date = local_end_dt.strftime("%Y-%m-%d")
    eff_new_end_time = local_end_dt.strftime("%H:%M")

    # Persist audited extension
    ev.original_end_datetime_utc = ev.original_end_datetime_utc or ev.end_datetime_utc
    ev.end_datetime_utc = new_end_utc
    ev.end_date = eff_new_end_date
    ev.end_time = eff_new_end_time
    ev.extended_at = now_utc
    ev.extended_by = caller.email or caller.uid or "authorized_owner"
    ev.extended_reason = payload.reason or "Host requested extension"
    ev.updated_at = now_utc

    # Re-activate ordering if closed or paused
    if ev.status in ("CLOSED", "PAUSED", "COMPLETED"):
        ev.status = "ACTIVE"
    ev.is_ordering_open = True

    await db.commit()
    await db.refresh(ev)

    t_stmt = select(func.count(EventTable.id)).where(EventTable.event_id == ev.id, EventTable.is_active.is_(True))
    t_res = await db.execute(t_stmt)
    t_count = t_res.scalar() or 0

    return _format_event(ev, table_count=t_count)

@router.delete("/{restaurant_id}/events/{event_id}")
async def delete_wedding_event(
    restaurant_id: str,
    event_id: str,
    caller: CallerContext = Depends(require_tenant_event_manager),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(WeddingEvent).where(WeddingEvent.id == event_id, WeddingEvent.restaurant_id == canonical_id)
    res = await db.execute(stmt)
    ev = res.scalar_one_or_none()
    if not ev:
        return {"status": "success", "message": "Event already deleted"}

    await db.delete(ev)
    await db.commit()
    return {"status": "success", "message": f"Event '{ev.title}' deleted successfully"}

@router.post("/{restaurant_id}/events/{event_id}/toggle-ordering")
async def toggle_event_ordering(
    restaurant_id: str,
    event_id: str,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(WeddingEvent).where(WeddingEvent.id == event_id, WeddingEvent.restaurant_id == canonical_id)
    res = await db.execute(stmt)
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Authoritative verification before opening ordering
    if not ev.is_ordering_open:
        t_cnt_res = await db.execute(
            select(func.count(EventTable.id)).where(EventTable.event_id == ev.id, EventTable.is_active.is_(True))
        )
        t_count = t_cnt_res.scalar() or 0
        if t_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot open event ordering: 0 banquet tables are configured. Add at least one table before opening service."
            )

    ev.is_ordering_open = not ev.is_ordering_open
    if ev.is_ordering_open:
        ev.status = "ACTIVE"
    else:
        ev.status = "PAUSED"
    ev.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ev)
    return {"status": "success", "isOrderingOpen": ev.is_ordering_open, "status": ev.status}

@router.get("/{restaurant_id}/events/{event_id}/readiness")
async def get_event_readiness(
    restaurant_id: str,
    event_id: str,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(WeddingEvent).where(WeddingEvent.id == event_id, WeddingEvent.restaurant_id == canonical_id)
    res = await db.execute(stmt)
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    r_stmt = select(Restaurant).where(Restaurant.id == canonical_id)
    r_res = await db.execute(r_stmt)
    rest = r_res.scalar_one_or_none()

    # 1. Tables count & QR codes
    t_stmt = select(EventTable).where(EventTable.event_id == ev.id, EventTable.is_active.is_(True))
    t_res = await db.execute(t_stmt)
    tables = t_res.scalars().all()
    table_count = len(tables)
    qr_count = len([t for t in tables if t.qr_code_url])

    # 2. Available menu items
    m_stmt = select(func.count(MenuItem.id)).where(
        MenuItem.restaurant_id == canonical_id,
        MenuItem.is_available.is_(True),
        MenuItem.deleted_at.is_(None)
    )
    m_res = await db.execute(m_stmt)
    menu_item_count = m_res.scalar() or 0

    # 3. Stations enabled
    stations = []
    if getattr(rest, "has_kitchen", True):
        stations.append("KITCHEN")
    if getattr(rest, "has_bar", True):
        stations.append("BAR")
    if getattr(rest, "has_hookah", True):
        stations.append("HOOKAH")

    # 4. Service window & status
    now_utc = datetime.now(timezone.utc)
    auth_status = get_authoritative_event_status(ev, now_utc)
    duration_fmt = format_service_duration(ev.start_datetime_utc, ev.end_datetime_utc) if (ev.start_datetime_utc and ev.end_datetime_utc) else None
    is_active_window = (auth_status == "ACTIVE")

    # 8-point checklist
    details_ready = bool(ev.title and ev.event_date)
    kitchen_ready = bool(rest and rest.lifecycle_status not in ["SUSPENDED", "ARCHIVED"])
    menu_ready = menu_item_count > 0
    tables_ready = table_count > 0
    qrs_ready = qr_count > 0 and qr_count == table_count
    stations_ready = len(stations) > 0
    window_ready = bool(ev.start_time and ev.end_time and ev.timezone)
    publication_ready = bool(ev.is_ordering_open and auth_status in ["ACTIVE", "SCHEDULED"])

    is_fully_ready = all([
        details_ready,
        kitchen_ready,
        menu_ready,
        tables_ready,
        qrs_ready,
        stations_ready,
        window_ready
    ])

    return {
        "eventId": ev.id,
        "restaurantId": canonical_id,
        "isFullyReady": is_fully_ready,
        "checklist": {
            "eventDetails": {
                "isReady": details_ready,
                "title": ev.title,
                "venueName": ev.venue_name or (rest.name if rest else ""),
                "eventType": ev.event_type or "WEDDING",
            },
            "cateringKitchen": {
                "isReady": kitchen_ready,
                "restaurantId": rest.id if rest else canonical_id,
                "restaurantName": rest.name if rest else "Catering Kitchen",
            },
            "availableMenu": {
                "isReady": menu_ready,
                "itemCount": menu_item_count,
            },
            "eventTables": {
                "isReady": tables_ready,
                "tableCount": table_count,
            },
            "qrCodes": {
                "isReady": qrs_ready,
                "qrCount": qr_count,
            },
            "enabledStations": {
                "isReady": stations_ready,
                "stations": stations,
            },
            "serviceWindow": {
                "isReady": window_ready,
                "startDate": ev.event_date,
                "endDate": ev.end_date or ev.event_date,
                "startTime": ev.start_time,
                "endTime": ev.end_time,
                "timezone": ev.timezone,
                "durationFormatted": duration_fmt,
                "isServiceActive": is_active_window,
            },
            "eventPublication": {
                "isReady": publication_ready,
                "status": auth_status,
                "isOrderingOpen": ev.is_ordering_open,
            }
        }
    }

@router.get("/{restaurant_id}/events/{event_id}/tables")
async def list_event_tables(
    restaurant_id: str,
    event_id: str,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(WeddingEvent).where(WeddingEvent.id == event_id, WeddingEvent.restaurant_id == canonical_id)
    res = await db.execute(stmt)
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    t_stmt = select(EventTable).where(EventTable.event_id == ev.id, EventTable.is_active.is_(True)).order_by(EventTable.table_number.asc())
    t_res = await db.execute(t_stmt)
    tables = t_res.scalars().all()
    return [_format_table(t) for t in tables]

@router.post("/{restaurant_id}/events/{event_id}/tables", status_code=status.HTTP_201_CREATED)
async def add_event_table(
    restaurant_id: str,
    event_id: str,
    payload: CreateEventTableSchema,
    caller: CallerContext = Depends(require_tenant_event_manager),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(WeddingEvent).where(WeddingEvent.id == event_id, WeddingEvent.restaurant_id == canonical_id)
    res = await db.execute(stmt)
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    r_stmt = select(Restaurant).where(Restaurant.id == canonical_id)
    r_res = await db.execute(r_stmt)
    rest = r_res.scalar_one_or_none()
    slug = rest.public_slug or rest.slug or rest.id if rest else ""

    clean_num = payload.tableNumber.strip()
    # Check duplicate
    dup_stmt = select(EventTable).where(EventTable.event_id == event_id, EventTable.table_number == clean_num)
    dup_res = await db.execute(dup_stmt)
    if dup_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Table number '{clean_num}' already exists in this event")

    t_id = f"etbl-{event_id}-{clean_num.lower().replace(' ', '_')}"
    qr_url = _generate_event_qr_url(slug, event_id, clean_num)
    new_tbl = EventTable(
        id=t_id,
        event_id=event_id,
        restaurant_id=canonical_id,
        table_number=clean_num,
        table_label=payload.tableLabel.strip() if payload.tableLabel else f"Table {clean_num}",
        capacity=payload.capacity or 8,
        qr_code_url=qr_url,
        is_active=True,
    )
    db.add(new_tbl)
    await db.commit()
    await db.refresh(new_tbl)
    return _format_table(new_tbl)

@router.put("/{restaurant_id}/events/{event_id}/tables/{table_id}")
async def update_event_table(
    restaurant_id: str,
    event_id: str,
    table_id: str,
    payload: UpdateEventTableSchema,
    caller: CallerContext = Depends(require_tenant_event_manager),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(EventTable).where(
        EventTable.event_id == event_id,
        EventTable.restaurant_id == canonical_id,
        (EventTable.id == table_id) | (EventTable.table_number == table_id)
    )
    res = await db.execute(stmt)
    tbl = res.scalar_one_or_none()
    if not tbl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event table not found")

    if payload.tableNumber is not None:
        clean_num = payload.tableNumber.strip()
        if clean_num and clean_num != tbl.table_number:
            dup_stmt = select(EventTable).where(
                EventTable.event_id == event_id,
                EventTable.table_number == clean_num,
                EventTable.id != tbl.id
            )
            dup_res = await db.execute(dup_stmt)
            if dup_res.scalars().first():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Table number '{clean_num}' already exists in this event")
            tbl.table_number = clean_num
            r_stmt = select(Restaurant).where(Restaurant.id == canonical_id)
            r_res = await db.execute(r_stmt)
            rest = r_res.scalar_one_or_none()
            slug = rest.public_slug or rest.slug or rest.id if rest else ""
            tbl.qr_code_url = _generate_event_qr_url(slug, event_id, clean_num)

    if payload.tableLabel is not None:
        tbl.table_label = payload.tableLabel.strip()
    if payload.capacity is not None and payload.capacity > 0:
        tbl.capacity = payload.capacity
    if payload.isActive is not None:
        tbl.is_active = payload.isActive

    await db.commit()
    await db.refresh(tbl)
    return _format_table(tbl)

@router.delete("/{restaurant_id}/events/{event_id}/tables/{table_id}")
async def delete_event_table(
    restaurant_id: str,
    event_id: str,
    table_id: str,
    caller: CallerContext = Depends(require_tenant_event_manager),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(EventTable).where(
        EventTable.event_id == event_id,
        EventTable.restaurant_id == canonical_id,
        (EventTable.id == table_id) | (EventTable.table_number == table_id)
    )
    res = await db.execute(stmt)
    tbl = res.scalar_one_or_none()
    if not tbl:
        return {"status": "success", "message": "Table already removed"}

    # Protection: check for active orders referencing this table
    from app.modules.orders.models import Order
    order_stmt = select(func.count(Order.id)).where(
        Order.restaurant_id == canonical_id,
        Order.event_id == event_id,
        (Order.table_number == tbl.table_number) | (Order.table_id == tbl.id),
        Order.status.in_(["PENDING", "CONFIRMED", "PREPARING", "READY", "SERVED"])
    )
    order_res = await db.execute(order_stmt)
    active_count = order_res.scalar() or 0
    if active_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete Table {tbl.table_number}: It has {active_count} active orders in progress."
        )

    await db.delete(tbl)
    await db.commit()
    return {"status": "success", "message": "Table removed from event"}

@router.get("/{restaurant_id}/events/{event_id}/orders")
async def get_event_orders(
    restaurant_id: str,
    event_id: str,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    from app.modules.orders.router import format_order_response
    stmt = select(Order).where(Order.restaurant_id == canonical_id, Order.event_id == event_id).order_by(Order.created_at.desc())
    res = await db.execute(stmt)
    orders = res.scalars().all()
    return [format_order_response(o) for o in orders]

# ==========================================
# PUBLIC GUEST WEDDING ENDPOINT (NO AUTH)
# ==========================================

@router.get("/public/events/{event_id}")
@public_router.get("/events/{event_id}")
async def get_public_wedding_event(
    event_id: str,
    table: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Public guest endpoint for wedding & event ordering.
    Accessible without authentication when scanning table QR codes.
    Returns event details, table assignment, and filtered menu.
    """
    stmt = select(WeddingEvent).where(WeddingEvent.id == event_id)
    res = await db.execute(stmt)
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wedding event not found.")

    if ev.status in ("COMPLETED", "CANCELLED"):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail=f"This event has {ev.status.lower()}. Online guest dining is no longer active."
        )

    # Load restaurant details
    r_stmt = select(Restaurant).where(Restaurant.id == ev.restaurant_id)
    r_res = await db.execute(r_stmt)
    rest = r_res.scalar_one_or_none()
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Venue not found.")

    # Resolve table if supplied
    matched_table = None
    if table:
        clean_tbl = str(table).strip()
        t_stmt = select(EventTable).where(
            EventTable.event_id == ev.id,
            (EventTable.table_number == clean_tbl) | (EventTable.id == clean_tbl)
        )
        t_res = await db.execute(t_stmt)
        matched_table = t_res.scalar_one_or_none()

    # Load menu items
    cats_stmt = select(MenuCategory).where(
        MenuCategory.restaurant_id == rest.id,
        MenuCategory.is_enabled.is_(True)
    ).order_by(MenuCategory.sort_order.asc(), MenuCategory.name.asc())
    cats_res = await db.execute(cats_stmt)
    categories = cats_res.scalars().all()

    items_stmt = select(MenuItem).where(
        MenuItem.restaurant_id == rest.id,
        MenuItem.is_available.is_(True),
        MenuItem.deleted_at.is_(None)
    ).order_by(MenuItem.name.asc())
    items_res = await db.execute(items_stmt)
    items = items_res.scalars().all()

    # Station availability for this event
    has_food = getattr(ev, "has_food", True) if getattr(ev, "has_food", None) is not None else True
    has_bar = getattr(ev, "has_bar", False) if getattr(ev, "has_bar", None) is not None else False
    has_hookah = getattr(ev, "has_hookah", False) if getattr(ev, "has_hookah", None) is not None else False
    has_assistance = getattr(ev, "has_table_assistance", True) if getattr(ev, "has_table_assistance", None) is not None else True

    cat_name_map = {c.id: (c.name or "").lower() for c in categories}

    def _resolve_item_destination(it: MenuItem) -> str:
        dest = (getattr(it, "target_destination", None) or "").upper()
        if dest in ("BAR", "HOOKAH", "KITCHEN"):
            return dest
        c_name = cat_name_map.get(it.category_id, "")
        it_name = (it.name or "").lower()
        if "hookah" in c_name or "shisha" in c_name or "hookah" in it_name or "shisha" in it_name:
            return "HOOKAH"
        if bool(it.is_alcoholic) or any(k in c_name for k in ("bar", "cocktail", "wine", "beer", "beverage", "drink")):
            return "BAR"
        if any(k in it_name for k in ("cocktail", "mocktail", "wine", "beer", "whiskey", "vodka", "gin", "rum", "beverage", "soda")):
            return "BAR"
        return "KITCHEN"

    def _item_allowed_by_station(it: MenuItem) -> bool:
        dest = _resolve_item_destination(it)
        if dest == "BAR":
            return has_bar
        if dest == "HOOKAH":
            return has_hookah
        return has_food

    # Filter menu if restricted
    allowed_cats = set(ev.allowed_category_ids or [])
    allowed_items = set(ev.allowed_item_ids or [])
    is_restricted = ev.menu_selection_type == "RESTRICTED"

    filtered_menu = []
    for c in categories:
        if is_restricted and allowed_cats and c.id not in allowed_cats:
            continue

        c_items = [it for it in items if it.category_id == c.id and _item_allowed_by_station(it)]
        if is_restricted and allowed_items:
            c_items = [it for it in c_items if it.id in allowed_items]

        if c_items:
            filtered_menu.append({
                "id": c.id,
                "name": c.name,
                "description": getattr(c, "description", "") or "",
                "items": [
                    {
                        "id": it.id,
                        "name": it.name,
                        "description": it.description or "",
                        "price": None,
                        "imageUrl": it.image_url or "",
                        "isVegetarian": it.is_vegetarian,
                        "isAlcoholic": it.is_alcoholic,
                        "isAvailable": it.is_available,
                        "targetDestination": _resolve_item_destination(it),
                        "dietaryType": "NON_VEG" if not it.is_vegetarian else (getattr(it, "dietary_type", "VEG") or "VEG"),
                        "categoryName": c.name,
                        "categoryId": c.id,
                        "variants": getattr(it, "variants_json", None),
                        "modifiers": getattr(it, "modifiers_json", None),
                    }
                    for it in c_items
                ]
            })

    # Fallback if no categories or unassigned items
    if not filtered_menu and items:
        valid_items = [it for it in items if _item_allowed_by_station(it)]
        if is_restricted and allowed_items:
            valid_items = [it for it in valid_items if it.id in allowed_items]
        if valid_items:
            filtered_menu.append({
                "id": "event-specials",
                "name": "Event Menu",
                "description": "Chef curated feast",
                "items": [
                    {
                        "id": it.id,
                        "name": it.name,
                        "description": it.description or "",
                        "price": None,
                        "imageUrl": it.image_url or "",
                        "isVegetarian": it.is_vegetarian,
                        "isAlcoholic": it.is_alcoholic,
                        "isAvailable": it.is_available,
                        "targetDestination": _resolve_item_destination(it),
                        "dietaryType": "NON_VEG" if not it.is_vegetarian else (getattr(it, "dietary_type", "VEG") or "VEG"),
                        "categoryName": "Event Menu",
                        "categoryId": "event-specials",
                    }
                    for it in valid_items
                ]
            })

    now_utc = datetime.now(timezone.utc)
    auth_status = get_authoritative_event_status(ev, now_utc)
    duration_fmt = format_service_duration(ev.start_datetime_utc, ev.end_datetime_utc) if (ev.start_datetime_utc and ev.end_datetime_utc) else None
    is_active_window = (auth_status == "ACTIVE")
    is_ordering_available = bool(ev.is_ordering_open and is_active_window)

    return {
        "event": {
            "id": ev.id,
            "title": ev.title,
            "coupleNames": ev.couple_names or "",
            "eventType": ev.event_type or "WEDDING",
            "eventDate": ev.event_date,
            "endDate": ev.end_date or ev.event_date,
            "startTime": ev.start_time or "18:00",
            "endTime": ev.end_time or "23:30",
            "timezone": ev.timezone or "Asia/Kolkata",
            "serviceDays": ev.service_days or 1,
            "startDatetimeUtc": ev.start_datetime_utc.isoformat() if ev.start_datetime_utc else None,
            "endDatetimeUtc": ev.end_datetime_utc.isoformat() if ev.end_datetime_utc else None,
            "durationFormatted": duration_fmt,
            "venueName": ev.venue_name or rest.name,
            "welcomeMessage": ev.welcome_message or "",
            "themeColor": ev.theme_color or "champagne",
            "coverImageUrl": ev.cover_image_url or "",
            "status": auth_status,
            "rawStatus": ev.status or "DRAFT",
            "isOrderingOpen": is_ordering_available,
            "isServiceActive": is_active_window,
            "hasFood": has_food,
            "hasBar": has_bar,
            "hasHookah": has_hookah,
            "hasTableAssistance": has_assistance,
            "alcoholPolicyNotes": getattr(ev, "alcohol_policy_notes", None),
        },
        "restaurant": {
            "id": rest.id,
            "name": rest.name,
            "slug": rest.public_slug or rest.slug or rest.id,
            "logoUrl": getattr(rest, "logo_url", None) or (rest.theme_json.get("logoUrl") if isinstance(rest.theme_json, dict) else "") or "",
            "currency": getattr(rest, "currency", "INR") or "INR",
        },
        "table": _format_table(matched_table) if matched_table else (
            {"tableNumber": table, "tableLabel": f"Table {table}", "capacity": 8} if table else None
        ),
        "menu": filtered_menu,
    }

# ==========================================
# PUBLIC GUEST TABLE ASSISTANCE (NO AUTH)
# ==========================================

@router.post("/public/events/{event_id}/assistance", status_code=status.HTTP_201_CREATED)
@public_router.post("/events/{event_id}/assistance", status_code=status.HTTP_201_CREATED)
async def create_event_table_assistance_request(
    event_id: str,
    payload: CreateEventAssistanceSchema,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(WeddingEvent).where(WeddingEvent.id == event_id)
    res = await db.execute(stmt)
    ev = res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")

    now_utc = datetime.now(timezone.utc)
    auth_status = get_authoritative_event_status(ev, now_utc)
    if auth_status in ("CLOSED", "COMPLETED", "CANCELLED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Table assistance is unavailable: Event has {auth_status.lower()}."
        )

    if getattr(ev, "has_table_assistance", True) is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Table assistance service is not enabled for this banquet."
        )

    raw_tbl = payload.tableNumber or payload.table or payload.table_number or ""
    clean_tbl = str(raw_tbl).strip()
    if not clean_tbl:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Table number is required.")

    # Match against EventTable if available
    t_stmt = select(EventTable).where(
        EventTable.event_id == ev.id,
        (EventTable.table_number == clean_tbl) | (EventTable.id == payload.tableId if payload.tableId else False)
    )
    t_res = await db.execute(t_stmt)
    matched_tbl = t_res.scalar_one_or_none()
    table_id_val = matched_tbl.id if matched_tbl else payload.tableId

    req_items = payload.requestItems or payload.items or []
    if not req_items or len(req_items) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one assistance item must be requested.")

    note_val = (payload.guestNote or payload.notes or payload.note or "").strip() or None

    # Idempotency Check: if identical request submitted within 10 minutes, return existing
    if payload.idempotencyKey:
        clean_key = payload.idempotencyKey.strip()
        existing_stmt = select(EventAssistanceRequest).where(
            EventAssistanceRequest.event_id == ev.id,
            EventAssistanceRequest.idempotency_key == clean_key
        )
        existing_res = await db.execute(existing_stmt)
        existing_req = existing_res.scalar_one_or_none()
        if existing_req:
            response.status_code = status.HTTP_200_OK
            return _format_public_assistance_request(existing_req)

    # Duplicate rapid tap throttle: if same table requested active assistance within last 60 seconds with same items
    recent_cut = now_utc - timedelta(seconds=60)
    dup_stmt = select(EventAssistanceRequest).where(
        EventAssistanceRequest.event_id == ev.id,
        EventAssistanceRequest.table_number == clean_tbl,
        EventAssistanceRequest.status.in_(["NEW", "ACKNOWLEDGED", "IN_PROGRESS"]),
        EventAssistanceRequest.created_at >= recent_cut
    ).order_by(EventAssistanceRequest.created_at.desc()).limit(1)
    dup_res = await db.execute(dup_stmt)
    dup_req = dup_res.scalar_one_or_none()
    def _norm_items_for_cmp(items):
        res = []
        for it in (items or []):
            if isinstance(it, dict):
                import json
                res.append(json.dumps(it, sort_keys=True))
            else:
                res.append(str(it))
        return sorted(res)

    if dup_req and _norm_items_for_cmp(dup_req.request_items) == _norm_items_for_cmp(req_items):
        response.status_code = status.HTTP_200_OK
        return _format_public_assistance_request(dup_req)

    req_id = f"ast-{ev.id[:8]}-{int(now_utc.timestamp() * 1000)}"
    new_req = EventAssistanceRequest(
        id=req_id,
        event_id=ev.id,
        restaurant_id=ev.restaurant_id,
        table_number=clean_tbl,
        table_id=table_id_val,
        request_items=req_items,
        guest_name=payload.guestName.strip() if payload.guestName else None,
        guest_note=note_val,
        status="NEW",
        idempotency_key=payload.idempotencyKey.strip() if payload.idempotencyKey else None,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(new_req)
    await db.commit()
    await db.refresh(new_req)

    req_dict = _format_assistance_request(new_req)

    try:
        await ws_manager.broadcast_event(
            ev.restaurant_id,
            "event_assistance_created",
            req_dict,
            audience=["OWNER", "WAITER", "RUNNER", "STAFF"]
        )
    except Exception:
        pass

    return _format_public_assistance_request(new_req)

@router.get("/public/events/{event_id}/assistance/status/{request_id}")
@public_router.get("/events/{event_id}/assistance/status/{request_id}")
async def get_public_event_assistance_request_status(
    event_id: str,
    request_id: str,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(EventAssistanceRequest).where(
        EventAssistanceRequest.event_id == event_id,
        EventAssistanceRequest.id == request_id
    )
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistance request not found.")
    return _format_public_assistance_request(req)

@router.get("/public/events/{event_id}/assistance")
@public_router.get("/events/{event_id}/assistance")
async def list_public_event_assistance_by_table(
    event_id: str,
    table: str = Query(..., description="Table number"),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(EventAssistanceRequest).where(
        EventAssistanceRequest.event_id == event_id,
        EventAssistanceRequest.table_number == str(table).strip()
    ).order_by(EventAssistanceRequest.created_at.desc()).limit(20)
    res = await db.execute(stmt)
    reqs = res.scalars().all()
    return [_format_public_assistance_request(r) for r in reqs]

# ==========================================
# STAFF EVENT TABLE ASSISTANCE TERMINAL
# ==========================================

@router.get("/{restaurant_id}/events/{event_id}/assistance")
async def list_event_assistance_requests(
    restaurant_id: str,
    event_id: str,
    status_filter: Optional[str] = Query(None, alias="status"),
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    ev_stmt = select(WeddingEvent).where(WeddingEvent.id == event_id, WeddingEvent.restaurant_id == canonical_id)
    ev_res = await db.execute(ev_stmt)
    ev = ev_res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")

    stmt = select(EventAssistanceRequest).where(
        EventAssistanceRequest.event_id == event_id,
        EventAssistanceRequest.restaurant_id == canonical_id
    ).order_by(EventAssistanceRequest.created_at.desc())
    res = await db.execute(stmt)
    all_reqs = res.scalars().all()

    new_count = sum(1 for r in all_reqs if r.status == "NEW")
    ack_count = sum(1 for r in all_reqs if r.status == "ACKNOWLEDGED")
    in_prog_count = sum(1 for r in all_reqs if r.status == "IN_PROGRESS")
    comp_count = sum(1 for r in all_reqs if r.status == "COMPLETED")
    waiting_tables = set(r.table_number for r in all_reqs if r.status in ("NEW", "ACKNOWLEDGED", "IN_PROGRESS"))

    summary = {
        "newRequestsCount": new_count,
        "acknowledgedCount": ack_count,
        "inProgressCount": in_prog_count,
        "completedCount": comp_count,
        "waitingTablesCount": len(waiting_tables),
        "new": new_count,
        "acknowledged": ack_count,
        "inProgress": in_prog_count,
        "completed": comp_count,
        "waitingTables": len(waiting_tables),
    }

    filtered = all_reqs
    if status_filter:
        clean_st = status_filter.strip().upper()
        if clean_st == "ACTIVE":
            filtered = [r for r in all_reqs if r.status in ("NEW", "ACKNOWLEDGED", "IN_PROGRESS")]
        elif clean_st != "ALL":
            filtered = [r for r in all_reqs if r.status == clean_st]

    return {
        "summary": summary,
        "requests": [_format_assistance_request(r) for r in filtered]
    }

@router.patch("/{restaurant_id}/events/{event_id}/assistance/{request_id}/status")
async def update_event_assistance_request_status(
    restaurant_id: str,
    event_id: str,
    request_id: str,
    payload: UpdateEventAssistanceStatusSchema,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(EventAssistanceRequest).where(
        EventAssistanceRequest.id == request_id,
        EventAssistanceRequest.event_id == event_id,
        EventAssistanceRequest.restaurant_id == canonical_id
    )
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assistance request not found.")

    target_status = payload.status.strip().upper()
    valid_statuses = ("NEW", "ACKNOWLEDGED", "IN_PROGRESS", "COMPLETED", "CANCELLED")
    if target_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{payload.status}'. Must be one of: {', '.join(valid_statuses)}"
        )

    # Idempotent completion
    if req.status == "COMPLETED" and target_status == "COMPLETED":
        return _format_assistance_request(req)

    now_utc = datetime.now(timezone.utc)
    staff_name = (payload.assignedStaffName or payload.staffName or "").strip() or caller.email or "Assistance Staff"

    req.status = target_status
    req.updated_at = now_utc

    if target_status == "ACKNOWLEDGED":
        req.acknowledged_at = req.acknowledged_at or now_utc
        req.assigned_staff_name = staff_name
        req.assigned_staff_uid = caller.uid
    elif target_status == "IN_PROGRESS":
        req.acknowledged_at = req.acknowledged_at or now_utc
        req.in_progress_at = now_utc
        req.assigned_staff_name = staff_name
        req.assigned_staff_uid = caller.uid
    elif target_status == "COMPLETED":
        req.completed_at = now_utc
        if not req.assigned_staff_name:
            req.assigned_staff_name = staff_name
            req.assigned_staff_uid = caller.uid
    elif target_status == "NEW":
        req.assigned_staff_name = None
        req.assigned_staff_uid = None

    await db.commit()
    await db.refresh(req)

    req_dict = _format_assistance_request(req)

    try:
        await ws_manager.broadcast_event(
            canonical_id,
            "event_assistance_updated",
            req_dict,
            audience=["OWNER", "WAITER", "RUNNER", "STAFF"]
        )
    except Exception:
        pass

    return req_dict

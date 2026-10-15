import uuid
from datetime import datetime, timezone
from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_

from app.core.database.connection import get_db
from app.core.security.rbac import require_platform_admin, get_current_firebase_admin
from app.core.security.tenant_auth import get_caller_context, CallerContext
from app.modules.admin.audit_service import AdminAuditLogger
from app.modules.restaurants.models import Restaurant
from app.modules.weddings.models import WeddingAccessRequest, WeddingWorkspace, WeddingEvent, EventTable
from app.modules.orders.models import Order
from app.modules.menu.models import MenuCategory, MenuItem
from app.core.tenant.qr import generate_canonical_qr_url

# Router mounted at /api/v1/weddings
weddings_router = APIRouter()

# Router mounted at /api/v1/admin/wedding-requests
admin_weddings_router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class CreateWeddingRequestSchema(BaseModel):
    applicantName: Optional[str] = None
    applicant_name: Optional[str] = None
    applicantEmail: Optional[str] = None
    applicant_email: Optional[str] = None
    applicantPhone: Optional[str] = None
    applicant_phone: Optional[str] = None
    weddingName: Optional[str] = None
    wedding_name: Optional[str] = None
    eventType: Optional[str] = "WEDDING"
    event_type: Optional[str] = None
    eventDate: Optional[str] = None
    event_date: Optional[str] = None
    startTime: Optional[str] = "18:00"
    start_time: Optional[str] = None
    endTime: Optional[str] = "23:30"
    end_time: Optional[str] = None
    venueName: Optional[str] = None
    venue_name: Optional[str] = None
    venueCity: Optional[str] = None
    venue_city: Optional[str] = None
    venueState: Optional[str] = None
    venue_state: Optional[str] = None
    estimatedGuestCount: Optional[int] = 100
    estimated_guest_count: Optional[int] = None
    estimatedGuests: Optional[int] = None
    estimated_guests: Optional[int] = None
    cateringNotes: Optional[str] = None
    catering_notes: Optional[str] = None
    cateringRestaurantId: Optional[str] = None
    catering_restaurant_id: Optional[str] = None
    additionalRequirements: Optional[str] = None
    additional_requirements: Optional[str] = None
    specialRequirements: Optional[str] = None
    special_requirements: Optional[str] = None
    notes: Optional[str] = None


class ApproveWeddingRequestSchema(BaseModel):
    cateringRestaurantId: Optional[str] = None
    catering_restaurant_id: Optional[str] = None
    reviewNotes: Optional[str] = None
    review_notes: Optional[str] = None


class RejectWeddingRequestSchema(BaseModel):
    reason: Optional[str] = None
    rejectionReason: Optional[str] = None
    rejection_reason: Optional[str] = None
    reviewNotes: Optional[str] = None
    review_notes: Optional[str] = None


class UpdateWeddingRequestNotesSchema(BaseModel):
    notes: Optional[str] = None
    reviewNotes: Optional[str] = None
    review_notes: Optional[str] = None


class UpdateWorkspaceEventSchema(BaseModel):
    title: Optional[str] = None
    coupleNames: Optional[str] = None
    eventType: Optional[str] = None
    eventDate: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    venueName: Optional[str] = None
    welcomeMessage: Optional[str] = None
    themeColor: Optional[str] = None
    coverImageUrl: Optional[str] = None
    status: Optional[str] = None
    isOrderingOpen: Optional[bool] = None
    orderingEnabled: Optional[bool] = None
    menuSelectionType: Optional[str] = None
    allowedCategoryIds: Optional[List[str]] = None
    allowedItemIds: Optional[List[str]] = None
    estimatedGuestCount: Optional[int] = None
    estimatedGuests: Optional[int] = None
    notes: Optional[str] = None


class AddWorkspaceTableSchema(BaseModel):
    tableNumber: Optional[str] = None
    table_number: Optional[str] = None
    tableLabel: Optional[str] = None
    table_label: Optional[str] = None
    label: Optional[str] = None
    capacity: Optional[int] = 8


# ---------------------------------------------------------------------------
# Helper Formatters
# ---------------------------------------------------------------------------

def _format_request(req: WeddingAccessRequest, rest_name: Optional[str] = None) -> dict:
    return {
        "id": req.id,
        "applicantName": req.applicant_name,
        "applicantEmail": req.applicant_email,
        "applicantPhone": req.applicant_phone,
        "weddingName": req.wedding_name,
        "eventType": req.event_type,
        "eventDate": req.event_date,
        "startTime": req.start_time,
        "endTime": req.end_time,
        "venueName": req.venue_name,
        "venueCity": req.venue_city,
        "estimatedGuestCount": req.estimated_guest_count,
        "cateringNotes": req.catering_notes or "",
        "cateringRestaurantId": req.catering_restaurant_id,
        "cateringRestaurantName": rest_name or "",
        "additionalRequirements": req.additional_requirements or "",
        "notes": req.notes or "",
        "lifecycleStatus": req.lifecycle_status,
        "reviewNotes": req.review_notes or "",
        "reviewedBy": req.reviewed_by,
        "reviewedAt": req.reviewed_at.isoformat() if req.reviewed_at else None,
        "workspaceId": req.workspace_id,
        "createdAt": req.created_at.isoformat() if req.created_at else None,
        "updatedAt": req.updated_at.isoformat() if req.updated_at else None,
    }


def _format_table(table: EventTable) -> dict:
    return {
        "id": table.id,
        "eventId": table.event_id,
        "restaurantId": table.restaurant_id,
        "tableNumber": table.table_number,
        "tableLabel": table.table_label or f"Table {table.table_number}",
        "label": table.table_label or f"Table {table.table_number}",
        "capacity": table.capacity or 8,
        "qrCodeUrl": table.qr_code_url or "",
        "isActive": table.is_active,
    }


# ===========================================================================
# PART 2: PUBLIC WEDDING ACCESS REQUESTS
# ===========================================================================

@weddings_router.post("/requests", status_code=status.HTTP_201_CREATED)
async def submit_wedding_request(
    payload: CreateWeddingRequestSchema,
    db: AsyncSession = Depends(get_db)
):
    """
    Submits an application for a wedding ordering workspace.
    Validates input and prevents duplicate active applications.
    """
    clean_name = (payload.applicantName or payload.applicant_name or "").strip()
    clean_email = (payload.applicantEmail or payload.applicant_email or "").strip().lower()
    clean_phone = (payload.applicantPhone or payload.applicant_phone or "").strip()
    clean_wedding = (payload.weddingName or payload.wedding_name or "").strip()
    clean_date = (payload.eventDate or payload.event_date or "").strip()
    clean_venue = (payload.venueName or payload.venue_name or "").strip()
    clean_city = (payload.venueCity or payload.venue_city or "").strip()
    clean_state = (payload.venueState or payload.venue_state or "").strip()
    if clean_state and clean_state not in clean_city:
        clean_city = f"{clean_city}, {clean_state}"

    if not clean_name or not clean_email or not clean_phone or not clean_wedding or not clean_date or not clean_venue or not clean_city:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing required fields: Name, Email, Phone, Wedding/Event Name, Event Date, Venue, and City are required."
        )

    # Email format validation
    if "@" not in clean_email or "." not in clean_email.split("@")[-1]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address."
        )

    clean_guest_count = max(1, payload.estimatedGuestCount or payload.estimated_guest_count or payload.estimatedGuests or payload.estimated_guests or 100)
    clean_caterer = (payload.cateringRestaurantId or payload.catering_restaurant_id or "").strip() or None
    clean_catering_notes = (payload.cateringNotes or payload.catering_notes or payload.specialRequirements or payload.special_requirements or "").strip() or None
    clean_additional = (payload.additionalRequirements or payload.additional_requirements or "").strip() or None
    clean_notes = (payload.notes or "").strip() or None

    # Deduplication check: Do not allow duplicate pending/submitted applications for the same email and event date
    dup_stmt = select(WeddingAccessRequest).where(
        WeddingAccessRequest.applicant_email == clean_email,
        WeddingAccessRequest.event_date == clean_date,
        WeddingAccessRequest.lifecycle_status.in_(["SUBMITTED", "UNDER_REVIEW", "APPROVED"])
    )
    dup_res = await db.execute(dup_stmt)
    existing = dup_res.scalar_one_or_none()
    if existing:
        return {
            "status": "success",
            "message": "An application for this event date has already been registered for your email.",
            "requestId": existing.id,
            "lifecycleStatus": existing.lifecycle_status,
            "isDuplicate": True
        }

    # Generate unique application ID
    request_id = f"wreq-{uuid.uuid4().hex[:10]}"

    new_req = WeddingAccessRequest(
        id=request_id,
        applicant_name=clean_name,
        applicant_email=clean_email,
        applicant_phone=clean_phone,
        wedding_name=clean_wedding,
        event_type=payload.eventType or payload.event_type or "WEDDING",
        event_date=clean_date,
        start_time=payload.startTime or payload.start_time or "18:00",
        end_time=payload.endTime or payload.end_time or "23:30",
        venue_name=clean_venue,
        venue_city=clean_city,
        estimated_guest_count=clean_guest_count,
        catering_notes=clean_catering_notes,
        catering_restaurant_id=clean_caterer,
        additional_requirements=clean_additional,
        notes=clean_notes,
        lifecycle_status="SUBMITTED",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )

    db.add(new_req)
    await db.commit()
    await db.refresh(new_req)

    return {
        "status": "success",
        "message": "Your wedding ordering application has been successfully submitted.",
        "requestId": new_req.id,
        "lifecycleStatus": new_req.lifecycle_status,
        "createdAt": new_req.created_at.isoformat()
    }


@weddings_router.get("/requests/{request_id}")
async def get_wedding_request_status(
    request_id: str,
    email: Optional[str] = Query(None),
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    """
    Look up status of a submitted wedding access request.
    Restricted to the applicant email or platform admin.
    """
    stmt = select(WeddingAccessRequest).where(WeddingAccessRequest.id == request_id)
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    # Authorization verification
    target_email = (email or caller.email or "").strip().lower()
    is_authorized = (
        caller.is_admin or
        (target_email and req.applicant_email.lower() == target_email)
    )
    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You are not authorized to view this application."
        )

    rest_name = None
    if req.catering_restaurant_id:
        r_res = await db.execute(select(Restaurant.name).where(Restaurant.id == req.catering_restaurant_id))
        rest_name = r_res.scalar_one_or_none()

    return _format_request(req, rest_name)


# ===========================================================================
# PART 3 & 4: PLATFORM ADMIN WEDDING REQUESTS MANAGEMENT
# ===========================================================================

@admin_weddings_router.get("")
async def list_admin_wedding_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    admin_claims: Dict[str, Any] = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Lists all wedding requests for the Platform Admin portal.
    Strictly authorized to ayan090912@gmail.com.
    """
    stmt = select(WeddingAccessRequest).order_by(WeddingAccessRequest.created_at.desc())

    if status_filter and isinstance(status_filter, str) and status_filter.upper() != "ALL":
        stmt = stmt.where(WeddingAccessRequest.lifecycle_status == status_filter.upper())

    if search and isinstance(search, str):
        term = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(WeddingAccessRequest.applicant_name).like(term),
                func.lower(WeddingAccessRequest.applicant_email).like(term),
                func.lower(WeddingAccessRequest.wedding_name).like(term),
                func.lower(WeddingAccessRequest.venue_city).like(term),
            )
        )

    res = await db.execute(stmt)
    requests = res.scalars().all()

    # Pre-fetch restaurant names for assigned venues
    rest_ids = [r.catering_restaurant_id for r in requests if r.catering_restaurant_id]
    rest_names = {}
    if rest_ids:
        r_res = await db.execute(select(Restaurant.id, Restaurant.name).where(Restaurant.id.in_(rest_ids)))
        for rid, rname in r_res.all():
            rest_names[rid] = rname

    # Pre-fetch approved catering restaurant candidates
    all_rest_res = await db.execute(
        select(Restaurant.id, Restaurant.name, Restaurant.slug, Restaurant.address)
        .where(Restaurant.is_approved == True, Restaurant.deleted_at == None)
        .order_by(Restaurant.name.asc())
    )
    caterer_candidates = [
        {"id": r.id, "name": r.name, "slug": r.slug or r.id, "city": r.address or ""}
        for r in all_rest_res.all()
    ]

    return {
        "requests": [_format_request(r, rest_names.get(r.catering_restaurant_id)) for r in requests],
        "catererCandidates": caterer_candidates,
        "counts": {
            "all": len(requests),
            "submitted": sum(1 for r in requests if r.lifecycle_status == "SUBMITTED"),
            "under_review": sum(1 for r in requests if r.lifecycle_status == "UNDER_REVIEW"),
            "approved": sum(1 for r in requests if r.lifecycle_status == "APPROVED"),
            "rejected": sum(1 for r in requests if r.lifecycle_status == "REJECTED"),
        }
    }


@admin_weddings_router.get("/{request_id}")
async def get_admin_wedding_request_detail(
    request_id: str,
    admin_claims: Dict[str, Any] = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get detailed information for a specific wedding request.
    """
    stmt = select(WeddingAccessRequest).where(WeddingAccessRequest.id == request_id)
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wedding request not found.")

    rest_name = None
    if req.catering_restaurant_id:
        r_res = await db.execute(select(Restaurant.name).where(Restaurant.id == req.catering_restaurant_id))
        rest_name = r_res.scalar_one_or_none()

    # Pre-fetch candidate catering restaurants
    all_rest_res = await db.execute(
        select(Restaurant.id, Restaurant.name, Restaurant.slug, Restaurant.address)
        .where(Restaurant.is_approved == True, Restaurant.deleted_at == None)
        .order_by(Restaurant.name.asc())
    )
    caterers = [
        {"id": r.id, "name": r.name, "slug": r.slug or r.id, "city": r.address or ""}
        for r in all_rest_res.all()
    ]

    return {
        "request": _format_request(req, rest_name),
        "caterers": caterers
    }


@admin_weddings_router.post("/{request_id}/approve")
async def approve_wedding_request(
    request_id: str,
    payload: ApproveWeddingRequestSchema,
    admin_claims: Dict[str, Any] = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Approves a wedding access request and provisions a dedicated WeddingWorkspace idempotently.
    Requires assigning or confirming the catering/kitchen restaurant.
    """
    admin_email = admin_claims.get("email") or "ayan090912@gmail.com"

    stmt = select(WeddingAccessRequest).where(WeddingAccessRequest.id == request_id)
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wedding request not found.")

    # Validate catering restaurant assignment
    caterer_id = (payload.cateringRestaurantId or payload.catering_restaurant_id or req.catering_restaurant_id or "").strip()
    if not caterer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A responsible catering restaurant or kitchen partner must be assigned before approval."
        )

    r_stmt = select(Restaurant).where(Restaurant.id == caterer_id, Restaurant.deleted_at == None)
    r_res = await db.execute(r_stmt)
    restaurant = r_res.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Catering restaurant '{caterer_id}' was not found or is inactive."
        )

    now = datetime.now(timezone.utc)
    review_note_text = (payload.reviewNotes or payload.review_notes or "").strip()

    # Idempotent check: If workspace already provisioned for this request, return existing
    ws_stmt = select(WeddingWorkspace).where(WeddingWorkspace.request_id == req.id)
    ws_res = await db.execute(ws_stmt)
    existing_ws = ws_res.scalar_one_or_none()

    if existing_ws:
        req.lifecycle_status = "APPROVED"
        req.catering_restaurant_id = restaurant.id
        req.reviewed_by = admin_email
        req.reviewed_at = now
        if review_note_text:
            req.review_notes = review_note_text
        await db.commit()
        return {
            "status": "success",
            "message": "Wedding request is already approved and workspace provisioned.",
            "workspaceId": existing_ws.id,
            "eventId": existing_ws.event_id,
            "restaurantId": existing_ws.restaurant_id,
            "ownerEmail": existing_ws.owner_email
        }

    # 1. Provision new WeddingWorkspace
    workspace_id = f"ws-wed-{uuid.uuid4().hex[:10]}"
    event_id = f"evt-wed-{uuid.uuid4().hex[:10]}"

    new_ws = WeddingWorkspace(
        id=workspace_id,
        request_id=req.id,
        owner_email=req.applicant_email.lower(),
        owner_uid=None,
        name=req.wedding_name,
        restaurant_id=restaurant.id,
        event_id=event_id,
        status="ACTIVE",
        created_at=now,
        updated_at=now
    )
    db.add(new_ws)

    # 2. Provision associated primary WeddingEvent
    new_event = WeddingEvent(
        id=event_id,
        workspace_id=workspace_id,
        organizer_email=req.applicant_email.lower(),
        restaurant_id=restaurant.id,
        title=req.wedding_name,
        couple_names=req.wedding_name.replace(" Wedding", "").replace(" Celebration", ""),
        event_type=req.event_type or "WEDDING",
        event_date=req.event_date,
        start_time=req.start_time or "18:00",
        end_time=req.end_time or "23:30",
        venue_name=req.venue_name,
        welcome_message=f"Welcome to {req.wedding_name}! Please browse the banquet menu below and place your courses directly from your table.",
        theme_color="champagne",
        status="ACTIVE",
        is_ordering_open=True,
        menu_selection_type="FULL_MENU",
        estimated_guest_count=req.estimated_guest_count,
        notes=f"Auto-provisioned from approved request {req.id}",
        created_at=now,
        updated_at=now
    )
    db.add(new_event)

    # CRITICAL: Flush WeddingWorkspace and WeddingEvent so that foreign key event_tables_event_id_fkey is satisfied!
    await db.flush()

    # 3. Provision initial default tables
    table_configs = [
        ("01", "Head Table / Couple", 4),
        ("02", "Bridal Party", 8),
        ("03", "Groomsmen", 8),
        ("04", "Family & VIP", 10),
    ]
    rest_slug = restaurant.public_slug or restaurant.slug or restaurant.id
    for t_num, t_label, t_cap in table_configs:
        t_id = f"etbl-{event_id}-{t_num}"
        qr_url = f"https://{rest_slug}.dinely.food/event/{event_id}?table={t_num}"
        db.add(EventTable(
            id=t_id,
            event_id=event_id,
            restaurant_id=restaurant.id,
            table_number=t_num,
            table_label=t_label,
            capacity=t_cap,
            qr_code_url=qr_url,
            is_active=True,
            created_at=now,
            updated_at=now
        ))

    await db.flush()

    # 4. Update request status
    req.lifecycle_status = "APPROVED"
    req.catering_restaurant_id = restaurant.id
    req.workspace_id = workspace_id
    req.reviewed_by = admin_email
    req.reviewed_at = now
    req.review_notes = review_note_text or "Approved by Platform Admin."
    req.updated_at = now

    await db.commit()

    # Log to Admin Audit
    AdminAuditLogger.log_action(
        admin_uid=admin_claims.get("uid") or admin_email,
        action="WEDDING_REQUEST_APPROVED",
        target_resource="wedding_access_request",
        target_id=req.id,
        details={
            "workspace_id": workspace_id,
            "event_id": event_id,
            "catering_restaurant_id": restaurant.id,
            "catering_restaurant_name": restaurant.name,
            "applicant_email": req.applicant_email,
        }
    )

    return {
        "status": "success",
        "message": f"Wedding request '{req.wedding_name}' approved successfully.",
        "workspaceId": workspace_id,
        "eventId": event_id,
        "cateringRestaurant": {
            "id": restaurant.id,
            "name": restaurant.name,
            "slug": rest_slug
        },
        "ownerEmail": req.applicant_email
    }


@admin_weddings_router.post("/{request_id}/reject")
async def reject_wedding_request(
    request_id: str,
    payload: RejectWeddingRequestSchema,
    admin_claims: Dict[str, Any] = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Rejects a wedding access request with review notes.
    """
    admin_email = admin_claims.get("email") or "ayan090912@gmail.com"

    stmt = select(WeddingAccessRequest).where(WeddingAccessRequest.id == request_id)
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wedding request not found.")

    clean_reason = (payload.reason or payload.rejectionReason or payload.rejection_reason or payload.reviewNotes or payload.review_notes or "Application declined by Platform Admin.").strip()
    if not clean_reason:
        clean_reason = "Application declined by Platform Admin."

    req.lifecycle_status = "REJECTED"
    req.review_notes = clean_reason
    req.reviewed_by = admin_email
    req.reviewed_at = datetime.now(timezone.utc)
    req.updated_at = datetime.now(timezone.utc)

    # If a workspace was previously provisioned for this request, mark it archived
    if req.workspace_id:
        ws_stmt = select(WeddingWorkspace).where(WeddingWorkspace.id == req.workspace_id)
        ws_res = await db.execute(ws_stmt)
        ws = ws_res.scalar_one_or_none()
        if ws:
            ws.status = "ARCHIVED"
            ws.updated_at = datetime.now(timezone.utc)

    await db.commit()

    AdminAuditLogger.log_action(
        admin_uid=admin_claims.get("uid") or admin_email,
        action="WEDDING_REQUEST_REJECTED",
        target_resource="wedding_access_request",
        target_id=req.id,
        details={"reason": clean_reason, "applicant_email": req.applicant_email}
    )

    return {
        "status": "success",
        "message": f"Wedding request '{req.wedding_name}' marked as rejected.",
        "requestId": req.id,
        "lifecycleStatus": "REJECTED"
    }


@admin_weddings_router.post("/{request_id}/notes")
async def update_admin_wedding_request_notes(
    request_id: str,
    payload: UpdateWeddingRequestNotesSchema,
    admin_claims: Dict[str, Any] = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Updates internal review notes for a wedding request without changing its lifecycle status.
    """
    stmt = select(WeddingAccessRequest).where(WeddingAccessRequest.id == request_id)
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wedding request not found.")

    req.review_notes = payload.notes.strip()
    req.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {"status": "success", "reviewNotes": req.review_notes}


# ===========================================================================
# PART 5: DEDICATED WEDDING ORGANIZER DASHBOARD API
# ===========================================================================

@weddings_router.get("/workspaces/my")
async def get_my_wedding_workspaces(
    email: Optional[str] = Query(None),
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns all active wedding workspaces owned by the caller.
    Identified by authenticated user email or caller context.
    """
    lookup_email = (caller.email or email or "").strip().lower()
    if not lookup_email and not caller.uid and not caller.is_admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    if caller.is_admin and not lookup_email:
        stmt = select(WeddingWorkspace).where(WeddingWorkspace.status == "ACTIVE").order_by(WeddingWorkspace.created_at.desc())
    else:
        conditions = [func.lower(WeddingWorkspace.owner_email) == lookup_email]
        if caller.uid:
            conditions.append(WeddingWorkspace.owner_uid == caller.uid)
        stmt = select(WeddingWorkspace).where(or_(*conditions), WeddingWorkspace.status == "ACTIVE").order_by(WeddingWorkspace.created_at.desc())

    res = await db.execute(stmt)
    workspaces = res.scalars().all()

    # Link owner_uid dynamically if caller is authenticated and workspace owner_uid was not set at approval
    needs_commit = False
    if caller.uid:
        for ws in workspaces:
            if not ws.owner_uid and caller.email and ws.owner_email.lower() == caller.email.lower():
                ws.owner_uid = caller.uid
                needs_commit = True
    if needs_commit:
        try:
            await db.commit()
        except Exception:
            pass

    # Pre-fetch restaurant details
    rest_ids = [w.restaurant_id for w in workspaces]
    rests = {}
    if rest_ids:
        r_stmt = select(Restaurant).where(Restaurant.id.in_(rest_ids))
        r_res = await db.execute(r_stmt)
        for r in r_res.scalars().all():
            rests[r.id] = r

    result = []
    for ws in workspaces:
        rest = rests.get(ws.restaurant_id)
        # Event details
        ev = None
        if ws.event_id:
            ev_res = await db.execute(select(WeddingEvent).where(WeddingEvent.id == ws.event_id))
            ev = ev_res.scalar_one_or_none()

        ordering_open = ev.is_ordering_open if ev else False
        result.append({
            "id": ws.id,
            "name": ws.name,
            "ownerEmail": ws.owner_email,
            "status": ws.status,
            "restaurantId": ws.restaurant_id,
            "restaurantName": rest.name if rest else "Unknown Partner",
            "restaurantSlug": (rest.public_slug or rest.slug or rest.id) if rest else "",
            "eventId": ws.event_id,
            "eventTitle": ev.title if ev else ws.name,
            "eventDate": ev.event_date if ev else "",
            "isOrderingOpen": ordering_open,
            "orderingEnabled": ordering_open,
            "createdAt": ws.created_at.isoformat() if ws.created_at else None,
        })

    return {"workspaces": result}


@weddings_router.get("/workspaces/{workspace_id}")
async def get_wedding_workspace_detail(
    workspace_id: str,
    email: Optional[str] = Query(None),
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns full details for a wedding organizer workspace, including event, tables,
    catering restaurant info and accessible menu items.
    """
    stmt = select(WeddingWorkspace).where(WeddingWorkspace.id == workspace_id)
    res = await db.execute(stmt)
    ws = res.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wedding workspace not found.")

    # Access control: Must be owner or platform admin
    effective_email = (caller.email or email or "").strip().lower()
    is_authorized = (
        caller.is_admin or
        (effective_email and ws.owner_email.lower() == effective_email) or
        (caller.uid and ws.owner_uid and ws.owner_uid == caller.uid)
    )
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: You are not authorized to view this workspace.")

    # Fetch catering restaurant
    r_stmt = select(Restaurant).where(Restaurant.id == ws.restaurant_id)
    r_res = await db.execute(r_stmt)
    rest = r_res.scalar_one_or_none()
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned catering restaurant not found.")

    # Fetch primary event
    ev = None
    if ws.event_id:
        ev_stmt = select(WeddingEvent).where(WeddingEvent.id == ws.event_id)
        ev_res = await db.execute(ev_stmt)
        ev = ev_res.scalar_one_or_none()

    # Fetch tables
    tables = []
    if ev:
        tbl_stmt = select(EventTable).where(EventTable.event_id == ev.id).order_by(EventTable.table_number.asc())
        tbl_res = await db.execute(tbl_stmt)
        tables = [_format_table(t) for t in tbl_res.scalars().all()]

    # Fetch catering restaurant menu items
    cat_stmt = select(MenuCategory).where(MenuCategory.restaurant_id == rest.id, MenuCategory.is_enabled == True).order_by(MenuCategory.sort_order.asc())
    cat_res = await db.execute(cat_stmt)
    categories = cat_res.scalars().all()

    item_stmt = select(MenuItem).where(MenuItem.restaurant_id == rest.id, MenuItem.is_available == True, MenuItem.deleted_at == None).order_by(MenuItem.name.asc())
    item_res = await db.execute(item_stmt)
    items = item_res.scalars().all()

    menu_categories = []
    for cat in categories:
        cat_items = [it for it in items if it.category_id == cat.id]
        menu_categories.append({
            "id": cat.id,
            "name": cat.name,
            "items": [
                {
                    "id": it.id,
                    "name": it.name,
                    "price": float(it.price or 0.0),
                    "description": it.description or "",
                    "isVegetarian": it.is_vegetarian,
                    "isAlcoholic": it.is_alcoholic,
                    "imageUrl": it.image_url or "",
                }
                for it in cat_items
            ]
        })

    # Fetch order count and total amount for this wedding event
    order_count = 0
    order_revenue = 0.0
    if ev:
        ord_stmt = select(func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0.0)).where(Order.event_id == ev.id)
        ord_res = await db.execute(ord_stmt)
        cnt, rev = ord_res.one()
        order_count = cnt or 0
        order_revenue = float(rev or 0.0)

    rest_slug = rest.public_slug or rest.slug or rest.id
    rest_data = {
        "id": rest.id,
        "name": rest.name,
        "slug": rest_slug,
        "phone": rest.phone or "",
        "address": getattr(rest, "address", "") or "",
        "currency": getattr(rest, "currency", "INR") or "INR",
    }

    event_data = {
        "id": ev.id if ev else None,
        "title": ev.title if ev else ws.name,
        "coupleNames": ev.couple_names if ev else "",
        "eventType": ev.event_type if ev else "WEDDING",
        "eventDate": ev.event_date if ev else "",
        "startTime": ev.start_time if ev else "18:00",
        "endTime": ev.end_time if ev else "23:30",
        "venueName": ev.venue_name if ev else rest.name,
        "welcomeMessage": ev.welcome_message if ev else "",
        "themeColor": ev.theme_color if ev else "champagne",
        "coverImageUrl": ev.cover_image_url if ev else "",
        "status": ev.status if ev else "DRAFT",
        "isOrderingOpen": ev.is_ordering_open if ev else False,
        "orderingEnabled": ev.is_ordering_open if ev else False,
        "menuSelectionType": ev.menu_selection_type if ev else "FULL_MENU",
        "allowedCategoryIds": ev.allowed_category_ids if ev else [],
        "allowedItemIds": ev.allowed_item_ids if ev else [],
        "estimatedGuestCount": ev.estimated_guest_count if ev else 100,
        "estimatedGuests": ev.estimated_guest_count if ev else 100,
        "orderCount": order_count,
        "orderRevenue": round(order_revenue, 2),
        "tableCount": len(tables),
    } if ev else None

    raw_items = [
        {
            "id": it.id,
            "name": it.name,
            "price": float(it.price or 0.0),
            "categoryId": it.category_id,
            "isVegetarian": it.is_vegetarian,
            "isAlcoholic": it.is_alcoholic,
        }
        for it in items
    ]

    return {
        "workspace": {
            "id": ws.id,
            "name": ws.name,
            "ownerEmail": ws.owner_email,
            "status": ws.status,
            "createdAt": ws.created_at.isoformat() if ws.created_at else None,
        },
        "restaurant": rest_data,
        "cateringRestaurant": rest_data,
        "event": event_data,
        "tables": tables,
        "availableMenu": menu_categories,
        "menuCategories": menu_categories,
        "rawItems": raw_items,
        "menuItems": raw_items,
    }


@weddings_router.put("/workspaces/{workspace_id}/event")
async def update_workspace_event(
    workspace_id: str,
    payload: UpdateWorkspaceEventSchema,
    email: Optional[str] = Query(None),
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    """
    Updates wedding event parameters from the organizer dashboard.
    """
    stmt = select(WeddingWorkspace).where(WeddingWorkspace.id == workspace_id)
    res = await db.execute(stmt)
    ws = res.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wedding workspace not found.")

    effective_email = (caller.email or email or "").strip().lower()
    is_authorized = (
        caller.is_admin or
        (effective_email and ws.owner_email.lower() == effective_email) or
        (caller.uid and ws.owner_uid and ws.owner_uid == caller.uid)
    )
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Not authorized to modify this workspace.")

    if not ws.event_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No primary event found for workspace.")

    ev_stmt = select(WeddingEvent).where(WeddingEvent.id == ws.event_id)
    ev_res = await db.execute(ev_stmt)
    ev = ev_res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Primary event record not found.")

    if payload.title is not None:
        ev.title = payload.title.strip()
        ws.name = payload.title.strip()
    if payload.coupleNames is not None:
        ev.couple_names = payload.coupleNames.strip()
    if payload.eventType is not None:
        ev.event_type = payload.eventType.strip()
    if payload.eventDate is not None:
        ev.event_date = payload.eventDate.strip()
    if payload.startTime is not None:
        ev.start_time = payload.startTime.strip()
    if payload.endTime is not None:
        ev.end_time = payload.endTime.strip()
    if payload.venueName is not None:
        ev.venue_name = payload.venueName.strip()
    if payload.welcomeMessage is not None:
        ev.welcome_message = payload.welcomeMessage.strip()
    if payload.themeColor is not None:
        ev.theme_color = payload.themeColor.strip()
    if payload.coverImageUrl is not None:
        ev.cover_image_url = payload.coverImageUrl.strip()
    if payload.status is not None:
        ev.status = payload.status.strip().upper()
    if payload.isOrderingOpen is not None:
        ev.is_ordering_open = payload.isOrderingOpen
    elif payload.orderingEnabled is not None:
        ev.is_ordering_open = payload.orderingEnabled
    if payload.menuSelectionType is not None:
        ev.menu_selection_type = payload.menuSelectionType.strip().upper()
    if payload.allowedCategoryIds is not None:
        ev.allowed_category_ids = payload.allowedCategoryIds
    if payload.allowedItemIds is not None:
        ev.allowed_item_ids = payload.allowedItemIds
    if payload.estimatedGuestCount is not None:
        ev.estimated_guest_count = max(1, payload.estimatedGuestCount)
    elif payload.estimatedGuests is not None:
        ev.estimated_guest_count = max(1, payload.estimatedGuests)
    if payload.notes is not None:
        ev.notes = payload.notes.strip()

    ev.updated_at = datetime.now(timezone.utc)
    ws.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "status": "success",
        "message": "Wedding event updated successfully.",
        "eventId": ev.id,
        "isOrderingOpen": ev.is_ordering_open,
        "orderingEnabled": ev.is_ordering_open,
        "event": {
            "id": ev.id,
            "title": ev.title,
            "coupleNames": ev.couple_names,
            "eventType": ev.event_type,
            "eventDate": ev.event_date,
            "startTime": ev.start_time,
            "endTime": ev.end_time,
            "venueName": ev.venue_name,
            "welcomeMessage": ev.welcome_message,
            "themeColor": ev.theme_color,
            "status": ev.status,
            "isOrderingOpen": ev.is_ordering_open,
            "orderingEnabled": ev.is_ordering_open,
            "estimatedGuestCount": ev.estimated_guest_count,
            "estimatedGuests": ev.estimated_guest_count,
        }
    }


@weddings_router.post("/workspaces/{workspace_id}/toggle-ordering")
async def toggle_workspace_ordering(
    workspace_id: str,
    email: Optional[str] = Query(None),
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    """
    Toggles wedding ordering availability (open or closed) from the organizer dashboard.
    """
    stmt = select(WeddingWorkspace).where(WeddingWorkspace.id == workspace_id)
    res = await db.execute(stmt)
    ws = res.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wedding workspace not found.")

    effective_email = (caller.email or email or "").strip().lower()
    is_authorized = (
        caller.is_admin or
        (effective_email and ws.owner_email.lower() == effective_email) or
        (caller.uid and ws.owner_uid and ws.owner_uid == caller.uid)
    )
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden.")

    ev_stmt = select(WeddingEvent).where(WeddingEvent.id == ws.event_id)
    ev_res = await db.execute(ev_stmt)
    ev = ev_res.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Primary event record not found.")

    ev.is_ordering_open = not ev.is_ordering_open
    ev.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "status": "success",
        "isOrderingOpen": ev.is_ordering_open,
        "orderingEnabled": ev.is_ordering_open,
        "message": f"Ordering {'opened' if ev.is_ordering_open else 'paused'} for this wedding."
    }


@weddings_router.post("/workspaces/{workspace_id}/tables", status_code=status.HTTP_201_CREATED)
async def add_workspace_table(
    workspace_id: str,
    payload: AddWorkspaceTableSchema,
    email: Optional[str] = Query(None),
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    """
    Adds a new event table and generates its persistent QR URL.
    """
    stmt = select(WeddingWorkspace).where(WeddingWorkspace.id == workspace_id)
    res = await db.execute(stmt)
    ws = res.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wedding workspace not found.")

    effective_email = (caller.email or email or "").strip().lower()
    is_authorized = (
        caller.is_admin or
        (effective_email and ws.owner_email.lower() == effective_email)
    )
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden.")

    clean_table = (payload.tableNumber or payload.table_number or "").strip()
    if not clean_table:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Table number is required.")

    # Check duplicate
    dup_stmt = select(EventTable).where(EventTable.event_id == ws.event_id, EventTable.table_number == clean_table)
    dup_res = await db.execute(dup_stmt)
    if dup_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Table {clean_table} already exists for this event.")

    r_stmt = select(Restaurant).where(Restaurant.id == ws.restaurant_id)
    r_res = await db.execute(r_stmt)
    rest = r_res.scalar_one_or_none()
    rest_slug = (rest.public_slug or rest.slug or rest.id) if rest else ws.restaurant_id

    clean_label = (payload.tableLabel or payload.table_label or payload.label or f"Table {clean_table}").strip()
    clean_capacity = max(1, payload.capacity or 8)

    table_id = f"etbl-{ws.event_id}-{clean_table}"
    qr_url = f"https://{rest_slug}.dinely.food/event/{ws.event_id}?table={clean_table}"

    new_table = EventTable(
        id=table_id,
        event_id=ws.event_id,
        restaurant_id=ws.restaurant_id,
        table_number=clean_table,
        table_label=clean_label,
        capacity=clean_capacity,
        qr_code_url=qr_url,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    db.add(new_table)
    await db.commit()
    await db.refresh(new_table)

    return {"status": "success", "table": _format_table(new_table), "qrUrl": qr_url}


@weddings_router.delete("/workspaces/{workspace_id}/tables/{table_id}")
async def delete_workspace_table(
    workspace_id: str,
    table_id: str,
    email: Optional[str] = Query(None),
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    """
    Deletes an event table from the workspace.
    """
    stmt = select(WeddingWorkspace).where(WeddingWorkspace.id == workspace_id)
    res = await db.execute(stmt)
    ws = res.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wedding workspace not found.")

    effective_email = (caller.email or email or "").strip().lower()
    is_authorized = (
        caller.is_admin or
        (effective_email and ws.owner_email.lower() == effective_email)
    )
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden.")

    t_stmt = select(EventTable).where(EventTable.id == table_id, EventTable.event_id == ws.event_id)
    t_res = await db.execute(t_stmt)
    tbl = t_res.scalar_one_or_none()
    if not tbl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found.")

    await db.delete(tbl)
    await db.commit()

    return {"status": "success", "message": f"Table {tbl.table_number} removed successfully."}


@weddings_router.get("/workspaces/{workspace_id}/orders")
async def get_workspace_orders(
    workspace_id: str,
    email: Optional[str] = Query(None),
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns live orders placed for this specific wedding event.
    """
    stmt = select(WeddingWorkspace).where(WeddingWorkspace.id == workspace_id)
    res = await db.execute(stmt)
    ws = res.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wedding workspace not found.")

    effective_email = (caller.email or email or "").strip().lower()
    is_authorized = (
        caller.is_admin or
        (effective_email and ws.owner_email.lower() == effective_email)
    )
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden.")

    if not ws.event_id:
        return {"orders": []}

    ord_stmt = select(Order).where(Order.event_id == ws.event_id).order_by(Order.created_at.desc())
    ord_res = await db.execute(ord_stmt)
    orders = ord_res.scalars().all()

    result = []
    for o in orders:
        result.append({
            "id": o.id,
            "orderNumber": o.order_number or f"#{o.id[-4:]}",
            "tableNumber": o.table_number,
            "customerName": o.customer_name,
            "status": o.status,
            "kitchenStatus": o.kitchen_status or o.status,
            "barStatus": o.bar_status or "PENDING",
            "items": o.items_json or [],
            "itemsJson": o.items_json or [],
            "totalAmount": float(o.total_amount or 0.0),
            "notes": o.notes or "",
            "createdAt": o.created_at.isoformat() if o.created_at else None,
        })

    return {"orders": result}


@weddings_router.get("/workspaces/{workspace_id}/reports")
async def get_workspace_reports(
    workspace_id: str,
    email: Optional[str] = Query(None),
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns analytical event statistics: courses served, item popularity, table activity.
    """
    stmt = select(WeddingWorkspace).where(WeddingWorkspace.id == workspace_id)
    res = await db.execute(stmt)
    ws = res.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wedding workspace not found.")

    effective_email = (caller.email or email or "").strip().lower()
    is_authorized = (
        caller.is_admin or
        (effective_email and ws.owner_email.lower() == effective_email)
    )
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden.")

    if not ws.event_id:
        return {"totalOrders": 0, "totalRevenue": 0.0, "totalAmount": 0.0, "totalGuests": 0, "dishesServed": 0, "itemBreakdown": [], "tableActivity": []}

    ord_stmt = select(Order).where(Order.event_id == ws.event_id)
    ord_res = await db.execute(ord_stmt)
    orders = ord_res.scalars().all()

    dish_counts = {}
    table_counts = {}
    total_dishes = 0
    total_revenue = 0.0

    for o in orders:
        total_revenue += float(o.total_amount or 0.0)
        t_num = o.table_number or "01"
        table_counts[t_num] = table_counts.get(t_num, 0) + 1
        items = o.items_json or []
        for it in items:
            name = it.get("name") or "Course"
            qty = it.get("quantity") or 1
            dish_counts[name] = dish_counts.get(name, 0) + qty
            total_dishes += qty

    popular_dishes = sorted(
        [{"name": k, "count": v} for k, v in dish_counts.items()],
        key=lambda x: x["count"],
        reverse=True
    )

    table_activity = sorted(
        [{"tableNumber": k, "orders": v} for k, v in table_counts.items()],
        key=lambda x: x["orders"],
        reverse=True
    )

    formatted_rev = round(total_revenue, 2)
    return {
        "totalOrders": len(orders),
        "totalRevenue": formatted_rev,
        "totalAmount": formatted_rev,
        "dishesServed": total_dishes,
        "popularDishes": popular_dishes,
        "tableActivity": table_activity
    }

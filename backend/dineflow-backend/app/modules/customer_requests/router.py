import asyncio
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database.connection import get_db
from app.modules.customer_requests.models import CustomerRequestModel
from app.modules.restaurants.models import Restaurant
from app.modules.websocket.manager import ws_manager

router = APIRouter()

class CreateCustomerRequestSchema(BaseModel):
    restaurantId: str
    tableNumber: str
    tableId: Optional[str] = None
    requestType: Optional[str] = "WATER"
    customTitle: Optional[str] = None
    message: Optional[str] = None
    customerNotes: Optional[str] = None
    priority: Optional[str] = "MEDIUM"
    tableSessionId: Optional[str] = None

class UpdateCustomerRequestSchema(BaseModel):
    status: str
    waiterName: Optional[str] = None

def format_request_dict(req: CustomerRequestModel) -> dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    iso_time = req.created_at.isoformat() if getattr(req, "created_at", None) else now_iso
    return {
        "id": req.id,
        "restaurantId": req.restaurant_id,
        "restaurant_id": req.restaurant_id,
        "tableId": req.table_id,
        "table_id": req.table_id,
        "tableNumber": req.table_number,
        "table_number": req.table_number,
        "requestType": req.request_type,
        "request_type": req.request_type,
        "customTitle": req.message if req.message else req.request_type.replace("_", " ").title(),
        "message": req.message,
        "customerNotes": req.message,
        "status": req.status,
        "priority": "HIGH" if req.request_type in ["BILL", "CALL_WAITER"] else "MEDIUM",
        "waiterName": req.waiter_name,
        "assignedWaiterName": req.waiter_name,
        "tableSessionId": req.table_session_id,
        "table_session_id": req.table_session_id,
        "requestedAt": iso_time,
        "timestamp": iso_time,
        "created_at": iso_time,
    }

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_customer_request(payload: CreateCustomerRequestSchema, db: AsyncSession = Depends(get_db)):
    if not payload.restaurantId:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="restaurantId is required")
    if not payload.tableNumber:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tableNumber is required")

    # Tenant verification
    rest_chk = await db.execute(select(Restaurant).where(Restaurant.id == payload.restaurantId))
    rest = rest_chk.scalar_one_or_none()
    if rest and (rest.deleted_at is not None or rest.lifecycle_status == "ARCHIVED"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant is archived or inactive")

    now_utc = datetime.now(timezone.utc)
    req_id = f"req-{int(now_utc.timestamp() * 1000)}"
    req_type = (payload.requestType or "WATER").upper()
    title = payload.customTitle or req_type.replace("_", " ").title()
    msg = payload.message or payload.customerNotes or f"Table {payload.tableNumber} requested: {title}"

    session_id = payload.tableSessionId
    if not session_id and (payload.tableId or payload.tableNumber):
        from app.modules.tables.models import TableSession
        query_sess = select(TableSession).where(
            (TableSession.restaurant_id == payload.restaurantId) &
            ((TableSession.table_id == payload.tableId) | (TableSession.table_number == payload.tableNumber)) &
            (TableSession.status == "ACTIVE")
        )
        res_sess = await db.execute(query_sess)
        active_sess = res_sess.scalars().first()
        if active_sess:
            session_id = active_sess.id

    new_req = CustomerRequestModel(
        id=req_id,
        restaurant_id=payload.restaurantId,
        table_id=payload.tableId,
        table_number=payload.tableNumber,
        request_type=req_type,
        message=msg,
        status="PENDING",
        table_session_id=session_id,
    )

    db.add(new_req)
    await db.commit()
    await db.refresh(new_req)

    req_dict = format_request_dict(new_req)

    # Realtime Broadcast to Waiter and Owner terminals (non-blocking)
    asyncio.create_task(ws_manager.broadcast_event(
        restaurant_id=payload.restaurantId,
        event_type="service_request_created",
        payload=req_dict,
        target_audience=["WAITER", "OWNER"]
    ))

    return req_dict

@router.get("")
async def get_customer_requests(
    restaurant_id: str,
    status_filter: Optional[str] = None,
    active_only: bool = False,
    table_id: Optional[str] = None,
    table_session_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(CustomerRequestModel).where(CustomerRequestModel.restaurant_id == restaurant_id)
    if status_filter:
        query = query.where(CustomerRequestModel.status == status_filter)
    elif active_only:
        query = query.where(CustomerRequestModel.status.in_(["PENDING", "IN_PROGRESS", "ACCEPTED"]))
    if table_session_id:
        query = query.where(CustomerRequestModel.table_session_id == table_session_id)
    elif table_id:
        query = query.where(
            (CustomerRequestModel.table_id == table_id) |
            (CustomerRequestModel.table_number == table_id)
        )
    query = query.order_by(CustomerRequestModel.created_at.desc())
    result = await db.execute(query)
    reqs = result.scalars().all()

    if active_only and not table_session_id:
        from app.modules.tables.models import TableSession
        res_active = await db.execute(
            select(TableSession).where(
                (TableSession.restaurant_id == restaurant_id) &
                (TableSession.status == "ACTIVE")
            )
        )
        active_sessions = res_active.scalars().all()
        active_session_ids = {s.id for s in active_sessions}
        active_table_ids = {s.table_id for s in active_sessions if s.table_id}
        active_table_numbers = {s.table_number for s in active_sessions if s.table_number}

        filtered = []
        for req in reqs:
            if req.table_session_id and req.table_session_id in active_session_ids:
                filtered.append(req)
                continue
            req_table_id = req.table_id
            req_table_num = req.table_number
            if req_table_id and req_table_id in active_table_ids:
                filtered.append(req)
                continue
            if req_table_num and req_table_num in active_table_numbers:
                filtered.append(req)
        reqs = filtered

    return [format_request_dict(r) for r in reqs]


from app.core.security.tenant_auth import get_caller_context, CallerContext

@router.patch("/{request_id}")
async def update_customer_request(
    request_id: str,
    payload: UpdateCustomerRequestSchema,
    caller: CallerContext = Depends(get_caller_context),
    db: AsyncSession = Depends(get_db)
):
    query = select(CustomerRequestModel).where(CustomerRequestModel.id == request_id)
    result = await db.execute(query)
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    if not caller.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to update service requests"
        )

    if not caller.is_admin:
        if caller.role in ["OWNER", "RESTAURANT_OWNER"]:
            res_r = await db.execute(select(Restaurant).where(Restaurant.id == req.restaurant_id))
            r_obj = res_r.scalar_one_or_none()
            if not r_obj or not (
                (caller.uid and r_obj.owner_uid == caller.uid) or
                (caller.email and r_obj.owner_email and caller.email.lower() == r_obj.owner_email.lower())
            ):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Not authorized for this restaurant")
        elif caller.role in ["WAITER", "SERVER", "HOST", "CHEF", "COOK", "KITCHEN", "BAR", "BARTENDER", "MANAGER"]:
            if caller.restaurant_id and caller.restaurant_id != req.restaurant_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Staff does not belong to this restaurant")
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Role not authorized to update service requests")

    new_status = payload.status.upper()
    current_status = req.status.upper()

    # Enforce Canonical State Machine: PENDING -> ACCEPTED/IN_PROGRESS -> COMPLETED
    if current_status == "COMPLETED" and new_status != "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state transition: Request {request_id} is already COMPLETED and cannot revert to {new_status}"
        )

    # Normalize ACCEPTED to IN_PROGRESS for consistency
    if new_status == "ACCEPTED":
        new_status = "IN_PROGRESS"

    req.status = new_status
    if payload.waiterName:
        req.waiter_name = payload.waiterName

    await db.commit()
    await db.refresh(req)

    req_dict = format_request_dict(req)

    # Realtime Broadcast update to Waiter, Customer, and Owner (non-blocking)
    asyncio.create_task(ws_manager.broadcast_event(
        restaurant_id=req.restaurant_id,
        event_type="service_request_updated",
        payload=req_dict,
        target_audience=["WAITER", "CUSTOMER", "OWNER"]
    ))

    return req_dict

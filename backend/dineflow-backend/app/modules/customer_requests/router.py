from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database.connection import get_db
from app.modules.customer_requests.models import CustomerRequestModel
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
    iso_time = req.created_at.isoformat() if getattr(req, "created_at", None) else datetime.utcnow().isoformat()
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

    req_id = f"req-{int(datetime.utcnow().timestamp() * 1000)}"
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

    # Realtime Broadcast to Waiter and Owner terminals
    try:
        await ws_manager.broadcast_event(
            restaurant_id=payload.restaurantId,
            event_type="service_request_created",
            payload=req_dict,
            target_audience=["WAITER", "OWNER"]
        )
    except Exception as ws_err:
        print("[WS_BROADCAST_NOTICE] service_request_created:", ws_err)

    return req_dict

@router.get("")
async def get_customer_requests(
    restaurant_id: str,
    status_filter: Optional[str] = None,
    table_id: Optional[str] = None,
    table_session_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(CustomerRequestModel).where(CustomerRequestModel.restaurant_id == restaurant_id)
    if status_filter:
        query = query.where(CustomerRequestModel.status == status_filter)
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
    return [format_request_dict(r) for r in reqs]


@router.patch("/{request_id}")
async def update_customer_request(request_id: str, payload: UpdateCustomerRequestSchema, db: AsyncSession = Depends(get_db)):
    query = select(CustomerRequestModel).where(CustomerRequestModel.id == request_id)
    result = await db.execute(query)
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

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

    # Realtime Broadcast update to Waiter, Customer, and Owner
    try:
        await ws_manager.broadcast_event(
            restaurant_id=req.restaurant_id,
            event_type="service_request_updated",
            payload=req_dict,
            target_audience=["WAITER", "CUSTOMER", "OWNER"]
        )
    except Exception as ws_err:
        print("[WS_BROADCAST_NOTICE] service_request_updated:", ws_err)

    return req_dict

from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database.connection import get_db
from app.modules.customer_requests.models import CustomerRequestModel

router = APIRouter()

class CreateCustomerRequestSchema(BaseModel):
    restaurantId: str
    tableNumber: str
    requestType: Optional[str] = "WATER"
    message: Optional[str] = None
    tableSessionId: Optional[str] = None

class UpdateCustomerRequestSchema(BaseModel):
    status: str
    waiterName: Optional[str] = None

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_customer_request(payload: CreateCustomerRequestSchema, db: AsyncSession = Depends(get_db)):
    req_id = f"req-{int(datetime.utcnow().timestamp() * 1000)}"
    msg = payload.message or f"Table {payload.tableNumber} called waiter: {payload.requestType}"

    new_req = CustomerRequestModel(
        id=req_id,
        restaurant_id=payload.restaurantId,
        table_number=payload.tableNumber,
        request_type=payload.requestType or "WATER",
        message=msg,
        status="PENDING",
        table_session_id=payload.tableSessionId,
    )
    db.add(new_req)
    await db.commit()
    await db.refresh(new_req)
    return {
        "id": new_req.id,
        "restaurantId": new_req.restaurant_id,
        "tableNumber": new_req.table_number,
        "requestType": new_req.request_type,
        "message": new_req.message,
        "status": new_req.status,
        "waiterName": new_req.waiter_name,
        "timestamp": "Just now",
    }

@router.get("")
async def get_customer_requests(restaurant_id: str, status_filter: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(CustomerRequestModel).where(CustomerRequestModel.restaurant_id == restaurant_id)
    if status_filter:
        query = query.where(CustomerRequestModel.status == status_filter)
    query = query.order_by(CustomerRequestModel.created_at.desc())
    result = await db.execute(query)
    reqs = result.scalars().all()
    return [
        {
            "id": r.id,
            "restaurantId": r.restaurant_id,
            "tableNumber": r.table_number,
            "requestType": r.request_type,
            "message": r.message,
            "status": r.status,
            "waiterName": r.waiter_name,
            "timestamp": r.created_at.isoformat() if r.created_at else "Just now",
        }
        for r in reqs
    ]

@router.patch("/{request_id}")
async def update_customer_request(request_id: str, payload: UpdateCustomerRequestSchema, db: AsyncSession = Depends(get_db)):
    query = select(CustomerRequestModel).where(CustomerRequestModel.id == request_id)
    result = await db.execute(query)
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    req.status = payload.status
    if payload.waiterName:
        req.waiter_name = payload.waiterName
    await db.commit()
    await db.refresh(req)
    return {
        "id": req.id,
        "restaurantId": req.restaurant_id,
        "tableNumber": req.table_number,
        "requestType": req.request_type,
        "message": req.message,
        "status": req.status,
        "waiterName": req.waiter_name,
    }

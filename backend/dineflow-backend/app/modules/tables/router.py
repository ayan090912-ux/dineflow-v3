from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database.connection import get_db
from app.modules.tables.models import Table, TableSession

router = APIRouter()

class CreateTableSchema(BaseModel):
    id: Optional[str] = None
    tableNumber: str
    section: Optional[str] = "Main Hall"
    capacity: Optional[int] = 4

@router.get("/{restaurant_id}/tables")
async def get_tables(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Table).where(Table.restaurant_id == restaurant_id).order_by(Table.table_number)
    result = await db.execute(query)
    tables = result.scalars().all()
    return tables

@router.post("/{restaurant_id}/tables", status_code=status.HTTP_201_CREATED)
async def create_table(restaurant_id: str, payload: CreateTableSchema, db: AsyncSession = Depends(get_db)):
    t_num = payload.tableNumber
    t_id = payload.id or f"tbl-{restaurant_id}-{t_num.lower().replace(' ', '_')}"

    query_existing = select(Table).where((Table.id == t_id) | ((Table.restaurant_id == restaurant_id) & (Table.table_number == t_num)))
    res_existing = await db.execute(query_existing)
    existing = res_existing.scalar_one_or_none()

    if existing:
        if payload.section:
            existing.section = payload.section
        if payload.capacity:
            existing.capacity = payload.capacity
        await db.commit()
        await db.refresh(existing)
        return existing

    new_tbl = Table(
        id=t_id,
        restaurant_id=restaurant_id,
        table_number=t_num,
        section=payload.section or "Main Hall",
        capacity=payload.capacity or 4,
        status="AVAILABLE",
        is_occupied=False,
        qr_code_url=f"https://dinely.food/customer?restaurant={restaurant_id}&tableId={t_id}&table={t_num}"
    )
    db.add(new_tbl)
    await db.commit()
    await db.refresh(new_tbl)
    return new_tbl

@router.get("/{restaurant_id}/tables/{table_id}/session")
async def get_or_create_table_session(restaurant_id: str, table_id: str, table_number: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query_tbl = select(Table).where((Table.id == table_id) | (Table.table_number == table_number))
    res_tbl = await db.execute(query_tbl)
    tbl = res_tbl.scalar_one_or_none()
    
    resolved_tbl_id = tbl.id if tbl else table_id
    resolved_tbl_num = tbl.table_number if tbl else (table_number or "Table 01")

    query_sess = select(TableSession).where(
        (TableSession.restaurant_id == restaurant_id) &
        (TableSession.table_id == resolved_tbl_id) &
        (TableSession.status == "ACTIVE")
    )
    res_sess = await db.execute(query_sess)
    active_sess = res_sess.scalar_one_or_none()

    if active_sess:
        return active_sess

    # Create new active session
    new_sess = TableSession(
        id=f"sess-{restaurant_id}-{resolved_tbl_id}-{int(datetime.utcnow().timestamp() * 1000)}",
        restaurant_id=restaurant_id,
        table_id=resolved_tbl_id,
        table_number=resolved_tbl_num,
        status="ACTIVE",
        session_started_at=datetime.utcnow(),
    )
    db.add(new_sess)

    if tbl:
        tbl.status = "OCCUPIED"
        tbl.is_occupied = True
        tbl.active_session_id = new_sess.id

    await db.commit()
    await db.refresh(new_sess)
    return new_sess

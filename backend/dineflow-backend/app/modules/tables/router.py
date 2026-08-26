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

    # Query active table sessions for this restaurant to enforce single source of truth
    query_active_sessions = select(TableSession).where(
        (TableSession.restaurant_id == restaurant_id) &
        (TableSession.status == "ACTIVE")
    )
    res_active = await db.execute(query_active_sessions)
    active_sessions = res_active.scalars().all()

    active_tbl_ids = {s.table_id for s in active_sessions}
    active_tbl_nums = {s.table_number for s in active_sessions}

    # Dynamically update table status based strictly on active customer session
    modified = False
    for tbl in tables:
        is_session_active = (tbl.id in active_tbl_ids) or (tbl.table_number in active_tbl_nums)
        if is_session_active:
            if tbl.status == "AVAILABLE" or not tbl.is_occupied:
                tbl.status = "OCCUPIED"
                tbl.is_occupied = True
                modified = True
        else:
            if tbl.status != "AVAILABLE" or tbl.is_occupied:
                tbl.status = "AVAILABLE"
                tbl.is_occupied = False
                tbl.active_session_id = None
                modified = True

    if modified:
        await db.commit()

    return tables

@router.get("/{restaurant_id}/active-sessions")
async def get_active_table_sessions(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    query = select(TableSession).where(
        (TableSession.restaurant_id == restaurant_id) &
        (TableSession.status == "ACTIVE")
    ).order_by(TableSession.session_started_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

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

@router.delete("/{restaurant_id}/tables/{table_id}")
async def delete_table(restaurant_id: str, table_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Table).where(
        (Table.restaurant_id == restaurant_id) &
        ((Table.id == table_id) | (Table.table_number == table_id))
    )
    result = await db.execute(query)
    tbls = result.scalars().all()
    if not tbls:
        return {"status": "success", "message": "Table already removed"}
    
    for tbl in tbls:
        await db.delete(tbl)
    await db.commit()
    return {"status": "success", "message": "Table deleted successfully"}

@router.get("/{restaurant_id}/tables/{table_id}/session")
async def get_or_create_table_session(restaurant_id: str, table_id: str, table_number: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query_tbl = select(Table).where(
        (Table.restaurant_id == restaurant_id) &
        ((Table.id == table_id) | (Table.table_number == table_number))
    )
    res_tbl = await db.execute(query_tbl)
    tbls = res_tbl.scalars().all()
    tbl = tbls[0] if tbls else None
    
    resolved_tbl_id = tbl.id if tbl else table_id
    resolved_tbl_num = tbl.table_number if tbl else (table_number or "Table 01")

    query_sess = select(TableSession).where(
        (TableSession.restaurant_id == restaurant_id) &
        ((TableSession.table_id == resolved_tbl_id) | (TableSession.table_number == resolved_tbl_num)) &
        (TableSession.status == "ACTIVE")
    ).order_by(TableSession.session_started_at.desc())
    res_sess = await db.execute(query_sess)
    active_sesses = res_sess.scalars().all()

    # Enforce SINGLE ACTIVE SESSION per (restaurant_id, table_id). If multiple exist, keep latest and close older duplicates.
    if active_sesses:
        active_sess = active_sesses[0]
        if len(active_sesses) > 1:
            for extra in active_sesses[1:]:
                extra.status = "CLOSED"
                extra.session_closed_at = datetime.utcnow()
            await db.commit()

        if tbl and (tbl.status != "OCCUPIED" or not tbl.is_occupied):
            tbl.status = "OCCUPIED"
            tbl.is_occupied = True
            tbl.active_session_id = active_sess.id
            await db.commit()

        return active_sess

    # Create new active session
    new_sess = TableSession(
        id=f"sess-{int(datetime.utcnow().timestamp() * 1000)}",
        restaurant_id=restaurant_id,
        table_id=resolved_tbl_id,
        table_number=resolved_tbl_num,
        status="ACTIVE",
        session_started_at=datetime.utcnow(),
    )
    db.add(new_sess)

    if not tbl:
        tbl = Table(
            id=resolved_tbl_id,
            restaurant_id=restaurant_id,
            table_number=resolved_tbl_num,
            section="Main Hall",
            capacity=4,
            status="OCCUPIED",
            is_occupied=True,
            qr_code_url=f"https://dinely.food/customer?restaurant={restaurant_id}&tableId={resolved_tbl_id}&table={resolved_tbl_num}"
        )
        db.add(tbl)
    else:
        tbl.status = "OCCUPIED"
        tbl.is_occupied = True

    tbl.active_session_id = new_sess.id
    await db.commit()
    await db.refresh(new_sess)

    try:
        from app.modules.websocket.manager import ws_manager
        await ws_manager.broadcast_event(
            restaurant_id=restaurant_id,
            event_type="table_status_updated",
            payload={"table_id": resolved_tbl_id, "table_number": resolved_tbl_num, "status": "OCCUPIED", "session_id": new_sess.id},
            target_audience=["WAITER", "CUSTOMER", "OWNER"]
        )
    except Exception:
        pass

    return new_sess

@router.post("/{restaurant_id}/tables/{table_id}/close-session")
@router.post("/{restaurant_id}/tables/{table_id}/close")
@router.post("/tables/{table_id}/close-session")
async def close_table_session(
    table_id: str,
    restaurant_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    query_tbl = select(Table).where(
        ((Table.id == table_id) | (Table.table_number == table_id))
    )
    if restaurant_id:
        query_tbl = query_tbl.where(Table.restaurant_id == restaurant_id)

    res_tbl = await db.execute(query_tbl)
    tbls = res_tbl.scalars().all()
    tbl = tbls[0] if tbls else None

    if not tbl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")

    rest_id = tbl.restaurant_id

    query_sess = select(TableSession).where(
        (TableSession.restaurant_id == rest_id) &
        ((TableSession.table_id == tbl.id) | (TableSession.table_number == tbl.table_number)) &
        (TableSession.status == "ACTIVE")
    )
    res_sess = await db.execute(query_sess)
    active_sesses = res_sess.scalars().all()

    closed_session_ids = []
    for sess in active_sesses:
        sess.status = "CLOSED"
        sess.session_closed_at = datetime.utcnow()
        closed_session_ids.append(sess.id)

    tbl.status = "AVAILABLE"
    tbl.is_occupied = False
    tbl.active_session_id = None

    # Clean up pending service requests associated with this table
    try:
        from app.modules.customer_requests.models import CustomerRequestModel
        query_reqs = select(CustomerRequestModel).where(
            (CustomerRequestModel.restaurant_id == rest_id) &
            ((CustomerRequestModel.table_id == tbl.id) | (CustomerRequestModel.table_number == tbl.table_number)) &
            (CustomerRequestModel.status.in_(["PENDING", "IN_PROGRESS"]))
        )
        res_reqs = await db.execute(query_reqs)
        active_reqs = res_reqs.scalars().all()
        for req in active_reqs:
            req.status = "COMPLETED"
    except Exception as req_err:
        print("[SERVICE_REQUEST_CLEANUP_NOTICE]:", req_err)

    await db.commit()

    event_payload = {
        "table_id": tbl.id,
        "table_number": tbl.table_number,
        "status": "VACANT",
        "closed_session_ids": closed_session_ids,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

    try:
        from app.modules.websocket.manager import ws_manager
        await ws_manager.broadcast_event(
            restaurant_id=rest_id,
            event_type="table_session_closed",
            payload=event_payload,
            target_audience=["WAITER", "CUSTOMER", "OWNER"]
        )
        await ws_manager.broadcast_event(
            restaurant_id=rest_id,
            event_type="table_status_updated",
            payload=event_payload,
            target_audience=["WAITER", "CUSTOMER", "OWNER"]
        )
    except Exception as ws_err:
        print("[WS_BROADCAST_NOTICE] close_table_session:", ws_err)

    return {
        "status": "success",
        "message": f"Table {tbl.table_number} session closed successfully",
        "table_id": tbl.id,
        "closed_session_ids": closed_session_ids
    }



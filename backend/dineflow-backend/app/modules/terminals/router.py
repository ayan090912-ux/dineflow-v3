import uuid
import logging
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database.connection import get_db
from app.core.security.tenant_auth import (
    CallerContext,
    require_tenant_owner_or_admin,
    require_tenant_staff_or_owner,
)
from app.modules.terminals.models import Terminal
from app.modules.restaurants.models import Restaurant
from app.modules.websocket.manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter()

class CreateTerminalSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    terminalCode: Optional[str] = None
    terminal_code: Optional[str] = None
    terminalType: Optional[str] = "WAITER"
    terminal_type: Optional[str] = "WAITER"
    deviceInfo: Optional[str] = None
    device_info: Optional[str] = None
    pairingCode: Optional[str] = None
    pairing_code: Optional[str] = None
    status: Optional[str] = "ACTIVE"

class UpdateTerminalSchema(BaseModel):
    name: Optional[str] = None
    terminalType: Optional[str] = None
    terminal_type: Optional[str] = None
    deviceInfo: Optional[str] = None
    device_info: Optional[str] = None
    status: Optional[str] = None
    isActive: Optional[bool] = None
    is_active: Optional[bool] = None

def _format_terminal(t: Terminal) -> dict:
    return {
        "id": t.id,
        "restaurantId": t.restaurant_id,
        "name": t.name,
        "terminalCode": t.terminal_code,
        "terminalType": t.terminal_type,
        "status": t.status,
        "deviceInfo": t.device_info,
        "pairingCode": t.pairing_code,
        "ipAddress": t.ip_address,
        "isActive": t.is_active,
        "lastActiveAt": t.last_active_at.isoformat() if t.last_active_at else None,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
        "updatedAt": t.updated_at.isoformat() if t.updated_at else None,
    }

@router.get("/{restaurant_id}/terminals")
async def get_restaurant_terminals(
    restaurant_id: str,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(Terminal).where(Terminal.restaurant_id == canonical_id).order_by(Terminal.created_at.asc())
    res = await db.execute(stmt)
    terminals = res.scalars().all()
    return [_format_terminal(t) for t in terminals]

@router.post("/{restaurant_id}/terminals", status_code=status.HTTP_201_CREATED)
async def create_restaurant_terminal(
    restaurant_id: str,
    payload: CreateTerminalSchema,
    request: Request,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    clean_name = payload.name.strip()
    raw_code = payload.terminalCode or payload.terminal_code
    clean_type = (payload.terminalType or payload.terminal_type or "WAITER").strip().upper()

    if not raw_code:
        # Auto-generate a deterministic clean code based on type and existing count
        count_stmt = select(func.count(Terminal.id)).where(
            Terminal.restaurant_id == canonical_id,
            Terminal.terminal_type == clean_type
        )
        count_res = await db.execute(count_stmt)
        type_count = count_res.scalar() or 0
        raw_code = f"{clean_type}-{str(type_count + 1).zfill(2)}"

    clean_code = raw_code.strip().upper()

    # Check for duplicate terminal code within this tenant
    dup_stmt = select(Terminal).where(
        Terminal.restaurant_id == canonical_id,
        func.upper(Terminal.terminal_code) == clean_code
    )
    dup_res = await db.execute(dup_stmt)
    if dup_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Terminal with code '{clean_code}' is already registered for this restaurant."
        )

    term_id = f"term-{canonical_id}-{uuid.uuid4().hex[:8]}"
    client_ip = request.client.host if request.client else None

    new_term = Terminal(
        id=term_id,
        restaurant_id=canonical_id,
        name=clean_name,
        terminal_code=clean_code,
        terminal_type=clean_type,
        device_info=payload.deviceInfo or payload.device_info,
        pairing_code=payload.pairingCode or payload.pairing_code or uuid.uuid4().hex[:6].upper(),
        status=(payload.status or "ACTIVE").strip().upper(),
        ip_address=client_ip,
        last_active_at=datetime.now(timezone.utc),
        is_active=True,
    )
    db.add(new_term)
    await db.commit()
    await db.refresh(new_term)

    # Real-Time Event Broadcast to Owner and Staff Terminals
    now_utc = datetime.now(timezone.utc)
    event_id = f"evt-term-{int(now_utc.timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
    
    # Query restaurant name for rich notification
    r_stmt = select(Restaurant.name).where(Restaurant.id == canonical_id)
    r_res = await db.execute(r_stmt)
    r_name = r_res.scalar_one_or_none() or "Restaurant"

    event_payload = {
        "eventId": event_id,
        "type": "terminal_registered",
        "restaurantId": canonical_id,
        "restaurantName": r_name,
        "terminalId": new_term.id,
        "terminalCode": new_term.terminal_code,
        "terminalName": new_term.name,
        "terminalType": new_term.terminal_type,
        "status": new_term.status,
        "isActive": new_term.is_active,
        "timestamp": now_utc.isoformat(),
        "message": f"New terminal registered: {new_term.name} ({new_term.terminal_code})"
    }

    try:
        await ws_manager.broadcast_event(
            restaurant_id=canonical_id,
            event_type="terminal_registered",
            payload=event_payload,
            target_audience=["OWNER", "WAITER", "MANAGER"]
        )
    except Exception as ws_err:
        logger.warning(f"[WS_BROADCAST_NOTICE] terminal_registered: {ws_err}")

    return _format_terminal(new_term)

@router.put("/{restaurant_id}/terminals/{terminal_id}")
async def update_restaurant_terminal(
    restaurant_id: str,
    terminal_id: str,
    payload: UpdateTerminalSchema,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(Terminal).where(
        Terminal.restaurant_id == canonical_id,
        (Terminal.id == terminal_id) | (Terminal.terminal_code == terminal_id)
    )
    res = await db.execute(stmt)
    term = res.scalar_one_or_none()
    if not term:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Terminal not found.")

    if payload.name is not None:
        term.name = payload.name.strip()
    clean_type = payload.terminalType or payload.terminal_type
    if clean_type is not None:
        term.terminal_type = clean_type.strip().upper()
    info = payload.deviceInfo or payload.device_info
    if info is not None:
        term.device_info = info
    if payload.status is not None:
        term.status = payload.status.strip().upper()
    act = payload.isActive if payload.isActive is not None else payload.is_active
    if act is not None:
        term.is_active = act

    await db.commit()
    await db.refresh(term)
    return _format_terminal(term)

@router.delete("/{restaurant_id}/terminals/{terminal_id}")
async def delete_restaurant_terminal(
    restaurant_id: str,
    terminal_id: str,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(Terminal).where(
        Terminal.restaurant_id == canonical_id,
        (Terminal.id == terminal_id) | (Terminal.terminal_code == terminal_id)
    )
    res = await db.execute(stmt)
    term = res.scalar_one_or_none()
    if not term:
        return {"status": "success", "message": "Terminal already removed."}

    await db.delete(term)
    await db.commit()
    return {"status": "success", "message": "Terminal deleted successfully."}

@router.post("/{restaurant_id}/terminals/{terminal_id}/heartbeat")
async def terminal_heartbeat(
    restaurant_id: str,
    terminal_id: str,
    request: Request,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    from app.core.tenant.resolver import resolve_canonical_restaurant_id
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except Exception:
        canonical_id = restaurant_id

    stmt = select(Terminal).where(
        Terminal.restaurant_id == canonical_id,
        (Terminal.id == terminal_id) | (Terminal.terminal_code == terminal_id)
    )
    res = await db.execute(stmt)
    term = res.scalar_one_or_none()
    if not term:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Terminal not found.")

    term.last_active_at = datetime.now(timezone.utc)
    term.status = "ACTIVE"
    if request.client:
        term.ip_address = request.client.host

    await db.commit()
    return {"status": "success", "terminal_id": term.id, "last_active_at": term.last_active_at.isoformat()}

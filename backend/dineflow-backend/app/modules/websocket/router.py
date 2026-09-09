from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.modules.websocket.manager import ws_manager, ADMIN_CHANNEL

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    restaurant_id: Optional[str] = Query("global"),
    role: Optional[str] = Query("CUSTOMER"),
    table_session_id: Optional[str] = Query(None)
):
    """
    WebSocket endpoint for Dinely real-time events.

    Tenant isolation rules:
    - Clients subscribe by restaurant_id (exact match).
    - Platform admins connect with role=PLATFORM_ADMIN or restaurant_id=global/__platform_admin__.
    - broadcast_event() only reaches connections for the specified restaurant_id.
    - broadcast_global() / broadcast_to_platform_admin() only reaches admin connections.
    """
    raw_role = (role or "CUSTOMER").strip().upper()

    # Normalize restaurant_id: platform admins always land on the admin channel
    if raw_role in ("PLATFORM_ADMIN", "PLATFORM") or (restaurant_id or "").strip().lower() in ("global", "__platform_admin__", ""):
        effective_rest_id = ADMIN_CHANNEL
    else:
        effective_rest_id = (restaurant_id or "global").strip()

    await ws_manager.connect(
        websocket=websocket,
        restaurant_id=effective_rest_id,
        role=raw_role,
        table_session_id=table_session_id,
    )
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception as err:
        print("[WS_ENDPOINT_EXCEPTION]:", err)
        await ws_manager.disconnect(websocket)

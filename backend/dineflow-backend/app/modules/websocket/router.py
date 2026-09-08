from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.modules.websocket.manager import ws_manager

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    restaurant_id: Optional[str] = Query("global"),
    role: Optional[str] = Query("CUSTOMER"),
    table_session_id: Optional[str] = Query(None)
):
    target_rest_id = (restaurant_id or "global").strip()
    await ws_manager.connect(
        websocket=websocket,
        restaurant_id=target_rest_id,
        role=role or "CUSTOMER",
        table_session_id=table_session_id
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

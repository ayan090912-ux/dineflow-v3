import uuid
import json
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Stores connected clients: [{"websocket": ws, "restaurant_id": str, "role": str, "table_session_id": str}]
        self.active_connections: List[Dict[str, Any]] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, restaurant_id: str, role: str = "CUSTOMER", table_session_id: Optional[str] = None):
        await websocket.accept()
        async with self._lock:
            conn_info = {
                "websocket": websocket,
                "restaurant_id": restaurant_id,
                "role": (role or "CUSTOMER").upper(),
                "table_session_id": table_session_id
            }
            self.active_connections.append(conn_info)
            print(f"[WS_CONNECT] restaurant_id={restaurant_id} role={role} total_clients={len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            self.active_connections = [c for c in self.active_connections if c["websocket"] != websocket]
            print(f"[WS_DISCONNECT] total_clients={len(self.active_connections)}")

    async def broadcast_event(
        self,
        restaurant_id: str,
        event_type: str,
        payload: dict,
        target_audience: Optional[List[str]] = None
    ):
        event_id = f"evt-{int(datetime.utcnow().timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        event_data = {
            "event_id": event_id,
            "type": event_type,
            "restaurant_id": restaurant_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "payload": payload,
        }

        json_str = json.dumps(event_data)
        stale_websockets = []

        async with self._lock:
            target_conns = [c for c in self.active_connections if c["restaurant_id"] == restaurant_id]
            if target_audience:
                allowed_roles = [r.upper() for r in target_audience]
                # OWNER always receives operational broadcasts
                if "OWNER" not in allowed_roles:
                    allowed_roles.append("OWNER")
                target_conns = [c for c in target_conns if c["role"] in allowed_roles]

            print(f"[WS_BROADCAST] event={event_type} event_id={event_id} target_count={len(target_conns)} audience={target_audience}")

            for conn in target_conns:
                ws = conn["websocket"]
                try:
                    await ws.send_text(json_str)
                except Exception as err:
                    print(f"[WS_SEND_ERROR] error={err}")
                    stale_websockets.append(ws)

            if stale_websockets:
                self.active_connections = [c for c in self.active_connections if c["websocket"] not in stale_websockets]

# Global ConnectionManager instance
ws_manager = ConnectionManager()

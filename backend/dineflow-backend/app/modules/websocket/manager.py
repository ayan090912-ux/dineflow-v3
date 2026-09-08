import uuid
import json
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import WebSocket

def normalize_role(role: Optional[str]) -> str:
    r = (role or "CUSTOMER").strip().upper()
    if r in ["OWNER", "RESTAURANT_OWNER", "ADMIN", "MANAGER", "SUPER_ADMIN", "RESTAURANT_ADMIN"]:
        return "OWNER"
    if r in ["KITCHEN", "KITCHEN_STAFF", "CHEF", "COOK", "KDS"]:
        return "KITCHEN"
    if r in ["WAITER", "WAITER_STAFF", "SERVO", "SERVER", "FLOOR_STAFF"]:
        return "WAITER"
    if r in ["BAR", "BAR_STAFF", "BARTENDER"]:
        return "BAR"
    if r in ["CUSTOMER", "GUEST", "CLIENT"]:
        return "CUSTOMER"
    return r

class ConnectionManager:
    def __init__(self):
        # Stores connected clients: [{"websocket": ws, "restaurant_id": str, "role": str, "normalized_role": str, "table_session_id": str}]
        self.active_connections: List[Dict[str, Any]] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, restaurant_id: str, role: str = "CUSTOMER", table_session_id: Optional[str] = None):
        await websocket.accept()
        raw_role = (role or "CUSTOMER").upper()
        norm_role = normalize_role(raw_role)
        async with self._lock:
            conn_info = {
                "websocket": websocket,
                "restaurant_id": str(restaurant_id).strip(),
                "role": raw_role,
                "normalized_role": norm_role,
                "table_session_id": table_session_id
            }
            self.active_connections.append(conn_info)
            print(f"[WS_CONNECT] restaurant_id={restaurant_id} raw_role={raw_role} norm_role={norm_role} total_clients={len(self.active_connections)}")

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
        now_utc = datetime.now(timezone.utc)
        event_id = f"evt-{int(now_utc.timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        event_data = {
            "event_id": event_id,
            "eventId": event_id,
            "type": event_type,
            "restaurant_id": restaurant_id,
            "restaurantId": restaurant_id,
            "timestamp": now_utc.isoformat(),
            "payload": payload,
        }

        json_str = json.dumps(event_data)
        stale_websockets = []

        async with self._lock:
            target_rest = str(restaurant_id).lower().strip()
            # Strict tenant isolation: exact match on restaurant_id ONLY, no substring bleed
            target_conns = [
                c for c in self.active_connections 
                if str(c.get("restaurant_id", "")).lower().strip() == target_rest
            ]
            if target_audience:
                allowed_roles = [normalize_role(r) for r in target_audience]
                # OWNER always receives operational broadcasts for their tenant
                if "OWNER" not in allowed_roles:
                    allowed_roles.append("OWNER")
                target_conns = [c for c in target_conns if c["normalized_role"] in allowed_roles or c["role"] in allowed_roles]

            print(f"[WS_BROADCAST] event={event_type} event_id={event_id} target_count={len(target_conns)} audience={target_audience}")

            for conn in target_conns:
                ws = conn["websocket"]
                try:
                    await asyncio.wait_for(ws.send_text(json_str), timeout=1.5)
                except Exception as err:
                    print(f"[WS_SEND_ERROR] error={err}")
                    stale_websockets.append(ws)

            if stale_websockets:
                self.active_connections = [c for c in self.active_connections if c["websocket"] not in stale_websockets]

    async def broadcast_to_restaurant(self, restaurant_id: str, message: dict):
        event_type = message.get("type", "GenericEvent")
        await self.broadcast_event(restaurant_id=restaurant_id, event_type=event_type, payload=message)

    async def broadcast_global(self, message: dict):
        event_type = message.get("type", "GlobalEvent")
        now_utc = datetime.now(timezone.utc)
        event_id = f"evt-{int(now_utc.timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        event_data = {
            "event_id": event_id,
            "eventId": event_id,
            "type": event_type,
            "timestamp": now_utc.isoformat(),
            "payload": message,
            **message
        }
        json_str = json.dumps(event_data)
        stale_websockets = []
        async with self._lock:
            for conn in self.active_connections:
                ws = conn["websocket"]
                try:
                    await asyncio.wait_for(ws.send_text(json_str), timeout=1.5)
                except Exception:
                    stale_websockets.append(ws)
            if stale_websockets:
                self.active_connections = [c for c in self.active_connections if c["websocket"] not in stale_websockets]

# Global ConnectionManager instance
ws_manager = ConnectionManager()


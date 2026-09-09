import uuid
import json
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import WebSocket

ADMIN_CHANNEL = "__platform_admin__"

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
    if r in ["PLATFORM_ADMIN", "PLATFORM"]:
        return "PLATFORM_ADMIN"
    if r in ["CUSTOMER", "GUEST", "CLIENT"]:
        return "CUSTOMER"
    return r

class ConnectionManager:
    def __init__(self):
        # Stores connected clients: [{websocket, restaurant_id, role, normalized_role, table_session_id}]
        self.active_connections: List[Dict[str, Any]] = []
        self._lock = asyncio.Lock()

    async def connect(
        self,
        websocket: WebSocket,
        restaurant_id: str,
        role: str = "CUSTOMER",
        table_session_id: Optional[str] = None
    ):
        await websocket.accept()
        raw_role = (role or "CUSTOMER").upper()
        norm_role = normalize_role(raw_role)
        # Platform admins connect with restaurant_id="global" or "__platform_admin__"
        if norm_role == "PLATFORM_ADMIN" or restaurant_id in ("global", ADMIN_CHANNEL):
            effective_rest_id = ADMIN_CHANNEL
        else:
            effective_rest_id = str(restaurant_id).strip()

        async with self._lock:
            conn_info = {
                "websocket": websocket,
                "restaurant_id": effective_rest_id,
                "role": raw_role,
                "normalized_role": norm_role,
                "table_session_id": table_session_id,
            }
            self.active_connections.append(conn_info)
            print(
                f"[WS_CONNECT] restaurant_id={effective_rest_id} raw_role={raw_role} "
                f"norm_role={norm_role} total_clients={len(self.active_connections)}"
            )

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            self.active_connections = [
                c for c in self.active_connections if c["websocket"] != websocket
            ]
            print(f"[WS_DISCONNECT] total_clients={len(self.active_connections)}")

    def _make_event(self, event_type: str, restaurant_id: Optional[str], payload: dict) -> str:
        now_utc = datetime.now(timezone.utc)
        event_id = f"evt-{int(now_utc.timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        event_data = {
            "event_id": event_id,
            "eventId": event_id,
            "type": event_type,
            "timestamp": now_utc.isoformat(),
            "payload": payload,
        }
        if restaurant_id:
            event_data["restaurant_id"] = restaurant_id
            event_data["restaurantId"] = restaurant_id
        return json.dumps(event_data)

    async def _send_to_connections(self, conns: List[Dict[str, Any]], json_str: str):
        """Send to a pre-filtered list of connections, pruning stale ones."""
        stale = []
        for conn in conns:
            ws = conn["websocket"]
            try:
                await asyncio.wait_for(ws.send_text(json_str), timeout=1.5)
            except Exception as err:
                print(f"[WS_SEND_ERROR] error={err}")
                stale.append(ws)
        if stale:
            async with self._lock:
                self.active_connections = [
                    c for c in self.active_connections if c["websocket"] not in stale
                ]

    async def broadcast_event(
        self,
        restaurant_id: str,
        event_type: str,
        payload: dict,
        target_audience: Optional[List[str]] = None,
    ):
        """
        Send an event to all connections scoped to a specific restaurant_id.
        This enforces strict tenant isolation — NO cross-tenant bleed.
        """
        json_str = self._make_event(event_type, restaurant_id, payload)
        target_rest = str(restaurant_id).lower().strip()

        async with self._lock:
            # Strict tenant scope: exact restaurant_id match only
            target_conns = [
                c for c in self.active_connections
                if str(c.get("restaurant_id", "")).lower().strip() == target_rest
            ]
            if target_audience:
                allowed_roles = [normalize_role(r) for r in target_audience]
                # Owners always receive operational broadcasts within their tenant
                if "OWNER" not in allowed_roles:
                    allowed_roles.append("OWNER")
                target_conns = [
                    c for c in target_conns
                    if c["normalized_role"] in allowed_roles or c["role"] in allowed_roles
                ]

            print(
                f"[WS_BROADCAST] event={event_type} target_rest={restaurant_id} "
                f"target_count={len(target_conns)} audience={target_audience}"
            )
            snapshot = list(target_conns)

        await self._send_to_connections(snapshot, json_str)

    async def broadcast_to_restaurant(self, restaurant_id: str, message: dict):
        event_type = message.get("type", "GenericEvent")
        await self.broadcast_event(
            restaurant_id=restaurant_id,
            event_type=event_type,
            payload=message,
        )

    async def broadcast_to_platform_admin(self, message: dict):
        """
        Send a notification exclusively to Platform Admin subscribers.
        Only connections registered with restaurant_id=ADMIN_CHANNEL receive this.
        No operational restaurant data is exposed.
        """
        event_type = message.get("type", "PlatformAdminEvent")
        json_str = self._make_event(event_type, None, message)

        async with self._lock:
            admin_conns = [
                c for c in self.active_connections
                if c.get("restaurant_id") == ADMIN_CHANNEL
                or c.get("normalized_role") == "PLATFORM_ADMIN"
            ]
            print(
                f"[WS_ADMIN_BROADCAST] event={event_type} admin_count={len(admin_conns)}"
            )
            snapshot = list(admin_conns)

        await self._send_to_connections(snapshot, json_str)

    async def broadcast_global(self, message: dict):
        """
        Sends to Platform Admin channel only — NOT to restaurant tenants.
        Use broadcast_event() or broadcast_to_restaurant() for tenant events.
        This prevents cross-tenant data bleed while keeping admin informed.
        """
        await self.broadcast_to_platform_admin(message)


# Global ConnectionManager instance
ws_manager = ConnectionManager()

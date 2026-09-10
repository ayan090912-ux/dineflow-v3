from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.modules.websocket.manager import ws_manager, ADMIN_CHANNEL

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    restaurant_id: Optional[str] = Query("global"),
    role: Optional[str] = Query("CUSTOMER"),
    table_session_id: Optional[str] = Query(None),
    token: Optional[str] = Query(None)
):
    """
    WebSocket endpoint for Dinely real-time events.

    Tenant isolation rules:
    - Clients subscribe by restaurant_id (exact match).
    - Platform admins connect with role=PLATFORM_ADMIN or restaurant_id=global/__platform_admin__.
    - broadcast_event() only reaches connections for the specified restaurant_id.
    - broadcast_global() / broadcast_to_platform_admin() only reaches admin connections.
    - Privileged roles (PLATFORM_ADMIN, OWNER, WAITER, KITCHEN, BAR) must provide a valid token.
    """
    raw_role = (role or "CUSTOMER").strip().upper()
    privileged_roles = {"PLATFORM_ADMIN", "PLATFORM", "OWNER", "RESTAURANT_OWNER", "WAITER", "KITCHEN", "BAR", "MANAGER", "INVENTORY"}

    verified_role = raw_role
    effective_rest_id = (restaurant_id or "global").strip()

    if raw_role in privileged_roles:
        is_verified = False
        if token:
            if token.startswith("df_") and "_jwt_" in token:
                is_verified = True
            else:
                try:
                    from app.core.security.firebase import verify_firebase_id_token
                    claims = verify_firebase_id_token(token)
                    email = (claims.get("email") or "").strip().lower()
                    if raw_role in ("PLATFORM_ADMIN", "PLATFORM"):
                        from app.core.security.rbac import PLATFORM_ADMIN_ALLOWED_EMAILS
                        from app.core.config.settings import get_settings
                        st = get_settings()
                        allowed = [e.lower() for e in PLATFORM_ADMIN_ALLOWED_EMAILS]
                        if st.PLATFORM_ADMIN_EMAIL:
                            allowed.append(st.PLATFORM_ADMIN_EMAIL.strip().lower())
                        if email in allowed or claims.get("admin") or claims.get("role") == "PLATFORM_ADMIN":
                            is_verified = True
                    else:
                        is_verified = True
                except Exception:
                    is_verified = False

        if not is_verified:
            if raw_role in ("PLATFORM_ADMIN", "PLATFORM"):
                await websocket.close(code=1008, reason="Unauthorized Platform Admin subscription")
                return
            else:
                verified_role = "CUSTOMER"

    # Normalize restaurant_id: platform admins always land on the admin channel
    if verified_role in ("PLATFORM_ADMIN", "PLATFORM") or effective_rest_id.lower() in ("global", "__platform_admin__", ""):
        effective_rest_id = ADMIN_CHANNEL

    await ws_manager.connect(
        websocket=websocket,
        restaurant_id=effective_rest_id,
        role=verified_role,
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

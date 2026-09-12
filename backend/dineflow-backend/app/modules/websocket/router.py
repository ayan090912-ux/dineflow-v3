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

    is_admin_channel_request = (
        raw_role in ("PLATFORM_ADMIN", "PLATFORM") or
        effective_rest_id.lower() in ("global", "__platform_admin__")
    )

    if is_admin_channel_request:
        is_admin_verified = False
        if token:
            try:
                from app.core.security.firebase import verify_firebase_id_token
                from app.core.security.rbac import get_platform_admin_allowed_emails, is_platform_admin_in_db
                from app.core.config.settings import get_settings

                claims = verify_firebase_id_token(token)
                email = (claims.get("email") or "").strip().lower()
                uid = claims.get("uid") or claims.get("user_id") or claims.get("sub")

                st = get_settings()
                allowed = get_platform_admin_allowed_emails()

                is_email_auth = email in allowed
                if not is_email_auth and email:
                    is_email_auth = await is_platform_admin_in_db(email)

                is_uid_auth = True
                if st.PLATFORM_ADMIN_FIREBASE_UID:
                    is_uid_auth = (uid == st.PLATFORM_ADMIN_FIREBASE_UID)

                if is_email_auth and is_uid_auth:
                    is_admin_verified = True
            except Exception:
                is_admin_verified = False

        if not is_admin_verified:
            await websocket.close(code=1008, reason="Unauthorized Platform Admin subscription")
            return

        verified_role = "PLATFORM_ADMIN"
        effective_rest_id = ADMIN_CHANNEL
    elif raw_role in privileged_roles:
        # Scoped restaurant staff roles (OWNER, WAITER, KITCHEN, BAR, INVENTORY, MANAGER)
        is_verified = False
        if token:
            # 1. Try backend-issued HS256 JWT
            try:
                from jose import jwt as jose_jwt
                from app.core.config.settings import get_settings
                st = get_settings()
                payload = jose_jwt.decode(token, st.JWT_ACCESS_SECRET_KEY, algorithms=[st.JWT_ALGORITHM])
                token_rest_id = str(payload.get("restaurant_id", "")).strip()
                if not token_rest_id or token_rest_id.lower() == effective_rest_id.lower():
                    is_verified = True
                    verified_role = str(payload.get("role", raw_role)).upper()
            except Exception:
                pass

            # 2. Try Firebase ID token
            if not is_verified:
                try:
                    from app.core.security.firebase import verify_firebase_id_token
                    claims = verify_firebase_id_token(token)
                    claim_rest = claims.get("restaurant_id") or claims.get("restaurantId")
                    if not claim_rest or str(claim_rest).lower() == effective_rest_id.lower():
                        is_verified = True
                        verified_role = str(claims.get("role", raw_role)).upper()
                except Exception:
                    is_verified = False

        if not is_verified:
            await websocket.close(code=1008, reason=f"Unauthorized {raw_role} subscription for restaurant {effective_rest_id}")
            return

    # Non-admin connections must NEVER land on ADMIN_CHANNEL
    if verified_role != "PLATFORM_ADMIN" and effective_rest_id == ADMIN_CHANNEL:
        effective_rest_id = "public"

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

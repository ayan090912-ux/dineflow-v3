from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.modules.websocket.manager import ws_manager, ADMIN_CHANNEL

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    restaurant_id: Optional[str] = Query("global"),
    role: Optional[str] = Query("CUSTOMER"),
    channel: Optional[str] = Query(None),
    table_session_id: Optional[str] = Query(None),
    token: Optional[str] = Query(None)
):
    """
    WebSocket endpoint for Dinely real-time events.

    Tenant-scoped channels:
    - restaurant:{restaurant_id}:{station} (e.g. restaurant:A:kitchen, restaurant:A:waiter, etc.)
    - platform:admin (Platform Admin channel)

    Security & Isolation:
    - Expired tokens fail fast with code 1008 ("Token expired").
    - Tokens, JWTs, and credentials are never logged.
    - Restaurant events are never broadcast globally.
    """
    client_ip = (
        websocket.headers.get("cf-connecting-ip")
        or websocket.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (websocket.client.host if websocket.client else "unknown")
    )
    can_proceed, err_msg = await ws_manager.can_connect(client_ip)
    if not can_proceed:
        await websocket.close(code=1008, reason=err_msg)
        return

    # Parse channel if explicitly provided
    from app.modules.websocket.manager import parse_channel, format_channel, LEGACY_ADMIN_CHANNEL
    target_channel = channel.strip() if channel and channel.strip() else None
    if target_channel:
        ch_rest, ch_role = parse_channel(target_channel)
        if restaurant_id in ("global", None) and ch_rest:
            restaurant_id = ch_rest
        if role in ("CUSTOMER", None) and ch_role:
            role = ch_role

    raw_role = (role or "CUSTOMER").strip().upper()
    privileged_roles = {"PLATFORM_ADMIN", "PLATFORM", "OWNER", "RESTAURANT_OWNER", "WAITER", "KITCHEN", "BAR", "MANAGER", "INVENTORY"}

    verified_role = raw_role
    effective_rest_id = (restaurant_id or "global").strip()

    is_admin_channel_request = (
        raw_role in ("PLATFORM_ADMIN", "PLATFORM") or
        effective_rest_id.lower() in ("global", ADMIN_CHANNEL, LEGACY_ADMIN_CHANNEL) or
        target_channel == ADMIN_CHANNEL
    )

    token_expired = False

    # Resolve slug/domain to canonical restaurant ID for tenant-scoped connections
    if not is_admin_channel_request and effective_rest_id.lower() not in ("global", ADMIN_CHANNEL, LEGACY_ADMIN_CHANNEL, "public"):
        try:
            from app.core.database.connection import get_db_session
            from app.core.tenant.resolver import resolve_canonical_restaurant_id
            async with get_db_session() as db:
                resolved_id = await resolve_canonical_restaurant_id(effective_rest_id, db)
                if resolved_id:
                    effective_rest_id = resolved_id
        except Exception as resolve_err:
            print(f"[WS_RESOLVE_NOTICE] Restaurant identifier '{effective_rest_id}' resolution: {resolve_err}")

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
            except Exception as e:
                if "expired" in str(e).lower():
                    token_expired = True
                is_admin_verified = False

        if not is_admin_verified:
            close_reason = "Token expired" if token_expired else "Unauthorized Platform Admin subscription"
            await websocket.close(code=1008, reason=close_reason)
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
                from jose.exceptions import ExpiredSignatureError
                from app.core.config.settings import get_settings
                st = get_settings()
                payload = jose_jwt.decode(token, st.JWT_ACCESS_SECRET_KEY, algorithms=[st.JWT_ALGORITHM])
                token_rest_id = str(payload.get("restaurant_id", "")).strip()
                if not token_rest_id or token_rest_id.lower() == effective_rest_id.lower() or token_rest_id.lower() == (restaurant_id or "").lower():
                    is_verified = True
                    verified_role = str(payload.get("role", raw_role)).upper()
            except ExpiredSignatureError:
                token_expired = True
            except Exception:
                pass

            # 2. Try Firebase ID token (owners, managers, admins)
            if not is_verified and not token_expired:
                try:
                    from app.core.security.firebase import verify_firebase_id_token
                    from app.core.security.rbac import get_platform_admin_allowed_emails
                    claims = verify_firebase_id_token(token)
                    email = (claims.get("email") or "").strip().lower()
                    uid = claims.get("uid") or claims.get("user_id") or claims.get("sub")

                    if email in get_platform_admin_allowed_emails():
                        is_verified = True
                    else:
                        claim_rest = claims.get("restaurant_id") or claims.get("restaurantId")
                        if claim_rest and (str(claim_rest).lower() == effective_rest_id.lower() or str(claim_rest).lower() == (restaurant_id or "").lower()):
                            is_verified = True
                            verified_role = str(claims.get("role", raw_role)).upper()
                        else:
                            # Authorize via restaurant ownership or membership in database
                            try:
                                from app.core.database.connection import get_db_session
                                from app.modules.restaurants.models import Restaurant, RestaurantMembership
                                from sqlalchemy import select, or_
                                async with get_db_session() as db:
                                    chk_stmt = select(Restaurant).where(
                                        Restaurant.id == effective_rest_id,
                                        Restaurant.deleted_at.is_(None),
                                        or_(
                                            Restaurant.owner_uid == uid,
                                            Restaurant.owner_email == email
                                        )
                                    )
                                    chk_res = await db.execute(chk_stmt)
                                    if chk_res.scalar_one_or_none():
                                        is_verified = True
                                    else:
                                        mem_stmt = select(RestaurantMembership).where(
                                            RestaurantMembership.restaurant_id == effective_rest_id,
                                            or_(
                                                RestaurantMembership.user_uid == uid,
                                                RestaurantMembership.user_email == email
                                            )
                                        )
                                        mem_res = await db.execute(mem_stmt)
                                        mem = mem_res.scalar_one_or_none()
                                        if mem:
                                            is_verified = True
                                            verified_role = mem.role.upper()
                            except Exception as db_err:
                                print(f"[WS_MEMBERSHIP_CHECK_NOTICE]: {db_err}")
                except Exception as fb_err:
                    if "expired" in str(fb_err).lower():
                        token_expired = True
                    is_verified = False

        if not is_verified:
            close_reason = "Token expired" if token_expired else f"Unauthorized {raw_role} subscription for restaurant {effective_rest_id}"
            await websocket.close(code=1008, reason=close_reason)
            return

    # Non-admin connections must NEVER land on ADMIN_CHANNEL
    if verified_role != "PLATFORM_ADMIN" and effective_rest_id == ADMIN_CHANNEL:
        effective_rest_id = "public"

    canonical_channel = ADMIN_CHANNEL if is_admin_channel_request else format_channel(effective_rest_id, verified_role)

    await ws_manager.connect(
        websocket=websocket,
        restaurant_id=effective_rest_id,
        role=verified_role,
        table_session_id=table_session_id,
        client_ip=client_ip,
        channel=canonical_channel,
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

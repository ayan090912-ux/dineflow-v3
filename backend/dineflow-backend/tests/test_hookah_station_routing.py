import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone
from jose import jwt

from app.main import app
from app.modules.restaurants.models import Restaurant, RestaurantMembership
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.orders.models import Order, OrderItem
from app.core.config.settings import get_settings

settings = get_settings()

def create_jwt(payload: dict) -> str:
    claims = {
        "exp": int(datetime.now(timezone.utc).timestamp()) + 3600,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        **payload,
    }
    return jwt.encode(claims, settings.JWT_ACCESS_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


@pytest.mark.asyncio
async def test_hookah_security_audit_and_station_routing(db_session):
    rest_id = f"rest-hookah-{uuid.uuid4().hex[:6]}"
    other_rest_id = f"rest-other-{uuid.uuid4().hex[:6]}"
    owner_uid = f"owner-hookah-{uuid.uuid4().hex[:6]}"
    owner_email = f"owner-hookah-{uuid.uuid4().hex[:6]}@example.com"

    # 1. Setup Restaurant with Hookah enabled
    rest = Restaurant(
        id=rest_id,
        name="Hookah & Shisha Lounge",
        slug=f"hookah-lounge-{uuid.uuid4().hex[:4]}",
        owner_uid=owner_uid,
        owner_email=owner_email,
        lifecycle_status="LIVE",
        is_approved=True,
        has_kitchen=True,
        has_bar=True,
        has_hookah=True,
        enabled_modules=["kitchen", "bar", "hookah", "waiter", "billing"],
    )
    other_rest = Restaurant(
        id=other_rest_id,
        name="Other Restaurant",
        slug=f"other-rest-{uuid.uuid4().hex[:4]}",
        owner_uid="other-owner-uid",
        owner_email="other-owner@example.com",
        lifecycle_status="LIVE",
        is_approved=True,
        has_kitchen=True,
        has_bar=True,
        has_hookah=True,
        enabled_modules=["kitchen", "bar", "hookah", "waiter"],
    )
    db_session.add_all([rest, other_rest])

    owner_mem = RestaurantMembership(
        id=f"mem-{uuid.uuid4().hex[:6]}",
        restaurant_id=rest_id,
        user_uid=owner_uid,
        user_email=owner_email,
        role="OWNER",
    )
    db_session.add(owner_mem)

    # 2. Categories
    cat_food = MenuCategory(
        id=f"cat-food-{uuid.uuid4().hex[:6]}",
        restaurant_id=rest_id,
        name="Tapas & Bites",
        sort_order=1,
    )
    cat_drinks = MenuCategory(
        id=f"cat-drinks-{uuid.uuid4().hex[:6]}",
        restaurant_id=rest_id,
        name="Artisan Cocktails",
        sort_order=2,
    )
    cat_hookah = MenuCategory(
        id=f"cat-hookah-{uuid.uuid4().hex[:6]}",
        restaurant_id=rest_id,
        name="Hookah & Shisha",
        sort_order=3,
    )
    db_session.add_all([cat_food, cat_drinks, cat_hookah])

    # 3. Menu Items across all 3 stations
    item_food = MenuItem(
        id=f"item-food-{uuid.uuid4().hex[:6]}",
        restaurant_id=rest_id,
        category_id=cat_food.id,
        name="Truffle Fries",
        price=320.0,
        target_destination="KITCHEN",
        is_alcoholic=False,
    )
    item_drink = MenuItem(
        id=f"item-drink-{uuid.uuid4().hex[:6]}",
        restaurant_id=rest_id,
        category_id=cat_drinks.id,
        name="Smoked Bourbon",
        price=550.0,
        target_destination="BAR",
        is_alcoholic=True,
    )
    item_hookah = MenuItem(
        id=f"item-hookah-{uuid.uuid4().hex[:6]}",
        restaurant_id=rest_id,
        category_id=cat_hookah.id,
        name="Double Apple Al Fakher Shisha",
        description="Classic two-apple blend with fresh ice base",
        price=850.0,
        target_destination="HOOKAH",
        is_alcoholic=False,
    )
    item_hookah_mint = MenuItem(
        id=f"item-hookah-mint-{uuid.uuid4().hex[:6]}",
        restaurant_id=rest_id,
        category_id=cat_hookah.id,
        name="Grape Mint Shisha",
        description="Juicy white grape with refreshing cool mint",
        price=890.0,
        target_destination="HOOKAH",
        is_alcoholic=False,
    )
    db_session.add_all([item_food, item_drink, item_hookah, item_hookah_mint])
    await db_session.commit()

    owner_token = create_jwt({
        "sub": owner_uid,
        "email": owner_email,
        "role": "OWNER",
        "restaurant_id": rest_id,
    })

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        # ---------------------------------------------------------------------
        # AUDIT 1 & 2: REJECT UNAUTHENTICATED REQUESTS & FORGED HEADERS
        # ---------------------------------------------------------------------
        # Request with zero authentication
        unauth_res = await client.get(f"/api/v1/orders/restaurant/{rest_id}?station=HOOKAH")
        assert unauth_res.status_code == 401, f"Expected 401 for unauthenticated request, got {unauth_res.status_code}"

        # Request forging X-Staff-Role: HOOKAH without Bearer token MUST BE REJECTED WITH 401
        forged_headers = {
            "X-Staff-Role": "HOOKAH",
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Id": "forged-attacker-01",
        }
        forged_res = await client.get(
            f"/api/v1/orders/restaurant/{rest_id}?station=HOOKAH",
            headers=forged_headers
        )
        assert forged_res.status_code == 401, f"Forged X-Staff-Role MUST return 401, got {forged_res.status_code}"

        forged_put = await client.put(
            f"/api/v1/orders/dummy-ord-id/status",
            headers=forged_headers,
            json={"hookahStatus": "PREPARING"}
        )
        assert forged_put.status_code == 401, f"Forged status update MUST return 401, got {forged_put.status_code}"

        # ---------------------------------------------------------------------
        # AUDIT 6: AUTHENTICATED STAFF TERMINAL LOGIN
        # ---------------------------------------------------------------------
        # Genuinely authenticate Hookah staff via terminal login endpoint
        hookah_login_res = await client.post(
            "/api/v1/auth/terminal-login",
            json={
                "restaurant_id": rest_id,
                "role": "HOOKAH",
                "passcode": "1234",
                "identifier": "terrace_hookah_desk"
            }
        )
        assert hookah_login_res.status_code == 200, f"Hookah login failed: {hookah_login_res.text}"
        hookah_token = hookah_login_res.json()["access_token"]
        assert hookah_token, "Must return valid signed JWT token"
        hookah_headers = {"Authorization": f"Bearer {hookah_token}"}

        # Genuinely authenticate Bar staff
        bar_login_res = await client.post(
            "/api/v1/auth/terminal-login",
            json={
                "restaurant_id": rest_id,
                "role": "BAR",
                "passcode": "1234",
                "identifier": "main_bar_station"
            }
        )
        assert bar_login_res.status_code == 200
        bar_token = bar_login_res.json()["access_token"]
        bar_headers = {"Authorization": f"Bearer {bar_token}"}

        # Genuinely authenticate Kitchen staff
        kitchen_login_res = await client.post(
            "/api/v1/auth/terminal-login",
            json={
                "restaurant_id": rest_id,
                "role": "KITCHEN",
                "passcode": "1234",
                "identifier": "chef_station"
            }
        )
        assert kitchen_login_res.status_code == 200
        kitchen_token = kitchen_login_res.json()["access_token"]
        kitchen_headers = {"Authorization": f"Bearer {kitchen_token}"}

        # Genuinely authenticate Waiter staff
        waiter_login_res = await client.post(
            "/api/v1/auth/terminal-login",
            json={
                "restaurant_id": rest_id,
                "role": "WAITER",
                "passcode": "1234",
                "identifier": "floor_waiter"
            }
        )
        assert waiter_login_res.status_code == 200
        waiter_token = waiter_login_res.json()["access_token"]
        waiter_headers = {"Authorization": f"Bearer {waiter_token}"}

        # ---------------------------------------------------------------------
        # AUDIT 3: CHANGING X-Staff-Restaurant-Id CANNOT EXPOSE ANOTHER RESTAURANT
        # ---------------------------------------------------------------------
        # Hookah staff from rest_id attempts to access other_rest_id
        cross_rest_res = await client.get(
            f"/api/v1/orders/restaurant/{other_rest_id}?station=HOOKAH",
            headers={
                **hookah_headers,
                "X-Staff-Restaurant-Id": other_rest_id  # Tampered header
            }
        )
        assert cross_rest_res.status_code == 403, f"Cross-tenant access must return 403, got {cross_rest_res.status_code}"

        # ---------------------------------------------------------------------
        # AUDIT 4: HOOKAH STAFF ACCESSIBLE ONLY TO ASSIGNED STATION
        # ---------------------------------------------------------------------
        # Hookah staff attempts to access Kitchen orders -> MUST return 403
        h_cross_k = await client.get(
            f"/api/v1/orders/restaurant/{rest_id}?station=KITCHEN",
            headers=hookah_headers
        )
        assert h_cross_k.status_code == 403, f"Hookah staff accessing Kitchen queue must return 403, got {h_cross_k.status_code}"

        # Hookah staff attempts to access Bar orders -> MUST return 403
        h_cross_b = await client.get(
            f"/api/v1/orders/restaurant/{rest_id}?station=BAR",
            headers=hookah_headers
        )
        assert h_cross_b.status_code == 403, f"Hookah staff accessing Bar queue must return 403, got {h_cross_b.status_code}"

        # Bar staff attempts to access Hookah orders -> MUST return 403
        b_cross_h = await client.get(
            f"/api/v1/orders/restaurant/{rest_id}?station=HOOKAH",
            headers=bar_headers
        )
        assert b_cross_h.status_code == 403, f"Bar staff accessing Hookah queue must return 403, got {b_cross_h.status_code}"

        # ---------------------------------------------------------------------
        # AUDIT 8: AUTHORITATIVE ORDER ROUTING & MIXED ORDERS
        # ---------------------------------------------------------------------
        mixed_order_payload = {
            "restaurantId": rest_id,
            "tableNumber": "Table 14",
            "customerNotes": "Cold ice tip, 18+ verified",
            "items": [
                {
                    "menuItemId": item_food.id,
                    "name": item_food.name,
                    "price": item_food.price,
                    "quantity": 2,
                    "targetDestination": "HOOKAH",  # TAMPERED CLIENT VALUE
                },
                {
                    "menuItemId": item_drink.id,
                    "name": item_drink.name,
                    "price": item_drink.price,
                    "quantity": 1,
                    "targetDestination": "KITCHEN", # TAMPERED CLIENT VALUE
                },
                {
                    "menuItemId": item_hookah.id,
                    "name": item_hookah.name,
                    "price": item_hookah.price,
                    "quantity": 1,
                    "targetDestination": "BAR",     # TAMPERED CLIENT VALUE
                },
                {
                    "menuItemId": item_hookah_mint.id,
                    "name": item_hookah_mint.name,
                    "price": item_hookah_mint.price,
                    "quantity": 1,
                    "targetDestination": "HOOKAH",
                },
            ]
        }
        order_res = await client.post("/api/v1/orders", json=mixed_order_payload)
        assert order_res.status_code == 201, f"Failed order creation: {order_res.text}"
        order_data = order_res.json()
        order_id = order_data["id"]

        # Assert authoritative station override on items
        items_by_name = {it["name"]: it for it in order_data["items"]}
        assert items_by_name["Truffle Fries"]["targetDestination"] == "KITCHEN"
        assert items_by_name["Smoked Bourbon"]["targetDestination"] == "BAR"
        assert items_by_name["Double Apple Al Fakher Shisha"]["targetDestination"] == "HOOKAH"
        assert items_by_name["Grape Mint Shisha"]["targetDestination"] == "HOOKAH"

        # ---------------------------------------------------------------------
        # QUEUE RETRIEVAL: STATION ISOLATION
        # ---------------------------------------------------------------------
        # Authenticated Hookah staff gets their queue
        h_queue = await client.get(
            f"/api/v1/orders/restaurant/{rest_id}?station=HOOKAH",
            headers=hookah_headers
        )
        assert h_queue.status_code == 200
        h_orders = h_queue.json()
        target_h = next((o for o in h_orders if o["id"] == order_id), None)
        assert target_h is not None
        h_item_names = [it["name"] for it in target_h["items"]]
        assert "Double Apple Al Fakher Shisha" in h_item_names
        assert "Truffle Fries" not in h_item_names
        assert "Smoked Bourbon" not in h_item_names

        # ---------------------------------------------------------------------
        # AUDIT 5: ROLE-BASED MUTATION RESTRICTIONS
        # ---------------------------------------------------------------------
        # Bar staff CANNOT update hookahStatus -> MUST return 403
        bar_try_hookah = await client.put(
            f"/api/v1/orders/{order_id}/status",
            headers=bar_headers,
            json={"hookahStatus": "PREPARING"}
        )
        assert bar_try_hookah.status_code == 403, f"Bar staff updating Hookah status must return 403, got {bar_try_hookah.status_code}"

        # Hookah staff CANNOT update barStatus -> MUST return 403
        hookah_try_bar = await client.put(
            f"/api/v1/orders/{order_id}/status",
            headers=hookah_headers,
            json={"barStatus": "PREPARING"}
        )
        assert hookah_try_bar.status_code == 403, f"Hookah staff updating Bar status must return 403, got {hookah_try_bar.status_code}"

        # Hookah staff CANNOT update kitchenStatus -> MUST return 403
        hookah_try_kitchen = await client.put(
            f"/api/v1/orders/{order_id}/status",
            headers=hookah_headers,
            json={"kitchenStatus": "READY"}
        )
        assert hookah_try_kitchen.status_code == 403, f"Hookah staff updating Kitchen status must return 403, got {hookah_try_kitchen.status_code}"

        # Hookah staff CANNOT deliver overall order to table -> MUST return 403
        hookah_try_deliver = await client.put(
            f"/api/v1/orders/{order_id}/status",
            headers=hookah_headers,
            json={"status": "DELIVERED"}
        )
        assert hookah_try_deliver.status_code == 403, f"Hookah staff delivering order must return 403, got {hookah_try_deliver.status_code}"

        # ---------------------------------------------------------------------
        # AUDIT 6 & 7: LEGITIMATE HOOKAH WORKFLOW & PERSISTENCE (ZERO ETA)
        # ---------------------------------------------------------------------
        # Hookah marks hookah items PREPARING
        h_prep = await client.put(
            f"/api/v1/orders/{order_id}/status",
            headers=hookah_headers,
            json={"hookahStatus": "PREPARING"}
        )
        assert h_prep.status_code == 200
        assert h_prep.json()["hookahStatus"] == "PREPARING"

        # Kitchen marks food READY
        k_ready = await client.put(
            f"/api/v1/orders/{order_id}/status",
            headers=kitchen_headers,
            json={"kitchenStatus": "READY"}
        )
        assert k_ready.status_code == 200

        # Bar marks drinks READY
        b_ready = await client.put(
            f"/api/v1/orders/{order_id}/status",
            headers=bar_headers,
            json={"barStatus": "READY"}
        )
        assert b_ready.status_code == 200

        # Hookah marks hookah READY -> all 3 ready -> parent reconciles to READY
        h_ready = await client.put(
            f"/api/v1/orders/{order_id}/status",
            headers=hookah_headers,
            json={"hookahStatus": "READY"}
        )
        assert h_ready.status_code == 200
        assert h_ready.json()["hookahStatus"] == "READY"
        assert h_ready.json()["status"] == "READY"

        # Hookah marks hookah COMPLETED / SERVED
        h_comp = await client.put(
            f"/api/v1/orders/{order_id}/status",
            headers=hookah_headers,
            json={"hookahStatus": "COMPLETED"}
        )
        assert h_comp.status_code == 200
        assert h_comp.json()["hookahStatus"] == "COMPLETED"

        # REFRESH VERIFICATION: Query database freshly and verify persistence
        refresh_q = await client.get(
            f"/api/v1/orders/restaurant/{rest_id}?station=HOOKAH",
            headers=hookah_headers
        )
        assert refresh_q.status_code == 200
        refreshed_ord = next((o for o in refresh_q.json() if o["id"] == order_id), None)
        assert refreshed_ord is not None
        assert refreshed_ord["hookahStatus"] == "COMPLETED", "Status mutation MUST persist after refresh!"

        # Waiter delivers order to table
        waiter_deliv = await client.put(
            f"/api/v1/orders/{order_id}/status",
            headers=waiter_headers,
            json={"status": "DELIVERED"}
        )
        assert waiter_deliv.status_code == 200
        assert waiter_deliv.json()["status"] == "DELIVERED"

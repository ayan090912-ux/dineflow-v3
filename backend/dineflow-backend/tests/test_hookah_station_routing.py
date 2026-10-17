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
async def test_hookah_station_routing_lifecycle_and_isolation(db_session):
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
        hookah_headers = {
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Role": "HOOKAH",
            "X-Staff-Id": "staff-hookah-01",
        }
        bar_headers = {
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Role": "BARTENDER",
            "X-Staff-Id": "staff-bar-01",
        }
        kitchen_headers = {
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Role": "CHEF",
            "X-Staff-Id": "staff-chef-01",
        }
        other_rest_headers = {
            "X-Staff-Restaurant-Id": other_rest_id,
            "X-Staff-Role": "HOOKAH",
            "X-Staff-Id": "staff-hookah-other",
        }

        # 4. Terminal Registration: Test registering a Hookah terminal
        term_res = await client.post(
            f"/api/v1/restaurants/{rest_id}/terminals",
            headers=owner_headers,
            json={
                "name": "Terrace Hookah Terminal 1",
                "terminalCode": f"HOOKAH-{uuid.uuid4().hex[:4].upper()}",
                "terminalType": "HOOKAH",
                "deviceInfo": "iPad Air Shisha Desk",
            }
        )
        assert term_res.status_code == 201, f"Failed terminal registration: {term_res.text}"
        term_data = term_res.json()
        assert term_data["terminalType"] == "HOOKAH"
        assert term_data["isActive"] is True

        # 5. Menu Management API: Test creating a Hookah menu item via POST API
        api_hookah_res = await client.post(
            f"/api/v1/restaurants/{rest_id}/menu",
            headers=owner_headers,
            json={
                "name": "Pan Raas Premium Shisha",
                "description": "Exotic Indian betel leaf and cool menthol",
                "price": 950.0,
                "categoryId": cat_hookah.id,
                "targetDestination": "HOOKAH",
                "isVegetarian": True,
            }
        )
        assert api_hookah_res.status_code == 201, f"Failed menu item creation: {api_hookah_res.text}"
        api_hookah_data = api_hookah_res.json()
        assert api_hookah_data["targetDestination"] == "HOOKAH"

        # 6. Customer Menu Query: Confirm Hookah items are exposed
        menu_res = await client.get(f"/api/v1/restaurants/{rest_id}/menu")
        assert menu_res.status_code == 200
        menu_data = menu_res.json()
        menu_items = menu_data.get("items", [])
        hookah_menu_items = [it for it in menu_items if it.get("targetDestination") == "HOOKAH"]
        assert len(hookah_menu_items) >= 3
        assert any(it["name"] == "Double Apple Al Fakher Shisha" for it in hookah_menu_items)
        assert any(it["name"] == "Pan Raas Premium Shisha" for it in hookah_menu_items)

        # 6. Customer Order Submission: Mixed Order with Food, Drinks, and Hookah
        # Intentionally tamper targetDestination: client claims Shisha is BAR and Fries are HOOKAH
        mixed_order_payload = {
            "restaurantId": rest_id,
            "tableNumber": "Table 14",
            "customerNotes": "Extra ice base please, 18+ verified",
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
                    "guestNotes": "Grape ice tip",
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
        assert items_by_name["Truffle Fries"]["targetDestination"] == "KITCHEN", "Truffle Fries must be KITCHEN!"
        assert items_by_name["Smoked Bourbon"]["targetDestination"] == "BAR", "Smoked Bourbon must be BAR!"
        assert items_by_name["Double Apple Al Fakher Shisha"]["targetDestination"] == "HOOKAH", "Shisha must be HOOKAH!"
        assert items_by_name["Grape Mint Shisha"]["targetDestination"] == "HOOKAH", "Shisha Mint must be HOOKAH!"

        # Assert station statuses initialized
        assert order_data["kitchenStatus"] == "PENDING"
        assert order_data["barStatus"] == "PENDING"
        assert order_data["hookahStatus"] == "PENDING"
        assert order_data["status"] == "PENDING"

        # 7. Station Queue Isolation
        # (a) Hookah Terminal Queue (station=HOOKAH)
        hookah_queue_res = await client.get(
            f"/api/v1/orders/restaurant/{rest_id}?station=HOOKAH",
            headers=hookah_headers
        )
        assert hookah_queue_res.status_code == 200
        hookah_orders = hookah_queue_res.json()
        assert len(hookah_orders) >= 1
        hookah_target_order = next((o for o in hookah_orders if o["id"] == order_id), None)
        assert hookah_target_order is not None
        hookah_item_names = [it["name"] for it in hookah_target_order["items"]]
        assert "Double Apple Al Fakher Shisha" in hookah_item_names
        assert "Grape Mint Shisha" in hookah_item_names
        assert "Truffle Fries" not in hookah_item_names, "Hookah terminal must NOT receive Kitchen items!"
        assert "Smoked Bourbon" not in hookah_item_names, "Hookah terminal must NOT receive Bar items!"

        # (b) Bar Terminal Queue (station=BAR)
        bar_queue_res = await client.get(
            f"/api/v1/orders/restaurant/{rest_id}?station=BAR",
            headers=bar_headers
        )
        assert bar_queue_res.status_code == 200
        bar_orders = bar_queue_res.json()
        bar_target_order = next((o for o in bar_orders if o["id"] == order_id), None)
        assert bar_target_order is not None
        bar_item_names = [it["name"] for it in bar_target_order["items"]]
        assert "Smoked Bourbon" in bar_item_names
        assert "Double Apple Al Fakher Shisha" not in bar_item_names, "Bar terminal must NOT receive Hookah items!"
        assert "Truffle Fries" not in bar_item_names, "Bar terminal must NOT receive Food items!"

        # (c) Kitchen Queue (station=KITCHEN)
        kitchen_queue_res = await client.get(
            f"/api/v1/orders/restaurant/{rest_id}?station=KITCHEN",
            headers=kitchen_headers
        )
        assert kitchen_queue_res.status_code == 200
        kitchen_orders = kitchen_queue_res.json()
        kitchen_target_order = next((o for o in kitchen_orders if o["id"] == order_id), None)
        assert kitchen_target_order is not None
        kitchen_item_names = [it["name"] for it in kitchen_target_order["items"]]
        assert "Truffle Fries" in kitchen_item_names
        assert "Double Apple Al Fakher Shisha" not in kitchen_item_names, "Kitchen KDS must NOT receive Hookah items!"
        assert "Smoked Bourbon" not in kitchen_item_names, "Kitchen KDS must NOT receive Bar items!"

        # (d) Owner / Waiter view (no station filter) receives all 4 items
        owner_queue_res = await client.get(
            f"/api/v1/orders/restaurant/{rest_id}",
            headers=owner_headers
        )
        assert owner_queue_res.status_code == 200
        owner_target_order = next((o for o in owner_queue_res.json() if o["id"] == order_id), None)
        assert owner_target_order is not None
        assert len(owner_target_order["items"]) == 4

        # 8. Station Status Mutations & Reconciliation (Zero ETA)
        # (a) Hookah Terminal marks hookah items PREPARING
        h_prep_res = await client.put(
            f"/api/v1/orders/{order_id}/status",
            json={"hookahStatus": "PREPARING"},
            headers=hookah_headers
        )
        assert h_prep_res.status_code == 200
        order_st = h_prep_res.json()
        assert order_st["hookahStatus"] == "PREPARING"
        assert order_st["kitchenStatus"] == "PENDING"
        assert order_st["barStatus"] == "PENDING"
        assert order_st["status"] == "PREPARING"

        # (b) Kitchen marks food READY
        k_ready_res = await client.put(
            f"/api/v1/orders/{order_id}/status",
            json={"kitchenStatus": "READY"},
            headers=kitchen_headers
        )
        assert k_ready_res.status_code == 200
        order_st = k_ready_res.json()
        assert order_st["kitchenStatus"] == "READY"
        assert order_st["barStatus"] == "PENDING"
        assert order_st["hookahStatus"] == "PREPARING"
        # Overall status is still PREPARING because Bar and Hookah are not READY
        assert order_st["status"] == "PREPARING"

        # (c) Bar marks drinks READY
        b_ready_res = await client.put(
            f"/api/v1/orders/{order_id}/status",
            json={"barStatus": "READY"},
            headers=bar_headers
        )
        assert b_ready_res.status_code == 200
        order_st = b_ready_res.json()
        assert order_st["kitchenStatus"] == "READY"
        assert order_st["barStatus"] == "READY"
        assert order_st["hookahStatus"] == "PREPARING"
        # Overall status is still PREPARING because Hookah is still PREPARING
        assert order_st["status"] == "PREPARING"

        # (d) Hookah marks shisha READY -> all 3 stations are now READY -> parent reconciles to READY
        h_ready_res = await client.put(
            f"/api/v1/orders/{order_id}/status",
            json={"hookahStatus": "READY"},
            headers=hookah_headers
        )
        assert h_ready_res.status_code == 200
        order_st = h_ready_res.json()
        assert order_st["hookahStatus"] == "READY"
        assert order_st["kitchenStatus"] == "READY"
        assert order_st["barStatus"] == "READY"
        assert order_st["status"] == "READY"

        # (e) Hookah marks shisha COMPLETED / SERVED
        h_comp_res = await client.put(
            f"/api/v1/orders/{order_id}/status",
            json={"hookahStatus": "COMPLETED"},
            headers=hookah_headers
        )
        assert h_comp_res.status_code == 200
        order_st = h_comp_res.json()
        assert order_st["hookahStatus"] == "COMPLETED"
        assert order_st["kitchenStatus"] == "READY"
        assert order_st["barStatus"] == "READY"

        # (f) Waiter delivers order to table -> overall status reconciles to DELIVERED/COMPLETED
        waiter_headers = {
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Role": "WAITER",
            "X-Staff-Id": "staff-waiter-01",
        }
        deliv_res = await client.put(
            f"/api/v1/orders/{order_id}/status",
            json={"status": "DELIVERED"},
            headers=waiter_headers
        )
        assert deliv_res.status_code == 200
        assert deliv_res.json()["status"] == "DELIVERED"

        # 9. Tenant Isolation
        # Staff from other_rest_id cannot see rest_id's orders
        iso_res = await client.get(
            f"/api/v1/orders/restaurant/{rest_id}?station=HOOKAH",
            headers=other_rest_headers
        )
        assert iso_res.status_code == 403 or len(iso_res.json()) == 0

        # Staff from other_rest_id cannot update rest_id's order
        bad_update = await client.put(
            f"/api/v1/orders/{order_id}/status",
            json={"hookahStatus": "PREPARING"},
            headers=other_rest_headers
        )
        assert bad_update.status_code in (403, 404)

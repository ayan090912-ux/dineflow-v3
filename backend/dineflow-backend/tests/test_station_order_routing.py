import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone

from app.main import app
from app.modules.restaurants.models import Restaurant, RestaurantMembership
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.orders.models import Order, OrderItem

@pytest.mark.asyncio
async def test_station_order_routing_and_isolation(db_session):
    rest_id = "rest-routing-test"
    rest = Restaurant(
        id=rest_id,
        name="Routing Test Restaurant",
        slug="routing-test-rest",
        owner_uid="owner-routing-uid",
        owner_email="owner-routing@example.com",
        lifecycle_status="LIVE",
        is_approved=True,
    )
    db_session.add(rest)

    owner_mem = RestaurantMembership(
        id="mem-routing-owner",
        restaurant_id=rest_id,
        user_uid="owner-routing-uid",
        user_email="owner-routing@example.com",
        role="OWNER",
    )
    db_session.add(owner_mem)

    # Add Category
    cat_main = MenuCategory(
        id="cat-routing-main",
        restaurant_id=rest_id,
        name="Main Course",
        sort_order=1,
    )
    cat_bar = MenuCategory(
        id="cat-routing-bar",
        restaurant_id=rest_id,
        name="Beverages",
        sort_order=2,
    )
    db_session.add(cat_main)
    db_session.add(cat_bar)

    # Authoritative Menu Items
    item_keema = MenuItem(
        id="item-routing-keema",
        restaurant_id=rest_id,
        category_id="cat-routing-main",
        name="Chicken Keema",
        price=430.0,
        target_destination="KITCHEN",
        is_alcoholic=False,
    )
    item_burger = MenuItem(
        id="item-routing-burger",
        restaurant_id=rest_id,
        category_id="cat-routing-main",
        name="Classic Burger",
        price=350.0,
        target_destination="KITCHEN",
        is_alcoholic=False,
    )
    item_beer = MenuItem(
        id="item-routing-beer",
        restaurant_id=rest_id,
        category_id="cat-routing-bar",
        name="Kingfisher Beer",
        price=340.0,
        target_destination="BAR",
        is_alcoholic=True,
    )
    item_mojito = MenuItem(
        id="item-routing-mojito",
        restaurant_id=rest_id,
        category_id="cat-routing-bar",
        name="Mojito Cocktail",
        price=290.0,
        target_destination="BAR",
        is_alcoholic=False,
    )
    db_session.add_all([item_keema, item_burger, item_beer, item_mojito])
    await db_session.commit()

    from app.core.security.jwt import create_access_token
    import uuid

    owner_token = create_access_token(
        subject=uuid.uuid4(),
        scope="OWNER",
        extra_claims={
            "uid": "owner-routing-uid",
            "email": "owner-routing@example.com",
            "role": "OWNER",
            "restaurant_id": rest_id
        }
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        owner_headers = {
            "Authorization": f"Bearer {owner_token}",
        }
        bar_headers = {
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Role": "BARTENDER",
            "X-Staff-Id": "staff-bartender-01",
        }
        kitchen_headers = {
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Role": "CHEF",
            "X-Staff-Id": "staff-chef-01",
        }
        waiter_headers = {
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Role": "WAITER",
            "X-Staff-Id": "staff-waiter-01",
        }

        # 1. Create order with mixed items
        # Intentionally tamper client targetDestination on Chicken Keema to 'BAR'
        order_payload = {
            "restaurantId": rest_id,
            "tableNumber": "Table 02",
            "items": [
                {
                    "menuItemId": "item-routing-keema",
                    "name": "Chicken Keema",
                    "price": 430.0,
                    "quantity": 1,
                    "targetDestination": "BAR",  # BOGUS CLIENT ASSIGNMENT
                },
                {
                    "menuItemId": "item-routing-burger",
                    "name": "Classic Burger",
                    "price": 350.0,
                    "quantity": 1,
                    "targetDestination": "KITCHEN",
                },
                {
                    "menuItemId": "item-routing-beer",
                    "name": "Kingfisher Beer",
                    "price": 340.0,
                    "quantity": 2,
                    "targetDestination": "BAR",
                },
                {
                    "menuItemId": "item-routing-mojito",
                    "name": "Mojito Cocktail",
                    "price": 290.0,
                    "quantity": 1,
                    "targetDestination": "BAR",
                },
            ]
        }
        create_resp = await client.post("/api/v1/orders", json=order_payload)
        assert create_resp.status_code == 201, f"Failed order creation: {create_resp.text}"
        created_order = create_resp.json()
        order_id = created_order["id"]

        # Assert server authoritatively overrode client-tampered station
        for it in created_order["items"]:
            if it["name"] == "Chicken Keema":
                assert it["targetDestination"] == "KITCHEN", "Chicken Keema must be routed to KITCHEN!"
            elif it["name"] == "Kingfisher Beer":
                assert it["targetDestination"] == "BAR", "Kingfisher Beer must be routed to BAR!"

        # 2. Query Bar Queue with station=BAR
        bar_resp = await client.get(f"/api/v1/orders/restaurant/{rest_id}?station=BAR", headers=bar_headers)
        assert bar_resp.status_code == 200
        bar_orders = bar_resp.json()
        assert len(bar_orders) == 1
        bar_items = bar_orders[0]["items"]
        bar_item_names = [i["name"] for i in bar_items]
        assert "Kingfisher Beer" in bar_item_names
        assert "Mojito Cocktail" in bar_item_names
        assert "Chicken Keema" not in bar_item_names, "Bar Terminal must NOT see Chicken Keema!"
        assert "Classic Burger" not in bar_item_names, "Bar Terminal must NOT see Classic Burger!"

        # 3. Query Kitchen Queue with station=KITCHEN
        kitch_resp = await client.get(f"/api/v1/orders/restaurant/{rest_id}?station=KITCHEN", headers=kitchen_headers)
        assert kitch_resp.status_code == 200
        kitch_orders = kitch_resp.json()
        assert len(kitch_orders) == 1
        kitch_items = kitch_orders[0]["items"]
        kitch_item_names = [i["name"] for i in kitch_items]
        assert "Chicken Keema" in kitch_item_names
        assert "Classic Burger" in kitch_item_names
        assert "Kingfisher Beer" not in kitch_item_names, "Kitchen Terminal must NOT see Beer!"
        assert "Mojito Cocktail" not in kitch_item_names, "Kitchen Terminal must NOT see Cocktail!"

        # 4. Query Waiter / Owner (no station) -> Must see all 4 items
        owner_resp = await client.get(f"/api/v1/orders/restaurant/{rest_id}", headers=owner_headers)
        assert owner_resp.status_code == 200
        owner_orders = owner_resp.json()
        assert len(owner_orders) == 1
        owner_items = owner_orders[0]["items"]
        assert len(owner_items) == 4, "Waiter and Owner must see all 4 items!"

        # 5. Station Status Isolation
        # Bar marks drinks PREPARING -> bar_status='PREPARING', kitchen_status untouched
        bar_prep_resp = await client.put(f"/api/v1/orders/{order_id}/status", json={"barStatus": "PREPARING"}, headers=bar_headers)
        assert bar_prep_resp.status_code == 200
        ord_data = bar_prep_resp.json()
        assert ord_data["barStatus"] == "PREPARING"
        assert ord_data["kitchenStatus"] == "PENDING"
        assert ord_data["status"] == "PREPARING"

        # Kitchen marks food READY -> kitchen_status='READY', bar_status untouched
        kitch_ready_resp = await client.put(f"/api/v1/orders/{order_id}/status", json={"kitchenStatus": "READY"}, headers=kitchen_headers)
        assert kitch_ready_resp.status_code == 200
        ord_data = kitch_ready_resp.json()
        assert ord_data["kitchenStatus"] == "READY"
        assert ord_data["barStatus"] == "PREPARING"
        # Overall status is still PREPARING because drinks are not ready yet
        assert ord_data["status"] == "PREPARING"

        # Bar marks drinks READY -> both are now ready -> overall status='READY'
        bar_ready_resp = await client.put(f"/api/v1/orders/{order_id}/status", json={"barStatus": "READY"}, headers=bar_headers)
        assert bar_ready_resp.status_code == 200
        ord_data = bar_ready_resp.json()
        assert ord_data["barStatus"] == "READY"
        assert ord_data["kitchenStatus"] == "READY"
        assert ord_data["status"] == "READY"

        # Bar marks drinks COMPLETED (handed over)
        bar_comp_resp = await client.put(f"/api/v1/orders/{order_id}/status", json={"barStatus": "COMPLETED"}, headers=bar_headers)
        assert bar_comp_resp.status_code == 200
        ord_data = bar_comp_resp.json()
        assert ord_data["barStatus"] == "COMPLETED"
        assert ord_data["kitchenStatus"] == "READY"

        # Waiter delivers order to table
        deliv_resp = await client.put(f"/api/v1/orders/{order_id}/status", json={"status": "DELIVERED"}, headers=waiter_headers)
        assert deliv_resp.status_code == 200
        ord_data = deliv_resp.json()
        assert ord_data["status"] == "DELIVERED"

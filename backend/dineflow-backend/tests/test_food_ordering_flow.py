import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_food_ordering_reproduce_and_verify():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest_id = "rest-test-ordering-101"
        rest_slug = "test-ordering-bistro"
        owner_email = "owner_ordering@test.com"
        owner_uid = "uid_ordering_owner"
        headers_owner = {"Authorization": f"Bearer firebase_token_owner::{owner_uid}::{owner_email}"}

        # 0. Create restaurant
        res_rest = await client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": "Test Ordering Bistro",
            "slug": rest_slug,
            "ownerEmail": owner_email,
            "ownerUid": owner_uid,
            "hasTables": True,
            "hasKitchen": True,
            "taxPercentage": 5.0,
        })
        assert res_rest.status_code == 201

        # Seed Table 01
        res_tbl = await client.post(f"/api/v1/restaurants/{rest_id}/tables", json={
            "id": f"tbl-{rest_id}-table_01",
            "tableNumber": "Table 01",
            "capacity": 4,
            "section": "Main Hall"
        }, headers=headers_owner)
        assert res_tbl.status_code == 201

        # 1. Customer queries menu by SLUG before any items added
        res_menu_init = await client.get(f"/api/v1/restaurants/{rest_slug}/menu")
        assert res_menu_init.status_code == 200
        data_init = res_menu_init.json()
        assert len(data_init["items"]) == 0

        # 2. Owner adds a new food item "Butter Garlic Naan" ₹120 in "Starters & Appetizers"
        naan_payload = {
            "name": "Butter Garlic Naan",
            "description": "Crispy clay oven naan with fresh garlic",
            "price": 120.0,
            "categoryId": "cat-starters",
            "isAvailable": True,
            "isVegetarian": True,
            "targetDestination": "KITCHEN"
        }
        res_create = await client.post(f"/api/v1/restaurants/{rest_id}/menu", json=naan_payload, headers=headers_owner)
        assert res_create.status_code == 201
        naan_item = res_create.json()
        naan_id = naan_item["id"]

        # 3. Customer queries menu by SLUG again: BUG 1 CHECK - Cache Invalidation by Slug
        res_menu_slug = await client.get(f"/api/v1/restaurants/{rest_slug}/menu")
        assert res_menu_slug.status_code == 200
        items_slug = res_menu_slug.json()["items"]
        # If cache invalidation by slug failed, items_slug will be empty!
        found_naan = [i for i in items_slug if i["id"] == naan_id]
        assert len(found_naan) == 1, f"Expected Butter Garlic Naan in slug menu, got items: {items_slug}"

        # 4. Customer submits order with the new food item
        order_payload = {
            "restaurantId": rest_id,
            "tableNumber": "Table 01",
            "tableId": f"tbl-{rest_id}-table_01",
            "orderType": "DINE_IN",
            "customerName": "Rohan Guest",
            "items": [
                {
                    "menuItemId": naan_id,
                    "name": "Butter Garlic Naan",
                    "price": 120.0,
                    "quantity": 2,
                    "targetDestination": "KITCHEN"
                }
            ]
        }
        res_order = await client.post("/api/v1/orders", json=order_payload)
        assert res_order.status_code == 201
        order_data = res_order.json()
        assert order_data["id"] is not None
        assert order_data["subtotal"] == 240.0
        assert order_data["total_amount"] == 252.0  # 240 + 5% tax (12)
        assert order_data["kitchen_status"] == "PENDING"
        ord_id = order_data["id"]

        # 5. Verify order is visible to customer via session / table
        res_cust_orders = await client.get("/api/v1/orders/customer", params={
            "restaurant_id": rest_slug,
            "table_id": f"tbl-{rest_id}-table_01",
            "table_session_id": order_data["table_session_id"]
        })
        assert res_cust_orders.status_code == 200
        cust_orders = res_cust_orders.json()
        assert len(cust_orders) >= 1
        assert cust_orders[0]["id"] == ord_id

        # 6. Verify Kitchen Terminal sees the order
        res_kitchen = await client.get(f"/api/v1/orders/restaurant/{rest_id}", params={
            "station": "KITCHEN"
        }, headers=headers_owner)
        assert res_kitchen.status_code == 200
        kitchen_orders = res_kitchen.json()
        assert any(o["id"] == ord_id for o in kitchen_orders)

        # 7. BUG 2 CHECK: Authoritative Pricing Enforcement
        # Customer tries to tamper with price: claims price is ₹1 instead of ₹120
        tampered_order_payload = {
            "restaurantId": rest_id,
            "tableNumber": "Table 01",
            "tableId": f"tbl-{rest_id}-table_01",
            "orderType": "DINE_IN",
            "customerName": "Hacker Guest",
            "items": [
                {
                    "menuItemId": naan_id,
                    "name": "Butter Garlic Naan",
                    "price": 1.0,  # Tampered price!
                    "quantity": 1,
                    "targetDestination": "KITCHEN"
                }
            ]
        }
        res_tampered = await client.post("/api/v1/orders", json=tampered_order_payload)
        assert res_tampered.status_code == 201
        tampered_data = res_tampered.json()
        assert tampered_data["subtotal"] == 120.0, f"Expected authoritative subtotal 120.0, got {tampered_data['subtotal']}"
        assert tampered_data["total_amount"] == 126.0, f"Expected authoritative total 126.0, got {tampered_data['total_amount']}"

        # 8. BUG 3 CHECK: Unavailable Item Ordering Rejection
        # Owner marks Naan as UNAVAILABLE
        res_toggle = await client.put(f"/api/v1/restaurants/{rest_id}/menu/{naan_id}", json={
            "isAvailable": False
        }, headers=headers_owner)
        assert res_toggle.status_code == 200

        # Customer ordering unavailable item must be rejected with 400 Bad Request
        res_order_unavail = await client.post("/api/v1/orders", json=order_payload)
        assert res_order_unavail.status_code == 400, f"Expected 400 for unavailable item, got {res_order_unavail.status_code}: {res_order_unavail.text}"

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_menu_system_end_to_end_scenarios():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest_a = "rest-tenant-menu-a-100"
        rest_b = "rest-tenant-menu-b-200"

        # TEST 1: GET Menu for Restaurant A
        res_get_a = await client.get(f"/api/v1/restaurants/{rest_a}/menu")
        assert res_get_a.status_code == 200
        data_a = res_get_a.json()
        assert "categories" in data_a
        assert "items" in data_a
        init_items_count = len(data_a["items"])

        # TEST 2: Create "DEBUG PIZZA" ₹299 for Restaurant A
        pizza_payload = {
            "name": "DEBUG PIZZA",
            "description": "Test pizza with extra cheese",
            "price": 299.0,
            "categoryId": "cat-mains-slug",  # Non-existent category ID -> triggers auto-resolution
            "isAvailable": True,
            "isVegetarian": True,
            "targetDestination": "KITCHEN"
        }
        res_create = await client.post(f"/api/v1/restaurants/{rest_a}/menu", json=pizza_payload)
        assert res_create.status_code == 201, f"Create menu item failed: {res_create.text}"
        item_pizza = res_create.json()
        item_id = item_pizza["id"]
        assert item_pizza["name"] == "DEBUG PIZZA"
        assert float(item_pizza["price"]) == 299.0

        # TEST 3: Query GET Menu again -> Verify DEBUG PIZZA is in database
        res_get_after = await client.get(f"/api/v1/restaurants/{rest_a}/menu")
        assert res_get_after.status_code == 200
        items_after = res_get_after.json()["items"]
        assert len(items_after) == init_items_count + 1
        created_item = [i for i in items_after if i["id"] == item_id][0]
        assert created_item["name"] == "DEBUG PIZZA"
        assert float(created_item["price"]) == 299.0

        # TEST 4: Edit DEBUG PIZZA price ₹299 -> ₹349
        res_update_price = await client.put(f"/api/v1/restaurants/{rest_a}/menu/{item_id}", json={"price": 349.0})
        assert res_update_price.status_code == 200
        updated_item = res_update_price.json()
        assert float(updated_item["price"]) == 349.0

        # TEST 5: Verify GET Menu returns updated price ₹349
        res_get_price = await client.get(f"/api/v1/restaurants/{rest_a}/menu")
        items_price = res_get_price.json()["items"]
        updated_in_db = [i for i in items_price if i["id"] == item_id][0]
        assert float(updated_in_db["price"]) == 349.0

        # TEST 6: Toggle availability -> isAvailable = False
        res_update_avail = await client.put(f"/api/v1/restaurants/{rest_a}/menu/{item_id}", json={"isAvailable": False})
        assert res_update_avail.status_code == 200
        assert res_update_avail.json()["is_available"] is False

        # TEST 7: Verify GET Menu returns is_available = False
        res_get_avail = await client.get(f"/api/v1/restaurants/{rest_a}/menu")
        items_avail = res_get_avail.json()["items"]
        disabled_in_db = [i for i in items_avail if i["id"] == item_id][0]
        assert disabled_in_db["is_available"] is False

        # TEST 8: Multi-Tenant Isolation -> Restaurant B menu must NOT contain DEBUG PIZZA
        res_get_b = await client.get(f"/api/v1/restaurants/{rest_b}/menu")
        assert res_get_b.status_code == 200
        items_b = res_get_b.json()["items"]
        matching_b = [i for i in items_b if i["name"] == "DEBUG PIZZA"]
        assert len(matching_b) == 0, "Restaurant B MUST NOT receive Restaurant A's menu items"

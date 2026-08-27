import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_end_to_end_full_restaurant_operations():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest_a = "rest-1787446097984"
        rest_b = "rest-isolation-tenant-999"
        table_num = "Table 03"

        # TEST 17 & TEST 1: Owner adds Food Item (DEBUG PIZZA, ₹299, KITCHEN)
        pizza_payload = {
            "name": "DEBUG PIZZA",
            "description": "Crispy wood-fired cheese pizza",
            "price": 299.0,
            "categoryId": "Starters & Appetizers",
            "isAvailable": True,
            "isVegetarian": True,
            "targetDestination": "KITCHEN"
        }
        res_pizza = await client.post(f"/api/v1/restaurants/{rest_a}/menu", json=pizza_payload)
        assert res_pizza.status_code == 201, f"Failed adding DEBUG PIZZA: {res_pizza.text}"
        pizza_item = res_pizza.json()
        assert pizza_item["name"] == "DEBUG PIZZA"
        assert float(pizza_item["price"]) == 299.0

        # TEST 18: Owner adds Drink Item (DEBUG MOJITO, ₹199, BAR)
        mojito_payload = {
            "name": "DEBUG MOJITO",
            "description": "Fresh mint & lime cocktail",
            "price": 199.0,
            "categoryId": "Cocktails",
            "isAvailable": True,
            "isVegetarian": False,
            "targetDestination": "BAR"
        }
        res_mojito = await client.post(f"/api/v1/restaurants/{rest_a}/menu", json=mojito_payload)
        assert res_mojito.status_code == 201, f"Failed adding DEBUG MOJITO: {res_mojito.text}"
        mojito_item = res_mojito.json()
        assert mojito_item["name"] == "DEBUG MOJITO"
        assert float(mojito_item["price"]) == 199.0

        # TEST 3: Verify both exist in DB via GET Menu
        res_menu = await client.get(f"/api/v1/restaurants/{rest_a}/menu")
        assert res_menu.status_code == 200
        menu_items = res_menu.json()["items"]
        item_names = [i["name"] for i in menu_items]
        assert "DEBUG PIZZA" in item_names
        assert "DEBUG MOJITO" in item_names

        # TEST 19: Owner edits price -> DEBUG PIZZA ₹299 -> ₹319
        res_edit_price = await client.put(f"/api/v1/restaurants/{rest_a}/menu/{pizza_item['id']}", json={"price": 319.0})
        assert res_edit_price.status_code == 200
        assert float(res_edit_price.json()["price"]) == 319.0

        # Restore price to 299
        await client.put(f"/api/v1/restaurants/{rest_a}/menu/{pizza_item['id']}", json={"price": 299.0})

        # TEST 20: Owner disables item & re-enables
        res_dis = await client.put(f"/api/v1/restaurants/{rest_a}/menu/{pizza_item['id']}", json={"isAvailable": False})
        assert res_dis.status_code == 200
        assert res_dis.json()["is_available"] is False

        res_en = await client.put(f"/api/v1/restaurants/{rest_a}/menu/{pizza_item['id']}", json={"isAvailable": True})
        assert res_en.status_code == 200
        assert res_en.json()["is_available"] is True

        # TEST 1: QR Scan Creates TableSession A
        res_sess_a = await client.get(f"/api/v1/restaurants/{rest_a}/tables/tbl-03/session?table_number={table_num}")
        assert res_sess_a.status_code == 200
        session_a = res_sess_a.json()
        session_a_id = session_a["id"]
        assert session_a["status"] == "ACTIVE"

        # TEST 2 & TEST 3: Customer A places Order for DEBUG PIZZA + DEBUG MOJITO
        order_payload = {
            "restaurantId": rest_a,
            "tableId": "tbl-03",
            "tableNumber": table_num,
            "tableSessionId": session_a_id,
            "customerName": "Customer A",
            "items": [
                {
                    "menuItemId": pizza_item["id"],
                    "name": "DEBUG PIZZA",
                    "price": 299.0,
                    "quantity": 1,
                    "targetDestination": "KITCHEN"
                },
                {
                    "menuItemId": mojito_item["id"],
                    "name": "DEBUG MOJITO",
                    "price": 199.0,
                    "quantity": 1,
                    "targetDestination": "BAR"
                }
            ]
        }
        res_order = await client.post("/api/v1/orders", json=order_payload)
        assert res_order.status_code == 201, f"Failed placing customer order: {res_order.text}"
        order_a = res_order.json()
        order_a_id = order_a["id"]
        assert order_a["tableSessionId"] == session_a_id
        assert order_a.get("eta_target_timestamp") is None, "PENDING orders MUST NOT have an ETA timestamp generated"

        # Update order to PREPARING to verify server ETA timestamp generation
        res_prep = await client.put(f"/api/v1/orders/{order_a_id}/status", json={"kitchenStatus": "PREPARING", "estimatedPrepTimeMinutes": 15})
        assert res_prep.status_code == 200
        prep_order = res_prep.json()
        assert prep_order.get("eta_target_timestamp") is not None, "PREPARING order MUST generate authoritative server ETA timestamp"

        # TEST 4, TEST 5, TEST 6: Terminal order retrieval & kitchen/bar item routing
        res_active_orders = await client.get(f"/api/v1/orders/restaurant/{rest_a}?active_only=true")
        assert res_active_orders.status_code == 200
        active_orders = res_active_orders.json()
        order_ids = [o["id"] for o in active_orders]
        assert order_a_id in order_ids

        # TEST 7: Water Request reaches waiter
        req_payload = {
            "restaurantId": rest_a,
            "tableNumber": table_num,
            "tableId": "tbl-03",
            "requestType": "WATER",
            "tableSessionId": session_a_id
        }
        res_req = await client.post("/api/v1/customer-requests", json=req_payload)
        assert res_req.status_code == 201
        req_data = res_req.json()
        assert req_data["requestType"] == "WATER"

        # TEST 8 & TEST 9: Close Table 03 Session
        res_close = await client.post(f"/api/v1/restaurants/{rest_a}/tables/tbl-03/close-session")
        assert res_close.status_code == 200
        close_res = res_close.json()
        assert close_res["status"] == "success"

        # TEST 9: Table status becomes AVAILABLE
        res_tables = await client.get(f"/api/v1/restaurants/{rest_a}/tables")
        assert res_tables.status_code == 200
        tables_list = res_tables.json()
        tbl_03 = [t for t in tables_list if t["table_number"] == table_num or t["id"] == "tbl-03"][0]
        assert tbl_03["status"] == "AVAILABLE"
        assert tbl_03["is_occupied"] is False

        # TEST 10: Old session remains historical in DB
        res_customer_orders_old = await client.get(f"/api/v1/orders/customer?restaurant_id={rest_a}&table_session_id={session_a_id}")
        assert res_customer_orders_old.status_code == 200
        assert len(res_customer_orders_old.json()) == 1

        # TEST 11: New Customer B scans SAME Table 03 QR -> Backend MUST create Session B
        res_sess_b = await client.get(f"/api/v1/restaurants/{rest_a}/tables/tbl-03/session?table_number={table_num}")
        assert res_sess_b.status_code == 200
        session_b = res_sess_b.json()
        session_b_id = session_b["id"]
        assert session_b_id != session_a_id
        assert session_b["status"] == "ACTIVE"

        # TEST 12: Customer B sees ZERO old orders from Session A
        res_cust_b_orders = await client.get(f"/api/v1/orders/customer?restaurant_id={rest_a}&table_id=tbl-03")
        assert res_cust_b_orders.status_code == 200
        assert len(res_cust_b_orders.json()) == 0, "Customer B MUST NOT see Customer A's historical orders"

        # TEST 13: Customer B orders DEBUG PIZZA -> belongs ONLY to Session B
        order_b_payload = {
            "restaurantId": rest_a,
            "tableId": "tbl-03",
            "tableNumber": table_num,
            "tableSessionId": session_b_id,
            "customerName": "Customer B",
            "items": [
                {
                    "menuItemId": pizza_item["id"],
                    "name": "DEBUG PIZZA",
                    "price": 299.0,
                    "quantity": 1,
                    "targetDestination": "KITCHEN"
                }
            ]
        }
        res_order_b = await client.post("/api/v1/orders", json=order_b_payload)
        assert res_order_b.status_code == 201
        order_b = res_order_b.json()
        assert order_b["tableSessionId"] == session_b_id

        # TEST 16: Multi-Tenant Isolation -> Restaurant B cannot see Restaurant A menu/orders
        res_b_menu = await client.get(f"/api/v1/restaurants/{rest_b}/menu")
        assert res_b_menu.status_code == 200
        b_menu_items = res_b_menu.json()["items"]
        b_names = [i["name"] for i in b_menu_items]
        assert "DEBUG PIZZA" not in b_names
        assert "DEBUG MOJITO" not in b_names

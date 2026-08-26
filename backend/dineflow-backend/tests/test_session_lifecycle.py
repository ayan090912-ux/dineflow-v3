import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_full_table_session_lifecycle_scenarios():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest_a = "rest-tenant-a-100"
        rest_b = "rest-tenant-b-200"
        tbl_num = "Table 03"
        tbl_id = f"tbl-{rest_a}-table_03"

        # TEST 1: Table 03 starts VACANT.
        res_tables_init = await client.get(f"/api/v1/restaurants/{rest_a}/tables")
        assert res_tables_init.status_code == 200
        tables_init = res_tables_init.json()
        matching_tbl = [t for t in tables_init if t["id"] == tbl_id or t["table_number"] == tbl_num]
        if matching_tbl:
            assert matching_tbl[0]["status"] == "AVAILABLE"
            assert matching_tbl[0]["is_occupied"] is False

        # TEST 2: Customer A scans Table 03 QR -> Session A created (status = ACTIVE)
        res_sess_a = await client.get(f"/api/v1/restaurants/{rest_a}/tables/{tbl_id}/session?table_number={tbl_num}")
        assert res_sess_a.status_code == 200
        sess_a = res_sess_a.json()
        session_a_id = sess_a["id"]
        assert sess_a["status"] == "ACTIVE"

        # Verify table status updated to OCCUPIED
        res_tables_active = await client.get(f"/api/v1/restaurants/{rest_a}/tables")
        tables_active = res_tables_active.json()
        active_tbl = [t for t in tables_active if t["id"] == tbl_id or t["table_number"] == tbl_num][0]
        assert active_tbl["status"] == "OCCUPIED"
        assert active_tbl["is_occupied"] is True

        # TEST 3: Customer A orders Pizza -> Associated with Session A
        order_payload_a = {
            "restaurantId": rest_a,
            "tableId": tbl_id,
            "tableNumber": tbl_num,
            "tableSessionId": session_a_id,
            "customerName": "Customer A",
            "items": [{"id": "item-pizza", "menuItemId": "item-pizza", "name": "Pizza", "price": 18.0, "quantity": 1}]
        }
        res_order_a = await client.post("/api/v1/orders", json=order_payload_a)
        assert res_order_a.status_code == 201
        order_a = res_order_a.json()
        order_a_id = order_a["id"]
        assert order_a["tableSessionId"] == session_a_id

        # TEST 4: Customer A requests Water -> Associated with Session A
        req_payload_a = {
            "restaurantId": rest_a,
            "tableId": tbl_id,
            "tableNumber": tbl_num,
            "tableSessionId": session_a_id,
            "requestType": "WATER",
            "message": "Water requested for Session A"
        }
        res_req_a = await client.post("/api/v1/customer-requests", json=req_payload_a)
        assert res_req_a.status_code == 201
        req_a = res_req_a.json()
        assert req_a["tableSessionId"] == session_a_id
        assert req_a["status"] == "PENDING"

        # TEST 5: Waiter completes service request
        res_req_comp = await client.patch(f"/api/v1/customer-requests/{req_a['id']}", json={"status": "COMPLETED"})
        assert res_req_comp.status_code == 200
        assert res_req_comp.json()["status"] == "COMPLETED"

        # TEST 6: Waiter clicks CLOSE TABLE -> Session A = CLOSED, Table 03 = VACANT
        res_close = await client.post(f"/api/v1/restaurants/{rest_a}/tables/{tbl_id}/close-session")
        assert res_close.status_code == 200
        assert res_close.json()["status"] == "success"

        # Verify table status reset to AVAILABLE/VACANT in GET /tables
        res_tables_closed = await client.get(f"/api/v1/restaurants/{rest_a}/tables")
        tbl_closed = [t for t in res_tables_closed.json() if t["id"] == tbl_id or t["table_number"] == tbl_num][0]
        assert tbl_closed["status"] == "AVAILABLE"
        assert tbl_closed["is_occupied"] is False

        # TEST 7: Verify historical data preserved (Order #A still exists in DB)
        res_all_orders = await client.get(f"/api/v1/orders/restaurant/{rest_a}")
        assert res_all_orders.status_code == 200
        all_orders = res_all_orders.json()
        hist_order_a = [o for o in all_orders if o["id"] == order_a_id]
        assert len(hist_order_a) == 1
        assert hist_order_a[0]["tableSessionId"] == session_a_id

        # TEST 8: Customer B scans Table 03 QR -> Session B created (NEW Session ID)
        res_sess_b = await client.get(f"/api/v1/restaurants/{rest_a}/tables/{tbl_id}/session?table_number={tbl_num}")
        assert res_sess_b.status_code == 200
        sess_b = res_sess_b.json()
        session_b_id = sess_b["id"]
        assert session_b_id != session_a_id, "New QR scan MUST create a new session ID"
        assert sess_b["status"] == "ACTIVE"

        # Verify Customer B querying live orders gets EMPTY LIST (Pizza from Session A is hidden)
        res_cust_orders_b = await client.get(f"/api/v1/orders/customer?restaurant_id={rest_a}&table_id={tbl_id}&table_session_id={session_b_id}")
        assert res_cust_orders_b.status_code == 200
        assert res_cust_orders_b.json() == [], "Customer B MUST NOT see Customer A's orders"

        # TEST 9: Customer B orders Burger -> Associated with Session B
        order_payload_b = {
            "restaurantId": rest_a,
            "tableId": tbl_id,
            "tableNumber": tbl_num,
            "tableSessionId": session_b_id,
            "customerName": "Customer B",
            "items": [{"id": "item-burger", "menuItemId": "item-burger", "name": "Burger", "price": 12.0, "quantity": 1}]
        }
        res_order_b = await client.post("/api/v1/orders", json=order_payload_b)
        assert res_order_b.status_code == 201
        order_b = res_order_b.json()
        assert order_b["tableSessionId"] == session_b_id

        # TEST 10: Query live customer orders for Session B returns ONLY Burger (1 order), NOT Pizza
        res_live_orders_b = await client.get(f"/api/v1/orders/customer?restaurant_id={rest_a}&table_id={tbl_id}&table_session_id={session_b_id}")
        live_orders_b = res_live_orders_b.json()
        assert len(live_orders_b) == 1
        assert live_orders_b[0]["id"] == order_b["id"]

        # TEST 11: Multi-Tenant Isolation (Restaurant B Table 03 must not see Restaurant A data)
        res_rest_b_orders = await client.get(f"/api/v1/orders/customer?restaurant_id={rest_b}&table_id={tbl_id}&table_session_id={session_b_id}")
        assert res_rest_b_orders.status_code == 200
        assert res_rest_b_orders.json() == []

import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_waiter_terminal_end_to_end_suite():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        test_rest_id = f"rest-test-{uuid.uuid4().hex[:6]}"
        test_rest_b = f"rest-test-{uuid.uuid4().hex[:6]}"
        tbl_num = "Table 03"
        tbl_id = f"tbl-{test_rest_id}-table_03"

        # 1. Customer Scans QR for Table 03 (creates active session)
        res_sess = await client.get(f"/api/v1/restaurants/{test_rest_id}/tables/{tbl_id}/session?table_number={tbl_num}")
        assert res_sess.status_code == 200, res_sess.text
        sess_data = res_sess.json()
        assert sess_data["status"] == "ACTIVE"
        session_id_1 = sess_data["id"]

        # 2. Customer creates WATER request
        req_payload = {
            "restaurantId": test_rest_id,
            "tableNumber": tbl_num,
            "tableId": tbl_id,
            "tableSessionId": session_id_1,
            "requestType": "WATER",
            "customTitle": "Water Refill",
            "message": "Cold water please",
            "priority": "MEDIUM",
        }
        res_create_req = await client.post("/api/v1/customer-requests", json=req_payload)
        assert res_create_req.status_code == 201, res_create_req.text
        req_data = res_create_req.json()
        req_id = req_data["id"]
        assert req_data["status"] == "PENDING"
        assert req_data["requestType"] == "WATER"
        assert req_data["tableSessionId"] == session_id_1

        # 3. Waiter retrieves active customer requests for restaurant
        res_get_reqs = await client.get(f"/api/v1/customer-requests?restaurant_id={test_rest_id}")
        assert res_get_reqs.status_code == 200
        reqs_list = res_get_reqs.json()
        assert any(r["id"] == req_id and r["status"] == "PENDING" for r in reqs_list)

        # 4. Waiter accepts request
        res_accept = await client.patch(f"/api/v1/customer-requests/{req_id}", json={"status": "IN_PROGRESS", "waiterName": "Ayaan"})
        assert res_accept.status_code == 200
        assert res_accept.json()["status"] == "IN_PROGRESS"
        assert res_accept.json()["waiterName"] == "Ayaan"

        # 5. Waiter completes request
        res_complete = await client.patch(f"/api/v1/customer-requests/{req_id}", json={"status": "COMPLETED", "waiterName": "Ayaan"})
        assert res_complete.status_code == 200
        assert res_complete.json()["status"] == "COMPLETED"

        # 6. Customer places an order on Table 03
        order_payload = {
            "restaurantId": test_rest_id,
            "tableId": tbl_id,
            "tableNumber": tbl_num,
            "tableSessionId": session_id_1,
            "customerName": "Guest Tester",
            "items": [
                {"menuItemId": "item-1", "name": "Espresso", "quantity": 2, "price": 120.0, "targetDestination": "BAR"}
            ],
            "totalAmount": 240.0,
            "subtotal": 240.0,
        }
        res_ord = await client.post("/api/v1/orders", json=order_payload)
        assert res_ord.status_code == 201
        ord_data = res_ord.json()
        ord_id = ord_data["id"]
        assert ord_data["restaurant_id"] == test_rest_id
        assert ord_data["table_session_id"] == session_id_1

        # 7. Multi-tenant isolation: Restaurant B queries active-sessions & orders
        res_b_sessions = await client.get(f"/api/v1/restaurants/{test_rest_b}/active-sessions")
        assert res_b_sessions.status_code == 200
        assert not any(s["id"] == session_id_1 for s in res_b_sessions.json())

        res_b_orders = await client.get(f"/api/v1/orders/restaurant/{test_rest_b}")
        assert res_b_orders.status_code == 200
        assert not any(o["id"] == ord_id for o in res_b_orders.json())

        # 8. Waiter closes Table 03
        res_close = await client.post(f"/api/v1/restaurants/{test_rest_id}/tables/{tbl_id}/close-session?table_session_id={session_id_1}", json={
            "table_session_id": session_id_1,
            "waiter_name": "Ayaan"
        })
        assert res_close.status_code == 200
        close_data = res_close.json()
        assert close_data["status"] == "success"

        # 9. Verify active-sessions excludes Table 03
        res_active_after = await client.get(f"/api/v1/restaurants/{test_rest_id}/active-sessions")
        assert res_active_after.status_code == 200
        assert not any(s["id"] == session_id_1 for s in res_active_after.json())

        # 10. Verify order on closed table session is completed/finalized
        res_ord_get = await client.get(f"/api/v1/orders/{ord_id}")
        assert res_ord_get.status_code == 200
        assert res_ord_get.json()["status"] == "COMPLETED"

        # 11. New customer scans QR for Table 03 (creates clean NEW session)
        res_new_sess = await client.get(f"/api/v1/restaurants/{test_rest_id}/tables/{tbl_id}/session?table_number={tbl_num}")
        assert res_new_sess.status_code == 200
        new_sess_data = res_new_sess.json()
        assert new_sess_data["id"] != session_id_1
        assert new_sess_data["status"] == "ACTIVE"

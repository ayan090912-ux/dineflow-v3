import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_close_table_session_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest_id = "rest-test-table-close"
        tbl_num = "Table 05"
        tbl_id = f"tbl-{rest_id}-table_05"

        # 1. Create table & active session
        res_sess = await client.get(f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/session?table_number={tbl_num}")
        assert res_sess.status_code == 200
        sess_data = res_sess.json()
        assert sess_data["status"] == "ACTIVE"
        session_id_1 = sess_data["id"]

        # 2. Verify GET /active-sessions includes this session
        res_act1 = await client.get(f"/api/v1/restaurants/{rest_id}/active-sessions")
        assert res_act1.status_code == 200
        act_ids1 = [s["id"] for s in res_act1.json()]
        assert session_id_1 in act_ids1

        # 3. Close table session
        res_close = await client.post(f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/close-session?table_session_id={session_id_1}", json={"table_session_id": session_id_1, "waiter_name": "Ayaan"})
        assert res_close.status_code == 200
        close_data = res_close.json()
        assert close_data["status"] == "success"

        # 4. Idempotency test: close already-closed session
        res_close_again = await client.post(f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/close-session?table_session_id={session_id_1}", json={"table_session_id": session_id_1, "waiter_name": "Ayaan"})
        assert res_close_again.status_code == 200

        # 5. Verify GET /active-sessions EXCLUDES closed session
        res_act2 = await client.get(f"/api/v1/restaurants/{rest_id}/active-sessions")
        assert res_act2.status_code == 200
        act_ids2 = [s["id"] for s in res_act2.json()]
        assert session_id_1 not in act_ids2

        # 6. Verify Table status in GET /tables is AVAILABLE
        res_tables = await client.get(f"/api/v1/restaurants/{rest_id}/tables")
        assert res_tables.status_code == 200
        matching_tbl = [t for t in res_tables.json() if t["id"] == tbl_id][0]
        assert matching_tbl["status"] == "AVAILABLE"
        assert matching_tbl["is_occupied"] is False

        # 7. Place an order on the closed session table before re-opening, verify closed table stays AVAILABLE
        order_payload = {
            "restaurantId": rest_id,
            "tableId": tbl_id,
            "tableNumber": tbl_num,
            "tableSessionId": session_id_1,
            "customerName": "Test Customer",
            "notes": "Historical order test",
            "items": [{"id": "m1", "menuItemId": "m1", "name": "Burger", "price": 15.0, "quantity": 1, "targetDestination": "KITCHEN"}]
        }
        res_ord = await client.post("/api/v1/orders", json=order_payload)
        assert res_ord.status_code == 201
        ord_data = res_ord.json()
        assert ord_data["table_session_id"] != session_id_1

        # Verify old session_id_1 is NOT in active-sessions
        res_act_check = await client.get(f"/api/v1/restaurants/{rest_id}/active-sessions")
        assert res_act_check.status_code == 200
        active_ids_check = [s["id"] for s in res_act_check.json()]
        assert session_id_1 not in active_ids_check

        # 8. Scan QR again -> Creates NEW active session
        res_sess_new = await client.get(f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/session?table_number={tbl_num}")
        assert res_sess_new.status_code == 200
        new_sess_data = res_sess_new.json()
        session_id_2 = new_sess_data["id"]
        assert session_id_2 != session_id_1
        assert new_sess_data["status"] == "ACTIVE"

        # 9. Verify GET /active-sessions returns session_id_2 but NOT session_id_1
        res_act3 = await client.get(f"/api/v1/restaurants/{rest_id}/active-sessions")
        assert res_act3.status_code == 200
        act_ids3 = [s["id"] for s in res_act3.json()]
        assert session_id_2 in act_ids3
        assert session_id_1 not in act_ids3

        # 10. Close session_id_2 using POST close-session
        res_close2 = await client.post(f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/close-session?table_session_id={session_id_2}", json={"table_session_id": session_id_2, "waiter_name": "Ayaan"})
        assert res_close2.status_code == 200

        # 11. Final check: GET /active-sessions is empty for this table
        res_act4 = await client.get(f"/api/v1/restaurants/{rest_id}/active-sessions")
        assert res_act4.status_code == 200
        act_ids4 = [s["id"] for s in res_act4.json()]
        assert session_id_2 not in act_ids4
        assert session_id_1 not in act_ids4

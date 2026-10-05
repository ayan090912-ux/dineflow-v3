import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_table_close_financial_safety_and_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest_id = "rest-test-fin-safety"
        tbl_num = "Table 01"
        tbl_id = f"tbl-{rest_id}-table_01"

        # 0. Create restaurant
        await client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": "Financial Safety Bistro",
            "ownerEmail": "owner@finsafety.com",
            "hasTables": True,
        })

        waiter_headers = {
            "X-Staff-Role": "WAITER",
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Id": "staff-waiter-1"
        }

        # 1. Create table & active session
        res_sess = await client.post(f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/session?table_number={tbl_num}")
        assert res_sess.status_code in [200, 201]
        session_id = res_sess.json()["id"]

        # 2. Place an order
        order_payload = {
            "restaurantId": rest_id,
            "tableId": tbl_id,
            "tableNumber": tbl_num,
            "tableSessionId": session_id,
            "customerName": "Guest 1",
            "items": [{"id": "m1", "menuItemId": "m1", "name": "Pasta", "price": 250.0, "quantity": 1, "targetDestination": "KITCHEN"}]
        }
        res_ord = await client.post("/api/v1/orders", json=order_payload)
        assert res_ord.status_code == 201
        order_id = res_ord.json()["id"]

        # 3. Generate invoice/bill for this table session
        gen_payload = {
            "tableId": tbl_id,
            "tableNumber": tbl_num,
            "tableSessionId": session_id,
            "orderType": "DINE_IN"
        }
        res_bill = await client.post(f"/api/v1/restaurants/{rest_id}/billing/generate-invoice", json=gen_payload)
        assert res_bill.status_code in [200, 201]
        bill_data = res_bill.json()
        bill_id = bill_data["id"]
        assert bill_data["paymentStatus"] == "UNPAID"

        # 4. Attempt unauthenticated close -> must fail with 401
        res_unauth = await client.post(
            f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/close-session",
            json={"table_session_id": session_id, "waiter_name": "Ghost"}
        )
        assert res_unauth.status_code == 401

        # 5. Attempt close with unauthorized role (e.g. CUSTOMER) -> must fail with 401/403
        res_forbidden = await client.post(
            f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/close-session",
            json={"table_session_id": session_id},
            headers={"X-Staff-Role": "CUSTOMER", "X-Staff-Restaurant-Id": rest_id}
        )
        assert res_forbidden.status_code in [401, 403]

        # 6. Attempt normal table close while bill is UNPAID -> must fail with 400 Bad Request
        res_unpaid_close = await client.post(
            f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/close-session?table_session_id={session_id}",
            json={"table_session_id": session_id, "waiter_name": "Walter"},
            headers=waiter_headers
        )
        assert res_unpaid_close.status_code == 400
        assert "unpaid" in res_unpaid_close.json()["detail"].lower()

        # Also attempt billing close-table while unpaid -> must fail with 400 Bad Request
        res_unpaid_bill_close = await client.post(
            f"/api/v1/restaurants/{rest_id}/billing/{bill_id}/close-table",
            headers=waiter_headers
        )
        assert res_unpaid_bill_close.status_code == 400
        assert "unpaid" in res_unpaid_bill_close.json()["detail"].lower()

        # 7. Settle the bill payment (mark as PAID)
        pay_payload = {
            "paymentMethod": "CASH",
            "verifiedBy": "Waiter Walter"
        }
        res_pay = await client.post(
            f"/api/v1/restaurants/{rest_id}/billing/{bill_id}/mark-payment",
            json=pay_payload,
            headers=waiter_headers
        )
        assert res_pay.status_code == 200

        # 8. Attempt normal table close now that payment is PAID -> must SUCCEED with 200
        res_success_close = await client.post(
            f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/close-session?table_session_id={session_id}",
            json={"table_session_id": session_id, "waiter_name": "Walter"},
            headers=waiter_headers
        )
        assert res_success_close.status_code == 200
        close_data = res_success_close.json()
        assert close_data["status"] == "success"

        # 9. Verify table status is now AVAILABLE
        res_tbl = await client.get(f"/api/v1/restaurants/{rest_id}/tables")
        assert res_tbl.status_code == 200
        target_tbl = [t for t in res_tbl.json() if t["id"] == tbl_id][0]
        assert target_tbl["status"] == "AVAILABLE"
        assert target_tbl["is_occupied"] is False

        # 10. Verify historical records preserved: order and bill still exist in database
        res_ord_check = await client.get(f"/api/v1/orders/{order_id}")
        assert res_ord_check.status_code == 200
        assert res_ord_check.json()["id"] == order_id

        res_bill_check = await client.get(f"/api/v1/restaurants/{rest_id}/billing/bills", headers=waiter_headers)
        assert res_bill_check.status_code == 200
        assert any(b["id"] == bill_id for b in res_bill_check.json())


@pytest.mark.asyncio
async def test_multiple_tables_normal_close_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest_id = "rest-test-multi-close"

        # Create restaurant
        await client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": "Multi Table Bistro",
            "ownerEmail": "owner@multiclose.com",
            "hasTables": True,
        })

        waiter_headers = {
            "X-Staff-Role": "WAITER",
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Id": "staff-multi-waiter"
        }

        tables_to_test = ["Table 01", "Table 02", "Table 03"]

        for tbl_num in tables_to_test:
            tbl_id = f"tbl-{rest_id}-{tbl_num.lower().replace(' ', '_')}"

            # 1. Create table & session
            res_sess = await client.post(f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/session?table_number={tbl_num}")
            assert res_sess.status_code in [200, 201]
            sess_id = res_sess.json()["id"]

            # 2. Place order
            res_ord = await client.post("/api/v1/orders", json={
                "restaurantId": rest_id,
                "tableId": tbl_id,
                "tableNumber": tbl_num,
                "tableSessionId": sess_id,
                "customerName": f"Customer for {tbl_num}",
                "items": [{"id": f"item-{tbl_num}", "name": "Item", "price": 100.0, "quantity": 1}]
            })
            assert res_ord.status_code == 201
            ord_id = res_ord.json()["id"]

            # 3. Generate bill
            res_bill = await client.post(f"/api/v1/restaurants/{rest_id}/billing/generate-invoice", json={
                "tableId": tbl_id,
                "tableNumber": tbl_num,
                "tableSessionId": sess_id,
                "orderType": "DINE_IN"
            })
            assert res_bill.status_code in [200, 201]
            bill_id = res_bill.json()["id"]

            # 4. Verify unpaid close is blocked with 400
            res_blocked = await client.post(
                f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/close-session?table_session_id={sess_id}",
                json={"table_session_id": sess_id, "waiter_name": "Walter"},
                headers=waiter_headers
            )
            assert res_blocked.status_code == 400

            # 5. Settle payment
            res_pay = await client.post(
                f"/api/v1/restaurants/{rest_id}/billing/{bill_id}/mark-payment",
                json={"paymentMethod": "CASH", "verifiedBy": "Waiter Walter"},
                headers=waiter_headers
            )
            assert res_pay.status_code == 200

            # 6. Close session
            res_close = await client.post(
                f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/close-session?table_session_id={sess_id}",
                json={"table_session_id": sess_id, "waiter_name": "Walter"},
                headers=waiter_headers
            )
            assert res_close.status_code == 200

            # 7. Verify table is AVAILABLE
            res_tbl = await client.get(f"/api/v1/restaurants/{rest_id}/tables")
            assert res_tbl.status_code == 200
            curr_tbl = [t for t in res_tbl.json() if t["id"] == tbl_id][0]
            assert curr_tbl["status"] == "AVAILABLE"
            assert curr_tbl["is_occupied"] is False

            # 8. Verify order and bill remain
            res_ord_check = await client.get(f"/api/v1/orders/{ord_id}")
            assert res_ord_check.status_code == 200
            res_bills_check = await client.get(f"/api/v1/restaurants/{rest_id}/billing/bills", headers=waiter_headers)
            assert any(b["id"] == bill_id for b in res_bills_check.json())

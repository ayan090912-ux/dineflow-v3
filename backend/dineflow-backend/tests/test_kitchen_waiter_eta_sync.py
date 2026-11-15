import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone, timedelta
from app.main import app
from app.modules.tables.models import Table, TableSession
from app.modules.orders.models import Order
from app.modules.restaurants.models import Restaurant
from app.core.database.connection import AsyncSessionLocal
import uuid

@pytest.mark.asyncio
async def test_kitchen_waiter_eta_sync_complete_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Setup: Create Restaurant, Table, and Orders
        rest_id = f"rest-eta-sync-{uuid.uuid4().hex[:8]}"
        tbl_id = f"tbl-eta-{uuid.uuid4().hex[:6]}"
        tbl_num = "Table 02"

        kitchen_headers = {
            "X-Staff-Role": "CHEF",
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Id": "chef-1",
            "X-Staff-Name": "Chef Gordon",
        }
        waiter_1_headers = {
            "X-Staff-Role": "WAITER",
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Id": "waiter-1",
            "X-Staff-Name": "Walter White",
        }
        waiter_2_headers = {
            "X-Staff-Role": "WAITER",
            "X-Staff-Restaurant-Id": rest_id,
            "X-Staff-Id": "waiter-2",
            "X-Staff-Name": "Jesse Pinkman",
        }

        async with AsyncSessionLocal() as db:
            r = Restaurant(
                id=rest_id,
                name="ETA Test Bistro",
                slug=f"eta-bistro-{uuid.uuid4().hex[:6]}",
                owner_uid="chef-1",
                owner_email="chef@dinely.test",
                lifecycle_status="ACTIVE"
            )
            db.add(r)
            tbl = Table(
                id=tbl_id,
                restaurant_id=rest_id,
                table_number=tbl_num,
                status="OCCUPIED",
                is_occupied=True
            )
            db.add(tbl)
            sess = TableSession(
                id=f"sess-{uuid.uuid4().hex[:8]}",
                restaurant_id=rest_id,
                table_id=tbl_id,
                table_number=tbl_num,
                status="ACTIVE"
            )
            db.add(sess)
            order = Order(
                id=f"ord-eta-{uuid.uuid4().hex[:8]}",
                restaurant_id=rest_id,
                table_id=tbl_id,
                table_number=tbl_num,
                table_session_id=sess.id,
                status="PREPARING",
                kitchen_status="PREPARING",
                bar_status="READY",
                total_amount=1500.0,
                items_json=[
                    {"name": "Paneer Tikka", "quantity": 2, "price": 400.0, "category": "Starters", "targetDestination": "KITCHEN"},
                    {"name": "Mojito", "quantity": 2, "price": 350.0, "category": "Bar", "targetDestination": "BAR"}
                ]
            )
            db.add(order)
            await db.commit()
            order_id = order.id
            session_id = sess.id

        # 1. Kitchen sets custom ETA (25 minutes) via PUT /orders/{order_id}/eta
        eta_payload = {
            "estimatedPrepTimeMinutes": 25,
            "reason": "Large order prep time"
        }
        res_eta = await client.put(f"/api/v1/orders/{order_id}/eta", json=eta_payload, headers=kitchen_headers)
        assert res_eta.status_code == 200, res_eta.text
        data_eta = res_eta.json()
        assert data_eta.get("estimated_prep_time_minutes") == 25 or data_eta.get("estimatedPrepTimeMinutes") == 25
        target_ts = data_eta.get("eta_target_timestamp") or data_eta.get("etaTargetTimestamp")
        assert target_ts is not None

        # Verify Delta ETA: add +5 minutes
        res_delta = await client.patch(f"/api/v1/orders/{order_id}/eta", json={"deltaMinutes": 5}, headers=kitchen_headers)
        assert res_delta.status_code == 200
        data_delta = res_delta.json()
        assert data_delta.get("estimated_prep_time_minutes") == 30 or data_delta.get("estimatedPrepTimeMinutes") == 30

        # 2. Kitchen marks order READY and requests waiter
        res_ready = await client.put(f"/api/v1/orders/{order_id}/status", json={"status": "READY", "kitchenStatus": "READY"}, headers=kitchen_headers)
        assert res_ready.status_code == 200

        res_req_waiter = await client.post(f"/api/v1/orders/{order_id}/request-waiter", json={"station": "KITCHEN"}, headers=kitchen_headers)
        assert res_req_waiter.status_code == 200
        req_waiter_data = res_req_waiter.json()
        assert req_waiter_data["success"] is True

        # 3. Waiter 1 collects the order -> Atomic claim
        res_collect_1 = await client.post(f"/api/v1/orders/{order_id}/collect", json={"waiterName": "Walter White", "station": "KITCHEN"}, headers=waiter_1_headers)
        assert res_collect_1.status_code == 200
        collect_1_data = res_collect_1.json()
        assert collect_1_data["success"] is True
        assert collect_1_data["order"]["delivery_status"] == "COLLECTED"
        assert collect_1_data["order"]["claimed_by"] == "Walter White"

        # 4. Waiter 2 attempts to collect the same order -> Must return 409 Conflict
        res_collect_2 = await client.post(f"/api/v1/orders/{order_id}/collect", json={"waiterName": "Jesse Pinkman", "station": "KITCHEN"}, headers=waiter_2_headers)
        assert res_collect_2.status_code == 409
        assert "already been collected" in res_collect_2.json()["detail"]

        # 5. Waiter 1 delivers the KITCHEN portion of the order
        res_deliver_k = await client.post(f"/api/v1/orders/{order_id}/deliver", json={"waiterName": "Walter White", "station": "KITCHEN"}, headers=waiter_1_headers)
        assert res_deliver_k.status_code == 200
        deliv_k_data = res_deliver_k.json()
        assert deliv_k_data["order"]["kitchen_status"] == "COMPLETED"

        # Bar portion was already ready; now delivering BAR portion finishes the composite order
        res_deliver_b = await client.post(f"/api/v1/orders/{order_id}/deliver", json={"waiterName": "Walter White", "station": "BAR"}, headers=waiter_1_headers)
        assert res_deliver_b.status_code == 200
        deliv_b_data = res_deliver_b.json()
        assert deliv_b_data["order"]["status"] == "DELIVERED"
        assert deliv_b_data["order"]["delivery_status"] == "DELIVERED"

        # 6. Waiter closes the table session with force=True
        res_close = await client.post(
            f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/close-session?table_session_id={session_id}&force=true",
            json={"table_session_id": session_id, "table_number": tbl_num, "waiter_name": "Walter White", "force": True},
            headers=waiter_1_headers
        )
        assert res_close.status_code == 200
        close_data = res_close.json()
        assert close_data["status"] == "success"

        # Verify table is now AVAILABLE
        async with AsyncSessionLocal() as db:
            refreshed_tbl = await db.get(Table, tbl_id)
            assert refreshed_tbl.status == "AVAILABLE"
            assert refreshed_tbl.is_occupied is False
            assert refreshed_tbl.active_session_id is None

            refreshed_sess = await db.get(TableSession, session_id)
            assert refreshed_sess.status == "CLOSED"

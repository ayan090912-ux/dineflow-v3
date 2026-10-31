import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone
import json
import base64

from app.main import app
from app.modules.restaurants.models import Restaurant, RestaurantMembership
from app.modules.tables.models import Table, TableSession
from app.modules.orders.models import Order, Bill


def create_fake_jwt(claims: dict) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_sig"
    return f"{header}.{payload}.{signature}"


@pytest.mark.asyncio
class TestCriticalBillingLifecycle:
    async def _setup_restaurant_and_table(self, db_session):
        rest_id = f"rest-test-{uuid.uuid4().hex[:6]}"
        owner_uid = f"uid-owner-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@dinely.food"

        restaurant = Restaurant(
            id=rest_id,
            name="The Start Lounge & Bar",
            slug=f"the-start-{uuid.uuid4().hex[:4]}",
            owner_uid=owner_uid,
            owner_email=owner_email,
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_bar=True,
            has_hookah=True,
            has_waiter=True,
            tax_percentage=5.0,
            service_charge_percentage=0.0,
            enabled_modules=["kitchen", "bar", "hookah", "waiter", "billing", "tables"],
        )
        membership = RestaurantMembership(
            id=f"mem-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=owner_uid,
            user_email=owner_email,
            role="OWNER",
            is_active=True,
        )
        table = Table(
            id=f"table-{rest_id}-04",
            restaurant_id=rest_id,
            table_number="Table 04",
            section="Main Hall",
            capacity=4,
            status="AVAILABLE",
            is_occupied=False,
            active_session_id=None,
        )
        db_session.add_all([restaurant, membership, table])
        await db_session.commit()

        owner_token = create_fake_jwt({
            "uid": owner_uid,
            "email": owner_email,
            "role": "OWNER",
            "restaurant_id": rest_id,
            "is_admin": False
        })
        waiter_token = create_fake_jwt({
            "uid": f"waiter-{uuid.uuid4().hex[:4]}",
            "email": f"waiter-{uuid.uuid4().hex[:4]}@dinely.food",
            "role": "WAITER",
            "restaurant_id": rest_id,
            "is_admin": False
        })

        return rest_id, table, owner_token, waiter_token

    async def test_scenario_a_empty_table_scan_shows_zero(self, db_session):
        """Scenario A: Empty table scan must NEVER show a fabricated bill or past orders."""
        rest_id, table, owner_token, waiter_token = await self._setup_restaurant_and_table(db_session)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Fetch running table bill
            resp = await ac.get(f"/api/v1/restaurants/{rest_id}/billing/table/{table.table_number}/bill")
            assert resp.status_code == 200, resp.text
            bill_data = resp.json()
            assert bill_data["grandTotal"] == 0.0 or bill_data["grand_total"] == 0.0
            assert bill_data["subtotal"] == 0.0
            assert bill_data["balanceDue"] == 0.0 or bill_data["balance_due"] == 0.0
            assert len(bill_data.get("items", [])) == 0
            assert len(bill_data.get("orders", [])) == 0
            assert bill_data.get("paymentStatus") == "UNPAID"

            # 2. Fetch customer orders
            resp_cust = await ac.get(f"/api/v1/orders/customer?restaurant_id={rest_id}&table_id={table.id}")
            assert resp_cust.status_code == 200
            assert resp_cust.json() == []

            # 3. Check floor plan tables
            resp_tables = await ac.get(f"/api/v1/restaurants/{rest_id}/tables")
            assert resp_tables.status_code == 200
            t_data = next(t for t in resp_tables.json() if t["id"] == table.id)
            assert t_data["sessionTotal"] == 0.0
            assert t_data["orderCount"] == 0
            assert t_data["isOccupied"] is False

    async def test_scenario_b_c_d_incremental_accumulation_food_bar_hookah(self, db_session):
        """Scenarios B, C, D: Food (₹300) + Bar (₹250) + Hookah (₹400) accumulate to the same running bill."""
        rest_id, table, owner_token, waiter_token = await self._setup_restaurant_and_table(db_session)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # Step B: Food Order (₹300)
            order_1_payload = {
                "restaurantId": rest_id,
                "tableNumber": table.table_number,
                "items": [
                    {
                        "id": "food-item-1",
                        "name": "Crispy Truffle Burger",
                        "price": 300.0,
                        "quantity": 1,
                        "category": "Main Course",
                        "fulfillmentStation": "KITCHEN",
                    }
                ],
                "orderType": "DINE_IN",
            }
            resp1 = await ac.post("/api/v1/orders", json=order_1_payload)
            assert resp1.status_code == 201, resp1.text
            ord1 = resp1.json()
            session_id = ord1.get("tableSessionId") or ord1.get("table_session_id")
            assert session_id is not None
            assert ord1.get("kitchenStatus") in ["PENDING", "ACCEPTED", "PREPARING"]

            # Verify running bill after Order 1
            resp_b1 = await ac.get(f"/api/v1/restaurants/{rest_id}/billing/table/{table.table_number}/bill?sessionId={session_id}")
            assert resp_b1.status_code == 200
            b1_data = resp_b1.json()
            assert b1_data["subtotal"] == 300.0
            # 5% tax on 300 is 15.0 => grand total 315.0
            assert b1_data["grandTotal"] == 315.0
            assert len(b1_data["orders"]) == 1

            # Step C: Bar Order (₹250)
            order_2_payload = {
                "restaurantId": rest_id,
                "tableNumber": table.table_number,
                "sessionId": session_id,
                "items": [
                    {
                        "id": "bar-item-1",
                        "name": "Signature Passion Mojito",
                        "price": 250.0,
                        "quantity": 1,
                        "category": "Cocktails",
                        "fulfillmentStation": "BAR",
                    }
                ],
                "orderType": "DINE_IN",
            }
            resp2 = await ac.post("/api/v1/orders", json=order_2_payload)
            assert resp2.status_code == 201, resp2.text
            ord2 = resp2.json()
            assert ord2.get("barStatus") in ["PENDING", "ACCEPTED", "PREPARING"]

            # Verify running bill after Order 2 (300 + 250 = 550 subtotal)
            resp_b2 = await ac.get(f"/api/v1/restaurants/{rest_id}/billing/table/{table.table_number}/bill?sessionId={session_id}")
            assert resp_b2.status_code == 200
            b2_data = resp_b2.json()
            assert b2_data["subtotal"] == 550.0
            # 5% tax on 550 is 27.5 => grand total 577.5 (or 578.0 with nearest rupee round-off)
            assert b2_data["grandTotal"] in [577.5, 578.0]
            assert len(b2_data["orders"]) == 2

            # Step D: Hookah Order (₹400)
            order_3_payload = {
                "restaurantId": rest_id,
                "tableNumber": table.table_number,
                "sessionId": session_id,
                "items": [
                    {
                        "id": "hookah-item-1",
                        "name": "Russian Double Apple Shisha",
                        "price": 400.0,
                        "quantity": 1,
                        "category": "Hookah",
                        "fulfillmentStation": "HOOKAH",
                    }
                ],
                "orderType": "DINE_IN",
            }
            resp3 = await ac.post("/api/v1/orders", json=order_3_payload)
            assert resp3.status_code == 201, resp3.text
            ord3 = resp3.json()
            assert ord3.get("hookahStatus") in ["PENDING", "ACCEPTED", "PREPARING"]

            # Verify running bill after Order 3 (300 + 250 + 400 = 950 subtotal)
            resp_b3 = await ac.get(f"/api/v1/restaurants/{rest_id}/billing/table/{table.table_number}/bill?sessionId={session_id}")
            assert resp_b3.status_code == 200
            b3_data = resp_b3.json()
            assert b3_data["subtotal"] == 950.0
            # 5% tax on 950 is 47.5 => grand total 997.5 (or 998.0 with round-off)
            assert b3_data["grandTotal"] in [997.5, 998.0]
            assert len(b3_data["orders"]) == 3

            # Verify floorplan table session totals reflect authoritative numbers
            from app.modules.tables.router import invalidate_tables_cache
            invalidate_tables_cache(rest_id)
            resp_tables = await ac.get(f"/api/v1/restaurants/{rest_id}/tables")
            assert resp_tables.status_code == 200
            t_data = next(t for t in resp_tables.json() if t["id"] == table.id)
            assert t_data["isOccupied"] is True
            assert t_data["sessionTotal"] in [997.5, 998.0] or t_data["sessionSubtotal"] == 950.0
            assert t_data["orderCount"] == 3

    async def test_scenario_e_f_independent_station_lifecycle_and_delivery(self, db_session):
        """Scenarios E & F: Multi-station order with independent preparation, ready passes, and waiter delivery."""
        rest_id, table, owner_token, waiter_token = await self._setup_restaurant_and_table(db_session)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # Create a multi-item order: Food (₹300) and Hookah (₹400)
            multi_order_payload = {
                "restaurantId": rest_id,
                "tableNumber": table.table_number,
                "items": [
                    {
                        "id": "food-item-2",
                        "name": "Butter Chicken with Naan",
                        "price": 300.0,
                        "quantity": 1,
                        "category": "Main Course",
                        "fulfillmentStation": "KITCHEN",
                    },
                    {
                        "id": "hookah-item-2",
                        "name": "Mint & Grape Hookah",
                        "price": 400.0,
                        "quantity": 1,
                        "category": "Hookah",
                        "fulfillmentStation": "HOOKAH",
                    }
                ],
                "orderType": "DINE_IN",
            }
            resp = await ac.post("/api/v1/orders", json=multi_order_payload)
            assert resp.status_code == 201, resp.text
            order = resp.json()
            order_id = order["id"]

            # Hookah marks READY
            resp_h_ready = await ac.put(
                f"/api/v1/orders/{order_id}/status",
                json={"status": "READY", "station": "HOOKAH", "hookahStatus": "READY"},
                headers={"Authorization": f"Bearer {owner_token}"}
            )
            assert resp_h_ready.status_code == 200, resp_h_ready.text
            h_order = resp_h_ready.json()
            assert h_order["hookahStatus"] == "READY"
            # Kitchen must STILL be in PREPARING / PENDING / ACCEPTED!
            assert h_order["kitchenStatus"] in ["PENDING", "ACCEPTED", "PREPARING"]
            assert h_order["status"] in ["PENDING", "PREPARING", "ACCEPTED"]

            # Waiter delivers Hookah station
            resp_del = await ac.post(
                f"/api/v1/orders/{order_id}/deliver",
                json={"station": "HOOKAH", "waiterName": "Aman Runner"},
                headers={"Authorization": f"Bearer {waiter_token}"}
            )
            assert resp_del.status_code == 200, resp_del.text
            del_order = resp_del.json()["order"]
            assert del_order["hookahStatus"] == "COMPLETED"
            # Kitchen must NOT be completed! It is still cooking!
            assert del_order["kitchenStatus"] in ["PENDING", "ACCEPTED", "PREPARING"]
            assert del_order["status"] != "COMPLETED"
            assert del_order["deliveryStatus"] == "PARTIALLY_DELIVERED"

            # Kitchen completes cooking
            resp_k_ready = await ac.put(
                f"/api/v1/orders/{order_id}/status",
                json={"status": "READY", "station": "KITCHEN", "kitchenStatus": "READY"},
                headers={"Authorization": f"Bearer {owner_token}"}
            )
            assert resp_k_ready.status_code == 200
            k_order = resp_k_ready.json()
            assert k_order["kitchenStatus"] == "READY"

            # Waiter delivers Kitchen dish
            resp_del_k = await ac.post(
                f"/api/v1/orders/{order_id}/deliver",
                json={"station": "KITCHEN", "waiterName": "Aman Runner"},
                headers={"Authorization": f"Bearer {waiter_token}"}
            )
            assert resp_del_k.status_code == 200
            final_order = resp_del_k.json()["order"]
            assert final_order["kitchenStatus"] == "COMPLETED"
            assert final_order["hookahStatus"] == "COMPLETED"
            # Now all stations are complete, so overall order is COMPLETED/DELIVERED
            assert final_order["status"] in ["COMPLETED", "DELIVERED"]
            assert final_order["deliveryStatus"] == "DELIVERED"

    async def test_scenario_i_cross_session_isolation(self, db_session):
        """Scenario I: Closing a session resets table to ₹0 and creates strict isolation."""
        rest_id, table, owner_token, waiter_token = await self._setup_restaurant_and_table(db_session)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Place order in Session 1
            resp = await ac.post("/api/v1/orders", json={
                "restaurantId": rest_id,
                "tableNumber": table.table_number,
                "items": [{"id": "item-1", "name": "Dish 1", "price": 500.0, "quantity": 1}],
                "orderType": "DINE_IN",
            })
            assert resp.status_code == 201
            s1_id = resp.json().get("tableSessionId")

            # 2. Close Session 1
            resp_close = await ac.post(
                f"/api/v1/restaurants/{rest_id}/tables/{table.id}/close-session",
                headers={"Authorization": f"Bearer {owner_token}"}
            )
            assert resp_close.status_code in [200, 204]

            # 3. Running bill on table with NO session must be 0.0
            from app.modules.tables.router import invalidate_tables_cache
            invalidate_tables_cache(rest_id)
            resp_b = await ac.get(f"/api/v1/restaurants/{rest_id}/billing/table/{table.table_number}/bill")
            assert resp_b.status_code == 200
            b_data = resp_b.json()
            assert b_data["grandTotal"] == 0.0
            assert len(b_data["orders"]) == 0

    async def test_scenario_g_optional_kitchen_eta(self, db_session):
        """Scenario G: Staff can set an ETA, but when no ETA is provided, no fake prep time is invented."""
        rest_id, table, owner_token, waiter_token = await self._setup_restaurant_and_table(db_session)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # Order without ETA
            resp = await ac.post("/api/v1/orders", json={
                "restaurantId": rest_id,
                "tableNumber": table.table_number,
                "items": [{"id": "item-g1", "name": "Hookah Double Apple", "price": 400.0, "quantity": 1, "station": "HOOKAH"}],
                "orderType": "DINE_IN",
            })
            assert resp.status_code == 201
            ord_data = resp.json()
            # Bar and Hookah do not have mandatory ETAs; no artificial ETA target timestamp is invented
            assert ord_data.get("etaTargetTimestamp") is None

            # Staff sets an optional ETA (e.g. 15 minutes)
            ord_id = ord_data["id"]
            resp_eta = await ac.put(
                f"/api/v1/orders/{ord_id}/status",
                json={"estimatedPrepTimeMinutes": 15},
                headers={"Authorization": f"Bearer {owner_token}"}
            )
            assert resp_eta.status_code == 200
            eta_ord = resp_eta.json()
            assert eta_ord.get("etaTargetTimestamp") is not None
            assert eta_ord.get("estimatedPrepTimeMinutes") == 15

    async def test_scenario_h_idempotency_retry_safety(self, db_session):
        """Scenario H: Order submission with duplicate idempotency key does not create duplicate orders or bill totals."""
        rest_id, table, owner_token, waiter_token = await self._setup_restaurant_and_table(db_session)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            payload = {
                "restaurantId": rest_id,
                "tableNumber": table.table_number,
                "idempotencyKey": "unique-idem-key-12345",
                "items": [{"id": "item-h1", "name": "Loaded Nachos", "price": 350.0, "quantity": 1}],
                "orderType": "DINE_IN",
            }
            # 1st Submission
            resp1 = await ac.post("/api/v1/orders", json=payload)
            assert resp1.status_code == 201
            ord1 = resp1.json()

            # 2nd Submission (Network retry with same idempotency key)
            resp2 = await ac.post("/api/v1/orders", json=payload)
            assert resp2.status_code == 201
            ord2 = resp2.json()

            # Must return the SAME order ID and not duplicate
            assert ord1["id"] == ord2["id"]

            # Bill must contain only 1 order
            session_id = ord1.get("tableSessionId")
            resp_b = await ac.get(f"/api/v1/restaurants/{rest_id}/billing/table/{table.table_number}/bill?sessionId={session_id}")
            assert resp_b.status_code == 200
            b_data = resp_b.json()
            assert len(b_data["orders"]) == 1
            assert b_data["subtotal"] == 350.0

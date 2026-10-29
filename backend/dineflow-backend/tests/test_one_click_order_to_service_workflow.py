import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
import json
import base64

from app.main import app
from app.modules.restaurants.models import Restaurant, RestaurantMembership
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.tables.models import Table, TableSession
from app.modules.orders.models import Order, OrderItem, Bill
from app.modules.customer_requests.models import CustomerRequestModel
from app.core.config.settings import get_settings

settings = get_settings()


def create_fake_jwt(claims: dict) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_sig"
    return f"{header}.{payload}.{signature}"


@pytest.mark.asyncio
class TestOneClickOrderToServiceWorkflow:
    async def _setup_restaurant(self, db_session: AsyncSession):
        rest_id = f"rest-venue-{uuid.uuid4().hex[:6]}"
        other_rest_id = f"rest-other-{uuid.uuid4().hex[:6]}"
        owner_uid = f"uid-owner-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@dinely.food"

        venue = Restaurant(
            id=rest_id,
            name="The Grand Bistro & Lounge",
            slug=f"bistro-{uuid.uuid4().hex[:4]}",
            public_slug=f"bistro-{uuid.uuid4().hex[:4]}",
            owner_uid=owner_uid,
            owner_email=owner_email,
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_bar=True,
            has_hookah=True,
            has_tables=True,
            has_waiter=True,
            enabled_modules=["kitchen", "bar", "hookah", "waiter", "billing", "tables"],
        )
        other_venue = Restaurant(
            id=other_rest_id,
            name="Other Venue",
            slug=f"other-{uuid.uuid4().hex[:4]}",
            public_slug=f"other-{uuid.uuid4().hex[:4]}",
            owner_uid=f"uid-other-{uuid.uuid4().hex[:6]}",
            owner_email=f"other-{uuid.uuid4().hex[:6]}@dinely.food",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_bar=True,
            has_hookah=True,
            has_tables=True,
            has_waiter=True,
            enabled_modules=["kitchen", "bar", "hookah", "waiter", "billing", "tables"],
        )
        db_session.add_all([venue, other_venue])

        # Staff memberships
        waiter_uid = f"uid-waiter-{uuid.uuid4().hex[:6]}"
        chef_uid = f"uid-chef-{uuid.uuid4().hex[:6]}"
        bartender_uid = f"uid-bar-{uuid.uuid4().hex[:6]}"
        hookah_uid = f"uid-hookah-{uuid.uuid4().hex[:6]}"

        m_owner = RestaurantMembership(id=str(uuid.uuid4()), restaurant_id=rest_id, user_uid=owner_uid, user_email=owner_email, role="OWNER")
        m_waiter = RestaurantMembership(id=str(uuid.uuid4()), restaurant_id=rest_id, user_uid=waiter_uid, user_email="waiter@dinely.food", role="WAITER")
        m_chef = RestaurantMembership(id=str(uuid.uuid4()), restaurant_id=rest_id, user_uid=chef_uid, user_email="chef@dinely.food", role="CHEF")
        m_bar = RestaurantMembership(id=str(uuid.uuid4()), restaurant_id=rest_id, user_uid=bartender_uid, user_email="bar@dinely.food", role="BAR")
        m_hookah = RestaurantMembership(id=str(uuid.uuid4()), restaurant_id=rest_id, user_uid=hookah_uid, user_email="hookah@dinely.food", role="HOOKAH")
        db_session.add_all([m_owner, m_waiter, m_chef, m_bar, m_hookah])

        # Table & Active TableSession
        tbl_id = f"tbl-12-{uuid.uuid4().hex[:4]}"
        table = Table(id=tbl_id, restaurant_id=rest_id, table_number="12", qr_code_url="qr-12", is_occupied=True)
        sess_id = f"sess-12-{uuid.uuid4().hex[:4]}"
        session = TableSession(id=sess_id, restaurant_id=rest_id, table_id=tbl_id, table_number="12", status="ACTIVE")
        db_session.add_all([table, session])

        # Menu items: Food (Kitchen), Cocktail (Bar), Shisha (Hookah)
        item_food = MenuItem(
            id=f"item-food-{uuid.uuid4().hex[:4]}",
            restaurant_id=rest_id,
            category_id="cat-food",
            name="Grilled Truffle Salmon",
            price=24.50,
            target_destination="KITCHEN",
            is_available=True,
        )
        item_drink = MenuItem(
            id=f"item-drink-{uuid.uuid4().hex[:4]}",
            restaurant_id=rest_id,
            category_id="cat-bar",
            name="Smoked Bourbon Old Fashioned",
            price=15.00,
            target_destination="BAR",
            is_alcoholic=True,
            is_available=True,
        )
        item_hookah = MenuItem(
            id=f"item-hookah-{uuid.uuid4().hex[:4]}",
            restaurant_id=rest_id,
            category_id="cat-hookah",
            name="Grape Mint Double Apple Shisha",
            price=30.00,
            target_destination="HOOKAH",
            is_available=True,
        )
        db_session.add_all([item_food, item_drink, item_hookah])
        await db_session.commit()

        # Auth tokens
        waiter_token = create_fake_jwt({"uid": waiter_uid, "email": "waiter@dinely.food", "role": "WAITER", "restaurant_id": rest_id})
        chef_token = create_fake_jwt({"uid": chef_uid, "email": "chef@dinely.food", "role": "CHEF", "restaurant_id": rest_id})
        bar_token = create_fake_jwt({"uid": bartender_uid, "email": "bar@dinely.food", "role": "BAR", "restaurant_id": rest_id})
        hookah_token = create_fake_jwt({"uid": hookah_uid, "email": "hookah@dinely.food", "role": "HOOKAH", "restaurant_id": rest_id})
        owner_token = create_fake_jwt({"uid": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest_id})

        return {
            "rest_id": rest_id,
            "other_rest_id": other_rest_id,
            "table_id": tbl_id,
            "session_id": sess_id,
            "item_food": item_food,
            "item_drink": item_drink,
            "item_hookah": item_hookah,
            "waiter_token": waiter_token,
            "chef_token": chef_token,
            "bar_token": bar_token,
            "hookah_token": hookah_token,
            "owner_token": owner_token,
        }

    async def test_criterion_1_and_2_and_8_qr_order_mixed_stations(self, db_session: AsyncSession):
        """1, 2, 8: QR menu order creates ONE authoritative order with food, drink, hookah correctly routed."""
        env = await self._setup_restaurant(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            order_payload = {
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "tableId": env["table_id"],
                "tableSessionId": env["session_id"],
                "customerName": "Guest Table 12",
                "items": [
                    {
                        "menuItemId": env["item_food"].id,
                        "name": env["item_food"].name,
                        "price": env["item_food"].price,
                        "quantity": 2,
                        "targetDestination": "KITCHEN",
                    },
                    {
                        "menuItemId": env["item_drink"].id,
                        "name": env["item_drink"].name,
                        "price": env["item_drink"].price,
                        "quantity": 1,
                        "targetDestination": "BAR",
                        "isAlcoholic": True,
                    },
                    {
                        "menuItemId": env["item_hookah"].id,
                        "name": env["item_hookah"].name,
                        "price": env["item_hookah"].price,
                        "quantity": 1,
                        "targetDestination": "HOOKAH",
                    },
                ],
            }
            res = await client.post("/api/v1/orders", json=order_payload)
            assert res.status_code == 201, f"Expected 201 Created: {res.text}"
            data = res.json()
            order_id = data["id"]
            assert data["status"] == "PENDING"
            assert data["kitchenStatus"] == "PENDING"
            assert data["barStatus"] == "PENDING"
            assert data["hookahStatus"] == "PENDING"
            assert len(data["items"]) == 3

            # Kitchen station view only sees food items
            res_k = await client.get(
                f"/api/v1/orders/restaurant/{env['rest_id']}?station=KITCHEN",
                headers={"Authorization": f"Bearer {env['chef_token']}"}
            )
            assert res_k.status_code == 200
            k_orders = res_k.json()
            this_k = next(o for o in k_orders if o["id"] == order_id)
            assert len(this_k["items"]) == 1
            assert this_k["items"][0]["name"] == env["item_food"].name

            # Bar station view only sees drinks
            res_b = await client.get(
                f"/api/v1/orders/restaurant/{env['rest_id']}?station=BAR",
                headers={"Authorization": f"Bearer {env['bar_token']}"}
            )
            assert res_b.status_code == 200
            b_orders = res_b.json()
            this_b = next(o for o in b_orders if o["id"] == order_id)
            assert len(this_b["items"]) == 1
            assert this_b["items"][0]["name"] == env["item_drink"].name

            # Hookah station view only sees hookah
            res_h = await client.get(
                f"/api/v1/orders/restaurant/{env['rest_id']}?station=HOOKAH",
                headers={"Authorization": f"Bearer {env['hookah_token']}"}
            )
            assert res_h.status_code == 200
            h_orders = res_h.json()
            this_h = next(o for o in h_orders if o["id"] == order_id)
            assert len(this_h["items"]) == 1
            assert this_h["items"][0]["name"] == env["item_hookah"].name

    async def test_criterion_3_confirm_order_persists_status(self, db_session: AsyncSession):
        """3: Confirm Order persists PREPARING status and updates order state."""
        env = await self._setup_restaurant(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            order_res = await client.post("/api/v1/orders", json={
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "items": [{"menuItemId": env["item_food"].id, "name": env["item_food"].name, "price": env["item_food"].price, "quantity": 1, "targetDestination": "KITCHEN"}]
            })
            order_id = order_res.json()["id"]

            # Chef confirms order
            conf_res = await client.put(
                f"/api/v1/orders/{order_id}/status",
                json={"kitchenStatus": "PREPARING", "estimatedPrepTimeMinutes": 20},
                headers={"Authorization": f"Bearer {env['chef_token']}"}
            )
            assert conf_res.status_code == 200
            data = conf_res.json()
            assert data["kitchenStatus"] == "PREPARING"
            assert data["status"] == "PREPARING"
            assert data["estimatedPrepTimeMinutes"] == 20
            assert data["etaTargetTimestamp"] is not None

    async def test_criterion_4_and_5_mark_ready_and_request_waiter(self, db_session: AsyncSession):
        """4, 5: Mark Ready sets READY status, and Request Waiter creates linked service request."""
        env = await self._setup_restaurant(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            order_res = await client.post("/api/v1/orders", json={
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "items": [{"menuItemId": env["item_food"].id, "name": env["item_food"].name, "price": env["item_food"].price, "quantity": 2, "targetDestination": "KITCHEN"}]
            })
            order_id = order_res.json()["id"]

            # Chef marks ready
            ready_res = await client.put(
                f"/api/v1/orders/{order_id}/status",
                json={"kitchenStatus": "READY"},
                headers={"Authorization": f"Bearer {env['chef_token']}"}
            )
            assert ready_res.status_code == 200
            assert ready_res.json()["kitchenStatus"] == "READY"
            assert ready_res.json()["status"] == "READY"

            # Chef clicks Request Waiter
            req_res = await client.post(
                f"/api/v1/orders/{order_id}/request-waiter",
                json={"station": "KITCHEN", "notes": "Plated hot at kitchen pass"},
                headers={"Authorization": f"Bearer {env['chef_token']}"}
            )
            assert req_res.status_code == 200
            req_data = req_res.json()
            assert req_data["success"] is True
            assert req_data["order"]["kitchenWaiterRequested"] is True
            assert req_data["order"]["deliveryStatus"] == "WAITING_FOR_WAITER"

            service_req = req_data["request"]
            assert service_req["orderId"] == order_id
            assert service_req["station"] == "KITCHEN"
            assert service_req["tableNumber"] == "12"
            assert service_req["requestType"] == "ORDER_READY"
            assert service_req["status"] == "PENDING"

    async def test_criterion_6_and_7_waiter_collect_and_served_workflow(self, db_session: AsyncSession):
        """6, 7: Waiter receives request, clicks Collect, and marks Served."""
        env = await self._setup_restaurant(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            order_res = await client.post("/api/v1/orders", json={
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "items": [{"menuItemId": env["item_drink"].id, "name": env["item_drink"].name, "price": env["item_drink"].price, "quantity": 2, "targetDestination": "BAR", "isAlcoholic": True}]
            })
            order_id = order_res.json()["id"]

            # Bartender requests waiter
            await client.post(
                f"/api/v1/orders/{order_id}/request-waiter",
                json={"station": "BAR"},
                headers={"Authorization": f"Bearer {env['bar_token']}"}
            )

            # Waiter terminal fetches customer requests
            req_list = await client.get(
                f"/api/v1/customer-requests?restaurant_id={env['rest_id']}&active_only=true",
                headers={"Authorization": f"Bearer {env['waiter_token']}"}
            )
            assert req_list.status_code == 200
            all_reqs = req_list.json()
            linked_req = next(r for r in all_reqs if r["orderId"] == order_id)
            assert linked_req["status"] == "PENDING"
            assert linked_req["station"] == "BAR"

            # 1. Waiter clicks Collect Order
            collect_res = await client.post(
                f"/api/v1/orders/{order_id}/collect",
                json={"station": "BAR", "waiterName": "Alex Waiter"},
                headers={"Authorization": f"Bearer {env['waiter_token']}"}
            )
            assert collect_res.status_code == 200
            assert collect_res.json()["order"]["deliveryStatus"] == "COLLECTED"
            assert collect_res.json()["order"]["claimedBy"] == "Alex Waiter"

            # 2. Waiter delivers drinks to table and clicks Served
            deliver_res = await client.post(
                f"/api/v1/orders/{order_id}/deliver",
                json={"station": "BAR", "waiterName": "Alex Waiter"},
                headers={"Authorization": f"Bearer {env['waiter_token']}"}
            )
            assert deliver_res.status_code == 200
            del_order = deliver_res.json()["order"]
            assert del_order["status"] == "DELIVERED"
            assert del_order["barStatus"] == "COMPLETED"
            assert del_order["deliveredAt"] is not None

    async def test_criterion_9_repeated_clicks_idempotent(self, db_session: AsyncSession):
        """9: Repeated clicks or retries do NOT create duplicate waiter requests."""
        env = await self._setup_restaurant(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            order_res = await client.post("/api/v1/orders", json={
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "items": [{"menuItemId": env["item_food"].id, "name": env["item_food"].name, "price": env["item_food"].price, "quantity": 1, "targetDestination": "KITCHEN"}]
            })
            order_id = order_res.json()["id"]

            # First Request Waiter click
            res1 = await client.post(
                f"/api/v1/orders/{order_id}/request-waiter",
                json={"station": "KITCHEN"},
                headers={"Authorization": f"Bearer {env['chef_token']}"}
            )
            assert res1.status_code == 200
            req_id_1 = res1.json()["request"]["id"]

            # Second Request Waiter click (immediate double click / network retry)
            res2 = await client.post(
                f"/api/v1/orders/{order_id}/request-waiter",
                json={"station": "KITCHEN"},
                headers={"Authorization": f"Bearer {env['chef_token']}"}
            )
            assert res2.status_code == 200
            req_id_2 = res2.json()["request"]["id"]

            # Must return the SAME request ID, not create a duplicate
            assert req_id_1 == req_id_2

    async def test_criterion_10_station_role_authorization_and_cross_station_safety(self, db_session: AsyncSession):
        """10: Chef cannot mutate Hookah/Bar; Bartender cannot deliver dishes to tables."""
        env = await self._setup_restaurant(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            order_res = await client.post("/api/v1/orders", json={
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "items": [
                    {"menuItemId": env["item_food"].id, "name": env["item_food"].name, "price": env["item_food"].price, "quantity": 1, "targetDestination": "KITCHEN"},
                    {"menuItemId": env["item_hookah"].id, "name": env["item_hookah"].name, "price": env["item_hookah"].price, "quantity": 1, "targetDestination": "HOOKAH"},
                ]
            })
            order_id = order_res.json()["id"]

            # Chef attempts to mutate Hookah status -> Must be 403 Forbidden
            res_fail = await client.put(
                f"/api/v1/orders/{order_id}/status",
                json={"hookahStatus": "READY"},
                headers={"Authorization": f"Bearer {env['chef_token']}"}
            )
            assert res_fail.status_code == 403

            # Bartender attempts to deliver overall order to table -> Must be 403 Forbidden (Waiter/Runner role required)
            res_del_fail = await client.post(
                f"/api/v1/orders/{order_id}/deliver",
                json={},
                headers={"Authorization": f"Bearer {env['bar_token']}"}
            )
            assert res_del_fail.status_code == 403

    async def test_criterion_11_tenant_isolation(self, db_session: AsyncSession):
        """11: Other restaurant staff cannot access or mutate orders of this restaurant."""
        env = await self._setup_restaurant(db_session)
        other_staff_token = create_fake_jwt({
            "uid": "uid-other-waiter",
            "email": "intruder@other.com",
            "role": "WAITER",
            "restaurant_id": env["other_rest_id"]
        })
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            order_res = await client.post("/api/v1/orders", json={
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "items": [{"menuItemId": env["item_food"].id, "name": env["item_food"].name, "price": env["item_food"].price, "quantity": 1, "targetDestination": "KITCHEN"}]
            })
            order_id = order_res.json()["id"]

            # Other restaurant waiter tries to collect order
            res_steal = await client.post(
                f"/api/v1/orders/{order_id}/collect",
                json={"waiterName": "Intruder"},
                headers={"Authorization": f"Bearer {other_staff_token}"}
            )
            assert res_steal.status_code == 403

    async def test_criterion_12_statuses_survive_refreshes(self, db_session: AsyncSession):
        """12: Statuses survive page reload and are accurately queried from authoritative database."""
        env = await self._setup_restaurant(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            order_res = await client.post("/api/v1/orders", json={
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "items": [{"menuItemId": env["item_food"].id, "name": env["item_food"].name, "price": env["item_food"].price, "quantity": 1, "targetDestination": "KITCHEN"}]
            })
            order_id = order_res.json()["id"]

            await client.put(
                f"/api/v1/orders/{order_id}/status",
                json={"kitchenStatus": "READY"},
                headers={"Authorization": f"Bearer {env['chef_token']}"}
            )
            await client.post(
                f"/api/v1/orders/{order_id}/request-waiter",
                json={"station": "KITCHEN"},
                headers={"Authorization": f"Bearer {env['chef_token']}"}
            )

            # Simulated refresh: fresh GET /orders/{order_id}
            get_res = await client.get(
                f"/api/v1/orders/{order_id}",
                headers={"Authorization": f"Bearer {env['waiter_token']}"}
            )
            assert get_res.status_code == 200
            persisted = get_res.json()
            assert persisted["kitchenStatus"] == "READY"
            assert persisted["kitchenWaiterRequested"] is True
            assert persisted["deliveryStatus"] == "WAITING_FOR_WAITER"

    async def test_criterion_13_independent_station_lifecycles(self, db_session: AsyncSession):
        """13: Food, Cocktails, and Hookah orders work independently end-to-end."""
        env = await self._setup_restaurant(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 13A: Drink-only order (Bar)
            res_drink = await client.post("/api/v1/orders", json={
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "items": [{"menuItemId": env["item_drink"].id, "name": env["item_drink"].name, "price": env["item_drink"].price, "quantity": 1, "targetDestination": "BAR", "isAlcoholic": True}]
            })
            assert res_drink.status_code == 201
            d_order = res_drink.json()
            assert d_order["barStatus"] == "PENDING"
            assert d_order["kitchenStatus"] is None
            assert d_order["hookahStatus"] is None

            # Confirm and Start mixing
            conf_bar = await client.put(f"/api/v1/orders/{d_order['id']}/status", json={"barStatus": "PREPARING"}, headers={"Authorization": f"Bearer {env['bar_token']}"})
            assert conf_bar.status_code == 200
            assert conf_bar.json()["barStatus"] == "PREPARING"

            # Request waiter
            rw_bar = await client.post(f"/api/v1/orders/{d_order['id']}/request-waiter", json={"station": "BAR"}, headers={"Authorization": f"Bearer {env['bar_token']}"})
            assert rw_bar.status_code == 200
            assert rw_bar.json()["order"]["barWaiterRequested"] is True

            # Waiter delivers
            del_bar = await client.post(f"/api/v1/orders/{d_order['id']}/deliver", json={"station": "BAR", "waiterName": "Alex"}, headers={"Authorization": f"Bearer {env['waiter_token']}"})
            assert del_bar.status_code == 200
            assert del_bar.json()["order"]["status"] == "DELIVERED"
            assert del_bar.json()["order"]["barStatus"] == "COMPLETED"

            # 13B: Hookah-only order
            res_hk = await client.post("/api/v1/orders", json={
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "items": [{"menuItemId": env["item_hookah"].id, "name": env["item_hookah"].name, "price": env["item_hookah"].price, "quantity": 1, "targetDestination": "HOOKAH"}]
            })
            assert res_hk.status_code == 201
            h_order = res_hk.json()
            assert h_order["hookahStatus"] == "PENDING"
            assert h_order["kitchenStatus"] is None
            assert h_order["barStatus"] is None

            # Hookah master marks ready & requests waiter
            rw_hk = await client.post(f"/api/v1/orders/{h_order['id']}/request-waiter", json={"station": "HOOKAH"}, headers={"Authorization": f"Bearer {env['hookah_token']}"})
            assert rw_hk.status_code == 200
            assert rw_hk.json()["order"]["hookahWaiterRequested"] is True

            # Waiter delivers
            del_hk = await client.post(f"/api/v1/orders/{h_order['id']}/deliver", json={"station": "HOOKAH", "waiterName": "Alex"}, headers={"Authorization": f"Bearer {env['waiter_token']}"})
            assert del_hk.status_code == 200
            assert del_hk.json()["order"]["status"] == "DELIVERED"
            assert del_hk.json()["order"]["hookahStatus"] == "COMPLETED"

    async def test_criterion_14_concurrent_waiter_claims_race_condition_guard(self, db_session: AsyncSession):
        """14: Prevent concurrent waiter claim race condition (409 Conflict) and delivered guard (400 Bad Request)."""
        env = await self._setup_restaurant(db_session)
        other_waiter_uid = f"uid-waiter-2-{uuid.uuid4().hex[:6]}"
        m_waiter2 = RestaurantMembership(id=str(uuid.uuid4()), restaurant_id=env["rest_id"], user_uid=other_waiter_uid, user_email="waiter2@dinely.food", role="WAITER")
        db_session.add(m_waiter2)
        await db_session.commit()
        waiter2_token = create_fake_jwt({"uid": other_waiter_uid, "email": "waiter2@dinely.food", "role": "WAITER", "restaurant_id": env["rest_id"]})

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            order_res = await client.post("/api/v1/orders", json={
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "items": [{"menuItemId": env["item_food"].id, "name": env["item_food"].name, "price": env["item_food"].price, "quantity": 1, "targetDestination": "KITCHEN"}]
            })
            order_id = order_res.json()["id"]

            await client.post(f"/api/v1/orders/{order_id}/request-waiter", json={"station": "KITCHEN"}, headers={"Authorization": f"Bearer {env['chef_token']}"})

            # Waiter 1 claims order
            claim1 = await client.post(f"/api/v1/orders/{order_id}/collect", json={"waiterName": "Alex Waiter"}, headers={"Authorization": f"Bearer {env['waiter_token']}"})
            assert claim1.status_code == 200
            assert claim1.json()["order"]["claimedBy"] == "Alex Waiter"

            # Waiter 2 attempts concurrent claim on already collected order -> 409 Conflict
            claim2 = await client.post(f"/api/v1/orders/{order_id}/collect", json={"waiterName": "Maria Runner"}, headers={"Authorization": f"Bearer {waiter2_token}"})
            assert claim2.status_code == 409
            assert "already been collected" in claim2.json()["detail"]

            # Waiter 1 re-claims -> 200 OK (idempotent for same waiter)
            claim1_repeat = await client.post(f"/api/v1/orders/{order_id}/collect", json={"waiterName": "Alex Waiter"}, headers={"Authorization": f"Bearer {env['waiter_token']}"})
            assert claim1_repeat.status_code == 200

            # Waiter marks served
            del_res = await client.post(f"/api/v1/orders/{order_id}/deliver", json={"waiterName": "Alex Waiter"}, headers={"Authorization": f"Bearer {env['waiter_token']}"})
            assert del_res.status_code == 200

            # Waiter 2 tries to collect after delivery -> 400 Bad Request
            late_claim = await client.post(f"/api/v1/orders/{order_id}/collect", json={"waiterName": "Maria Runner"}, headers={"Authorization": f"Bearer {waiter2_token}"})
            assert late_claim.status_code == 400
            assert "already been delivered" in late_claim.json()["detail"]

    async def test_criterion_15_one_click_bar_and_hookah_end_to_end_workflow(self, db_session: AsyncSession):
        """15: One-click 3-action synchronized workflow for Bar and Hookah stations."""
        env = await self._setup_restaurant(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # === BAR WORKFLOW ===
            # Step 1: Customer places beverage order
            res_b = await client.post("/api/v1/orders", json={
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "items": [{"menuItemId": env["item_drink"].id, "name": env["item_drink"].name, "price": env["item_drink"].price, "quantity": 2, "targetDestination": "BAR"}]
            })
            assert res_b.status_code == 201
            bar_ord = res_b.json()
            assert bar_ord["barStatus"] == "PENDING"
            assert bar_ord["deliveryStatus"] == "PENDING"

            # Bartender Action 1: START PREPARING (one click)
            prep_b = await client.put(f"/api/v1/orders/{bar_ord['id']}/status", json={"barStatus": "PREPARING"}, headers={"Authorization": f"Bearer {env['bar_token']}"})
            assert prep_b.status_code == 200
            assert prep_b.json()["barStatus"] == "PREPARING"
            assert prep_b.json()["status"] == "PREPARING"

            # Bartender Action 2: READY — NOTIFY WAITER (one click)
            ready_b = await client.post(f"/api/v1/orders/{bar_ord['id']}/request-waiter", json={"station": "BAR"}, headers={"Authorization": f"Bearer {env['bar_token']}"})
            assert ready_b.status_code == 200
            assert ready_b.json()["order"]["barStatus"] == "READY"
            assert ready_b.json()["order"]["barWaiterRequested"] is True
            assert ready_b.json()["order"]["deliveryStatus"] == "WAITING_FOR_WAITER"
            assert ready_b.json()["request"]["requestType"] == "ORDER_READY"
            assert ready_b.json()["request"]["station"] == "BAR"

            # Waiter Action: ACCEPT & COLLECT (one click)
            collect_b = await client.post(f"/api/v1/orders/{bar_ord['id']}/collect", json={"station": "BAR", "waiterName": "Sam Floor"}, headers={"Authorization": f"Bearer {env['waiter_token']}"})
            assert collect_b.status_code == 200
            assert collect_b.json()["order"]["claimedBy"] == "Sam Floor"
            assert collect_b.json()["order"]["deliveryStatus"] == "COLLECTED"

            # Waiter Action: MARK DELIVERED (one click)
            deliver_b = await client.post(f"/api/v1/orders/{bar_ord['id']}/deliver", json={"station": "BAR", "waiterName": "Sam Floor"}, headers={"Authorization": f"Bearer {env['waiter_token']}"})
            assert deliver_b.status_code == 200
            assert deliver_b.json()["order"]["status"] == "DELIVERED"
            assert deliver_b.json()["order"]["barStatus"] == "COMPLETED"
            assert deliver_b.json()["order"]["deliveryStatus"] == "DELIVERED"
            assert deliver_b.json()["order"]["deliveredAt"] is not None

            # === HOOKAH WORKFLOW ===
            # Step 1: Customer places hookah order
            res_h = await client.post("/api/v1/orders", json={
                "restaurantId": env["rest_id"],
                "tableNumber": "12",
                "items": [{"menuItemId": env["item_hookah"].id, "name": env["item_hookah"].name, "price": env["item_hookah"].price, "quantity": 1, "targetDestination": "HOOKAH"}]
            })
            assert res_h.status_code == 201
            hk_ord = res_h.json()
            assert hk_ord["hookahStatus"] == "PENDING"

            # Hookah Action 1: START PREPARING (one click)
            prep_h = await client.put(f"/api/v1/orders/{hk_ord['id']}/status", json={"hookahStatus": "PREPARING"}, headers={"Authorization": f"Bearer {env['hookah_token']}"})
            assert prep_h.status_code == 200
            assert prep_h.json()["hookahStatus"] == "PREPARING"

            # Hookah Action 2: READY — NOTIFY WAITER (one click)
            ready_h = await client.post(f"/api/v1/orders/{hk_ord['id']}/request-waiter", json={"station": "HOOKAH"}, headers={"Authorization": f"Bearer {env['hookah_token']}"})
            assert ready_h.status_code == 200
            assert ready_h.json()["order"]["hookahStatus"] == "READY"
            assert ready_h.json()["order"]["hookahWaiterRequested"] is True
            assert ready_h.json()["order"]["deliveryStatus"] == "WAITING_FOR_WAITER"

            # Waiter Action: ACCEPT & COLLECT (one click)
            collect_h = await client.post(f"/api/v1/orders/{hk_ord['id']}/collect", json={"station": "HOOKAH", "waiterName": "Sam Floor"}, headers={"Authorization": f"Bearer {env['waiter_token']}"})
            assert collect_h.status_code == 200
            assert collect_h.json()["order"]["deliveryStatus"] == "COLLECTED"

            # Waiter Action: MARK DELIVERED (one click)
            deliver_h = await client.post(f"/api/v1/orders/{hk_ord['id']}/deliver", json={"station": "HOOKAH", "waiterName": "Sam Floor"}, headers={"Authorization": f"Bearer {env['waiter_token']}"})
            assert deliver_h.status_code == 200
            assert deliver_h.json()["order"]["status"] == "DELIVERED"
            assert deliver_h.json()["order"]["hookahStatus"] == "COMPLETED"
            assert deliver_h.json()["order"]["deliveryStatus"] == "DELIVERED"


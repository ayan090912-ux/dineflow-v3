import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone
import json
import base64

from app.main import app
from app.modules.restaurants.models import Restaurant, RestaurantMembership
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.tables.models import Table, TableSession
from app.modules.orders.models import Order, OrderItem
from app.modules.customer_requests.models import CustomerRequestModel
from app.core.config.settings import get_settings

settings = get_settings()


def create_fake_jwt(claims: dict) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_sig"
    return f"{header}.{payload}.{signature}"


@pytest.mark.asyncio
class TestHookahBarTerminalsFullWorkflow:
    async def _setup_venue(self, db_session):
        rest_id = f"rest-lounge-{uuid.uuid4().hex[:6]}"
        other_rest_id = f"rest-other-{uuid.uuid4().hex[:6]}"
        owner_uid = f"uid-owner-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@dinely.food"

        venue = Restaurant(
            id=rest_id,
            name="Sultans Shisha & Cocktail Lounge",
            slug=f"sultans-{uuid.uuid4().hex[:4]}",
            owner_uid=owner_uid,
            owner_email=owner_email,
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_bar=True,
            has_hookah=True,
            has_waiter=True,
            enabled_modules=["kitchen", "bar", "hookah", "waiter", "billing", "tables"],
        )
        other_venue = Restaurant(
            id=other_rest_id,
            name="Different Tenant Venue",
            slug=f"diff-{uuid.uuid4().hex[:4]}",
            owner_uid="other-owner-uid",
            owner_email="other-owner@dinely.food",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_bar=True,
            has_hookah=True,
            has_waiter=True,
            enabled_modules=["kitchen", "bar", "hookah", "waiter"],
        )
        db_session.add_all([venue, other_venue])

        # Staff Memberships
        owner_mem = RestaurantMembership(
            id=f"mem-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=owner_uid,
            user_email=owner_email,
            role="OWNER",
        )
        hookah_mem = RestaurantMembership(
            id=f"mem-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=f"uid-hookah-{uuid.uuid4().hex[:4]}",
            user_email=f"hookah-{uuid.uuid4().hex[:4]}@dinely.food",
            role="HOOKAH",
        )
        bar_mem = RestaurantMembership(
            id=f"mem-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=f"uid-bar-{uuid.uuid4().hex[:4]}",
            user_email=f"bar-{uuid.uuid4().hex[:4]}@dinely.food",
            role="BAR",
        )
        waiter_mem = RestaurantMembership(
            id=f"mem-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=f"uid-waiter-{uuid.uuid4().hex[:4]}",
            user_email=f"waiter-{uuid.uuid4().hex[:4]}@dinely.food",
            role="WAITER",
        )
        other_staff_mem = RestaurantMembership(
            id=f"mem-{uuid.uuid4().hex[:6]}",
            restaurant_id=other_rest_id,
            user_uid=f"uid-other-{uuid.uuid4().hex[:4]}",
            user_email=f"other-{uuid.uuid4().hex[:4]}@dinely.food",
            role="HOOKAH",
        )
        db_session.add_all([owner_mem, hookah_mem, bar_mem, waiter_mem, other_staff_mem])

        # Floorplan Table
        tbl = Table(
            id=f"tbl-{rest_id}-01",
            restaurant_id=rest_id,
            table_number="Lounge 01",
            capacity=6,
            is_occupied=True,
            status="AVAILABLE",
        )
        db_session.add(tbl)

        # Categories
        cat_hookah = MenuCategory(
            id=f"cat-h-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            name="Hookah & Shisha",
            sort_order=1,
        )
        cat_bar = MenuCategory(
            id=f"cat-b-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            name="Artisan Cocktails",
            sort_order=2,
        )
        cat_food = MenuCategory(
            id=f"cat-f-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            name="Mezze Platters",
            sort_order=3,
        )
        db_session.add_all([cat_hookah, cat_bar, cat_food])

        # Menu Items
        item_shisha = MenuItem(
            id=f"item-shisha-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat_hookah.id,
            name="Double Apple Royal Shisha",
            price=650.0,
            target_destination="HOOKAH",
            is_alcoholic=False,
            is_available=True,
        )
        item_cocktail = MenuItem(
            id=f"item-cocktail-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat_bar.id,
            name="Smoked Bourbon Old Fashioned",
            price=480.0,
            target_destination="BAR",
            is_alcoholic=True,
            is_available=True,
        )
        item_mezze = MenuItem(
            id=f"item-mezze-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat_food.id,
            name="Hummus & Fresh Falafel",
            price=320.0,
            target_destination="KITCHEN",
            is_alcoholic=False,
            is_available=True,
        )
        db_session.add_all([item_shisha, item_cocktail, item_mezze])
        await db_session.commit()

        tokens = {
            "owner": create_fake_jwt({"uid": owner_mem.user_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest_id}),
            "hookah": create_fake_jwt({"uid": hookah_mem.user_uid, "email": hookah_mem.user_email, "role": "HOOKAH", "restaurant_id": rest_id}),
            "bar": create_fake_jwt({"uid": bar_mem.user_uid, "email": bar_mem.user_email, "role": "BAR", "restaurant_id": rest_id}),
            "waiter": create_fake_jwt({"uid": waiter_mem.user_uid, "email": waiter_mem.user_email, "role": "WAITER", "restaurant_id": rest_id}),
            "other_hookah": create_fake_jwt({"uid": other_staff_mem.user_uid, "email": other_staff_mem.user_email, "role": "HOOKAH", "restaurant_id": other_rest_id}),
        }

        return {
            "venue": venue,
            "other_venue": other_venue,
            "table": tbl,
            "items": {
                "shisha": item_shisha,
                "cocktail": item_cocktail,
                "mezze": item_mezze,
            },
            "tokens": tokens,
        }

    # SCENARIO 1: Hookah order submitted through customer menu reaches Hookah Terminal
    async def test_scenario_1_customer_hookah_order_reaches_terminal(self, db_session):
        data = await self._setup_venue(db_session)
        venue = data["venue"]
        shisha = data["items"]["shisha"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            order_payload = {
                "restaurantId": venue.id,
                "tableNumber": "Lounge 01",
                "customerName": "Rohan (Customer QR)",
                "items": [
                    {
                        "id": shisha.id,
                        "menuItemId": shisha.id,
                        "name": shisha.name,
                        "price": shisha.price,
                        "quantity": 1,
                        "targetDestination": "HOOKAH",
                        "customization": {"flavour": "Double Apple", "coals": "Coconut (3 Cubes)", "bowl": "Phunnel"},
                    }
                ],
            }
            res_create = await ac.post("/api/v1/orders", json=order_payload)
            assert res_create.status_code == 201, res_create.text
            created_order = res_create.json()
            order_id = created_order["id"]
            assert created_order["hookahStatus"] == "PENDING"

            # Hookah Terminal queries active orders
            res_terminal = await ac.get(
                f"/api/v1/orders/restaurant/{venue.id}?station=HOOKAH&active_only=true",
                headers={"Authorization": f"Bearer {data['tokens']['hookah']}"},
            )
            assert res_terminal.status_code == 200
            hookah_orders = res_terminal.json()
            matched = [o for o in hookah_orders if o["id"] == order_id]
            assert len(matched) == 1
            assert matched[0]["tableNumber"] == "Lounge 01"
            assert matched[0]["hookahStatus"] == "PENDING"
            assert len(matched[0]["items"]) == 1

    # SCENARIO 2: Hookah order submitted through Waiter / POS reaches Hookah Terminal
    async def test_scenario_2_waiter_or_pos_hookah_order_reaches_terminal(self, db_session):
        data = await self._setup_venue(db_session)
        venue = data["venue"]
        shisha = data["items"]["shisha"]
        mezze = data["items"]["mezze"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            pos_payload = {
                "restaurantId": venue.id,
                "tableNumber": "Lounge 01",
                "customerName": "Waiter POS Order",
                "items": [
                    {
                        "id": shisha.id,
                        "menuItemId": shisha.id,
                        "name": shisha.name,
                        "price": shisha.price,
                        "quantity": 2,
                        "targetDestination": "HOOKAH",
                    },
                    {
                        "id": mezze.id,
                        "menuItemId": mezze.id,
                        "name": mezze.name,
                        "price": mezze.price,
                        "quantity": 1,
                        "targetDestination": "KITCHEN",
                    },
                ],
            }
            res_pos = await ac.post(
                "/api/v1/orders",
                json=pos_payload,
                headers={"Authorization": f"Bearer {data['tokens']['waiter']}"},
            )
            assert res_pos.status_code == 201
            ord_data = res_pos.json()
            assert ord_data["hookahStatus"] == "PENDING"
            assert ord_data["kitchenStatus"] == "PENDING"

            # Hookah station receives ONLY hookah items
            res_hookah = await ac.get(
                f"/api/v1/orders/restaurant/{venue.id}?station=HOOKAH&active_only=true",
                headers={"Authorization": f"Bearer {data['tokens']['hookah']}"},
            )
            assert res_hookah.status_code == 200
            ords = res_hookah.json()
            h_ord = next(o for o in ords if o["id"] == ord_data["id"])
            assert h_ord["hookahStatus"] == "PENDING"
            assert all(i["targetDestination"] == "HOOKAH" for i in h_ord["items"])

    # SCENARIO 3: Supported Hookah Counter-created request is saved and displayed
    async def test_scenario_3_counter_dispatched_hookah_order(self, db_session):
        data = await self._setup_venue(db_session)
        venue = data["venue"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            counter_payload = {
                "restaurantId": venue.id,
                "tableNumber": "VIP Cabana 03",
                "customerName": "Counter Walk-in Guest",
                "specialInstructions": "Extra mint top note, ice chiller pipe",
                "items": [
                    {
                        "id": "custom-pipe-01",
                        "name": "Artisan Citrus Mint Shisha",
                        "price": 700.0,
                        "quantity": 1,
                        "targetDestination": "HOOKAH",
                        "customization": {
                            "flavor": "Citrus Mint",
                            "bowl": "Clay Head",
                            "coals": "Coconut Shell (3 Cubes)",
                        },
                    }
                ],
            }
            res_counter = await ac.post(
                "/api/v1/orders",
                json=counter_payload,
                headers={"Authorization": f"Bearer {data['tokens']['hookah']}"},
            )
            assert res_counter.status_code == 201, res_counter.text
            created = res_counter.json()
            assert created["tableNumber"] == "VIP Cabana 03"
            assert created["hookahStatus"] == "PENDING"

            # Verify it is returned in Hookah Terminal queue
            res_queue = await ac.get(
                f"/api/v1/orders/restaurant/{venue.id}?station=HOOKAH&active_only=true",
                headers={"Authorization": f"Bearer {data['tokens']['hookah']}"},
            )
            assert res_queue.status_code == 200
            assert any(o["id"] == created["id"] for o in res_queue.json())

    # SCENARIO 4: Hookah staff can start preparation
    async def test_scenario_4_hookah_staff_starts_prep(self, db_session):
        data = await self._setup_venue(db_session)
        venue = data["venue"]
        shisha = data["items"]["shisha"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res_create = await ac.post("/api/v1/orders", json={
                "restaurantId": venue.id,
                "tableNumber": "Lounge 01",
                "items": [{"id": shisha.id, "name": shisha.name, "price": shisha.price, "quantity": 1, "targetDestination": "HOOKAH"}],
            })
            order_id = res_create.json()["id"]

            # Hookah staff starts prep
            res_prep = await ac.put(
                f"/api/v1/orders/{order_id}/status",
                json={"status": "PREPARING", "hookahStatus": "PREPARING"},
                headers={"Authorization": f"Bearer {data['tokens']['hookah']}"},
            )
            assert res_prep.status_code == 200
            updated = res_prep.json()
            assert updated["hookahStatus"] == "PREPARING"
            assert updated["status"] == "PREPARING"

    # SCENARIO 5: Marking Hookah order ready moves it to Sent to Waiter
    async def test_scenario_5_hookah_ready_sends_to_waiter(self, db_session):
        data = await self._setup_venue(db_session)
        venue = data["venue"]
        shisha = data["items"]["shisha"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res_create = await ac.post("/api/v1/orders", json={
                "restaurantId": venue.id,
                "tableNumber": "Lounge 01",
                "items": [{"id": shisha.id, "name": shisha.name, "price": shisha.price, "quantity": 1, "targetDestination": "HOOKAH"}],
            })
            order_id = res_create.json()["id"]

            # Mark ready & request waiter
            res_ready = await ac.post(
                f"/api/v1/orders/{order_id}/request-waiter",
                json={"station": "HOOKAH", "notes": "Pipe hot and packed"},
                headers={"Authorization": f"Bearer {data['tokens']['hookah']}"},
            )
            assert res_ready.status_code == 200
            ready_data = res_ready.json()
            assert ready_data["success"] is True
            assert ready_data["order"]["hookahStatus"] == "READY"
            assert ready_data["order"]["hookahWaiterRequested"] is True

            # Verify CustomerRequestModel created for waiter collection
            assert ready_data["request"]["station"] == "HOOKAH"
            assert ready_data["request"]["status"] == "PENDING"

    # SCENARIO 6: Waiter can collect and deliver the Hookah order
    async def test_scenario_6_waiter_collects_and_delivers_hookah_order(self, db_session):
        data = await self._setup_venue(db_session)
        venue = data["venue"]
        shisha = data["items"]["shisha"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res_create = await ac.post("/api/v1/orders", json={
                "restaurantId": venue.id,
                "tableNumber": "Lounge 01",
                "items": [{"id": shisha.id, "name": shisha.name, "price": shisha.price, "quantity": 1, "targetDestination": "HOOKAH"}],
            })
            order_id = res_create.json()["id"]

            # Ready by hookah
            await ac.post(
                f"/api/v1/orders/{order_id}/request-waiter",
                json={"station": "HOOKAH"},
                headers={"Authorization": f"Bearer {data['tokens']['hookah']}"},
            )

            # Waiter collects
            res_collect = await ac.post(
                f"/api/v1/orders/{order_id}/collect",
                json={"waiterName": "Ayaan (Runner)"},
                headers={"Authorization": f"Bearer {data['tokens']['waiter']}"},
            )
            assert res_collect.status_code == 200
            collect_data = res_collect.json()
            assert collect_data["order"]["claimedBy"] == "Ayaan (Runner)"
            assert collect_data["order"]["deliveryStatus"] == "COLLECTED"

            # Waiter delivers
            res_deliver = await ac.post(
                f"/api/v1/orders/{order_id}/deliver",
                json={"station": "HOOKAH", "waiterName": "Ayaan (Runner)"},
                headers={"Authorization": f"Bearer {data['tokens']['waiter']}"},
            )
            assert res_deliver.status_code == 200
            deliv_data = res_deliver.json()
            assert deliv_data["order"]["hookahStatus"] == "COMPLETED"
            assert deliv_data["order"]["status"] == "DELIVERED"
            assert deliv_data["order"]["deliveryStatus"] == "DELIVERED"

    # SCENARIO 7: Bar order completes equivalent workflow through Bar Terminal
    async def test_scenario_7_bar_terminal_equivalent_workflow(self, db_session):
        data = await self._setup_venue(db_session)
        venue = data["venue"]
        cocktail = data["items"]["cocktail"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res_create = await ac.post("/api/v1/orders", json={
                "restaurantId": venue.id,
                "tableNumber": "Bar Stool 04",
                "items": [{"id": cocktail.id, "name": cocktail.name, "price": cocktail.price, "quantity": 1, "targetDestination": "BAR"}],
            })
            order_id = res_create.json()["id"]

            # Bar Terminal queries active orders
            res_bar_q = await ac.get(
                f"/api/v1/orders/restaurant/{venue.id}?station=BAR&active_only=true",
                headers={"Authorization": f"Bearer {data['tokens']['bar']}"},
            )
            assert res_bar_q.status_code == 200
            assert any(o["id"] == order_id for o in res_bar_q.json())

            # Bartender starts prep
            res_prep = await ac.put(
                f"/api/v1/orders/{order_id}/status",
                json={"status": "PREPARING", "barStatus": "PREPARING"},
                headers={"Authorization": f"Bearer {data['tokens']['bar']}"},
            )
            assert res_prep.status_code == 200
            assert res_prep.json()["barStatus"] == "PREPARING"

            # Bartender marks ready
            res_ready = await ac.post(
                f"/api/v1/orders/{order_id}/request-waiter",
                json={"station": "BAR"},
                headers={"Authorization": f"Bearer {data['tokens']['bar']}"},
            )
            assert res_ready.status_code == 200
            assert res_ready.json()["order"]["barStatus"] == "READY"

            # Waiter delivers
            res_deliv = await ac.post(
                f"/api/v1/orders/{order_id}/deliver",
                json={"station": "BAR"},
                headers={"Authorization": f"Bearer {data['tokens']['waiter']}"},
            )
            assert res_deliv.status_code == 200
            assert res_deliv.json()["order"]["barStatus"] == "COMPLETED"

    # SCENARIO 8: Failed API requests show useful errors
    async def test_scenario_8_failed_requests_show_useful_errors(self, db_session):
        data = await self._setup_venue(db_session)
        venue = data["venue"]
        shisha = data["items"]["shisha"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res_create = await ac.post("/api/v1/orders", json={
                "restaurantId": venue.id,
                "tableNumber": "Lounge 01",
                "items": [{"id": shisha.id, "name": shisha.name, "price": shisha.price, "quantity": 1, "targetDestination": "HOOKAH"}],
            })
            order_id = res_create.json()["id"]

            # Unauthenticated request
            res_unauth = await ac.put(f"/api/v1/orders/{order_id}/status", json={"hookahStatus": "PREPARING"})
            assert res_unauth.status_code in [401, 403]

            # Cross-station role unauthorized mutation: Hookah staff tries to update Kitchen status
            res_cross = await ac.put(
                f"/api/v1/orders/{order_id}/status",
                json={"kitchenStatus": "PREPARING"},
                headers={"Authorization": f"Bearer {data['tokens']['hookah']}"},
            )
            assert res_cross.status_code == 403
            assert "not authorized" in res_cross.json()["detail"].lower()

    # SCENARIO 9: Active orders survive browser refresh
    async def test_scenario_9_active_orders_survive_browser_refresh(self, db_session):
        data = await self._setup_venue(db_session)
        venue = data["venue"]
        shisha = data["items"]["shisha"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res_create = await ac.post("/api/v1/orders", json={
                "restaurantId": venue.id,
                "tableNumber": "Lounge 01",
                "items": [{"id": shisha.id, "name": shisha.name, "price": shisha.price, "quantity": 1, "targetDestination": "HOOKAH"}],
            })
            order_id = res_create.json()["id"]

            # First load
            res1 = await ac.get(
                f"/api/v1/orders/restaurant/{venue.id}?station=HOOKAH&active_only=true",
                headers={"Authorization": f"Bearer {data['tokens']['hookah']}"},
            )
            assert res1.status_code == 200
            assert any(o["id"] == order_id for o in res1.json())

            # Simulated refresh (subsequent queries)
            for _ in range(3):
                res_refresh = await ac.get(
                    f"/api/v1/orders/restaurant/{venue.id}?station=HOOKAH&active_only=true",
                    headers={"Authorization": f"Bearer {data['tokens']['hookah']}"},
                )
                assert res_refresh.status_code == 200
                assert any(o["id"] == order_id for o in res_refresh.json())

    # SCENARIO 10: Different tenants cannot see one another's orders
    async def test_scenario_10_tenant_isolation(self, db_session):
        data = await self._setup_venue(db_session)
        venue = data["venue"]
        other_venue = data["other_venue"]
        shisha = data["items"]["shisha"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res_create = await ac.post("/api/v1/orders", json={
                "restaurantId": venue.id,
                "tableNumber": "Lounge 01",
                "items": [{"id": shisha.id, "name": shisha.name, "price": shisha.price, "quantity": 1, "targetDestination": "HOOKAH"}],
            })
            order_id = res_create.json()["id"]

            # Other venue's hookah staff cannot view venue's queue
            res_cross = await ac.get(
                f"/api/v1/orders/restaurant/{venue.id}?station=HOOKAH&active_only=true",
                headers={"Authorization": f"Bearer {data['tokens']['other_hookah']}"},
            )
            assert res_cross.status_code == 403

            # Other venue's own queue is isolated and empty
            res_own = await ac.get(
                f"/api/v1/orders/restaurant/{other_venue.id}?station=HOOKAH&active_only=true",
                headers={"Authorization": f"Bearer {data['tokens']['other_hookah']}"},
            )
            assert res_own.status_code == 200
            assert not any(o["id"] == order_id for o in res_own.json())

    # SCENARIO 11: Repeated actions do not duplicate orders or transitions
    async def test_scenario_11_idempotency_and_repeated_actions(self, db_session):
        data = await self._setup_venue(db_session)
        venue = data["venue"]
        shisha = data["items"]["shisha"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            idem_key = f"key-{uuid.uuid4().hex[:8]}"
            order_payload = {
                "restaurantId": venue.id,
                "tableNumber": "Lounge 01",
                "idempotencyKey": idem_key,
                "items": [{"id": shisha.id, "name": shisha.name, "price": shisha.price, "quantity": 1, "targetDestination": "HOOKAH"}],
            }
            # Initial submit
            res1 = await ac.post("/api/v1/orders", json=order_payload)
            assert res1.status_code == 201
            ord1 = res1.json()

            # Rapid duplicate submit with same idempotency key
            res2 = await ac.post("/api/v1/orders", json=order_payload)
            assert res2.status_code in [200, 201]
            ord2 = res2.json()
            assert ord1["id"] == ord2["id"]

            # Double-tap request-waiter
            rw1 = await ac.post(
                f"/api/v1/orders/{ord1['id']}/request-waiter",
                json={"station": "HOOKAH"},
                headers={"Authorization": f"Bearer {data['tokens']['hookah']}"},
            )
            assert rw1.status_code == 200
            rw2 = await ac.post(
                f"/api/v1/orders/{ord1['id']}/request-waiter",
                json={"station": "HOOKAH"},
                headers={"Authorization": f"Bearer {data['tokens']['hookah']}"},
            )
            assert rw2.status_code == 200
            # Both refer to same service request without duplicating
            assert rw1.json()["request"]["id"] == rw2.json()["request"]["id"]

    # SCENARIO 12: Existing waiter assistance requests still work
    async def test_scenario_12_waiter_assistance_requests_still_work(self, db_session):
        data = await self._setup_venue(db_session)
        venue = data["venue"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            assist_payload = {
                "restaurantId": venue.id,
                "tableNumber": "Lounge 01",
                "requestType": "SERVICE",
                "message": "Need extra water and ice",
            }
            res_req = await ac.post("/api/v1/customer-requests", json=assist_payload)
            assert res_req.status_code in [200, 201], res_req.text
            created_req = res_req.json()
            req_id = created_req["id"]
            assert created_req["status"] == "PENDING"

            res_ack = await ac.patch(
                f"/api/v1/customer-requests/{req_id}",
                json={"status": "IN_PROGRESS", "waiterName": "Ayaan"},
                headers={"Authorization": f"Bearer {data['tokens']['waiter']}"},
            )
            assert res_ack.status_code == 200
            assert res_ack.json()["status"] == "IN_PROGRESS"

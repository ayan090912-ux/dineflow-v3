import pytest
import uuid
from datetime import datetime, timezone
from jose import jwt
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table, TableSession
from app.modules.menu.models import MenuItem, MenuCategory
from app.modules.orders.models import Order
from app.modules.weddings.models import WeddingEvent, EventTable, EventAssistanceRequest
from app.core.config.settings import get_settings

settings = get_settings()

def create_jwt(payload: dict) -> str:
    claims = {
        "exp": int(datetime.now(timezone.utc).timestamp()) + 3600,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        **payload,
    }
    return jwt.encode(claims, settings.JWT_ACCESS_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


@pytest.mark.asyncio
class TestBarHookahAssistanceTerminalsVerification:

    async def _setup_fixtures(self, db: AsyncSession):
        rest_id = f"rest-term-{uuid.uuid4().hex[:6]}"
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@terminaltest.com"
        rest = Restaurant(
            id=rest_id,
            name="Terminals Test Restaurant",
            slug=f"term-{uuid.uuid4().hex[:6]}",
            public_slug=f"term-{uuid.uuid4().hex[:6]}",
            owner_uid=owner_uid,
            owner_email=owner_email,
            status="ACTIVE",
            lifecycle_status="LIVE",
            has_kitchen=True,
            has_bar=True,
            has_hookah=True,
            has_waiter=True,
        )
        db.add(rest)

        # Other restaurant for cross-tenant testing
        other_rest_id = f"rest-other-{uuid.uuid4().hex[:6]}"
        other_rest = Restaurant(
            id=other_rest_id,
            name="Other Tenant Restaurant",
            slug=f"other-{uuid.uuid4().hex[:6]}",
            public_slug=f"other-{uuid.uuid4().hex[:6]}",
            owner_uid=f"uid_other_{uuid.uuid4().hex[:6]}",
            owner_email=f"owner_other_{uuid.uuid4().hex[:6]}@other.com",
            status="ACTIVE",
            lifecycle_status="LIVE",
            has_kitchen=True,
            has_bar=True,
            has_hookah=True,
        )
        db.add(other_rest)

        # Event
        ev_id = f"evt-term-{uuid.uuid4().hex[:6]}"
        event = WeddingEvent(
            id=ev_id,
            restaurant_id=rest_id,
            title="Royal Banquet Reception",
            event_date="2026-10-25",
            status="ACTIVE",
            is_ordering_open=True,
            has_table_assistance=True,
            has_food=True,
            has_bar=True,
            has_hookah=True,
        )
        db.add(event)

        # Menu items: food, drink, hookah
        cat_food = MenuCategory(id=f"cat-food-{uuid.uuid4().hex[:4]}", restaurant_id=rest_id, name="Appetizers", sort_order=1)
        cat_bar = MenuCategory(id=f"cat-bar-{uuid.uuid4().hex[:4]}", restaurant_id=rest_id, name="Cocktails", sort_order=2)
        cat_hookah = MenuCategory(id=f"cat-hookah-{uuid.uuid4().hex[:4]}", restaurant_id=rest_id, name="Shisha Lounge", sort_order=3)
        db.add_all([cat_food, cat_bar, cat_hookah])

        item_food = MenuItem(
            id=f"item-food-{uuid.uuid4().hex[:4]}",
            restaurant_id=rest_id,
            category_id=cat_food.id,
            name="Paneer Tikka",
            price=250.0,
            target_destination="KITCHEN",
            is_alcoholic=False,
            is_available=True,
        )
        item_bar = MenuItem(
            id=f"item-bar-{uuid.uuid4().hex[:4]}",
            restaurant_id=rest_id,
            category_id=cat_bar.id,
            name="Whiskey Sour Cocktail",
            price=450.0,
            target_destination="BAR",
            is_alcoholic=True,
            is_available=True,
        )
        item_hookah = MenuItem(
            id=f"item-hookah-{uuid.uuid4().hex[:4]}",
            restaurant_id=rest_id,
            category_id=cat_hookah.id,
            name="Double Apple Shisha",
            price=600.0,
            target_destination="HOOKAH",
            is_alcoholic=False,
            is_available=True,
        )
        db.add_all([item_food, item_bar, item_hookah])

        # Floorplan Table
        tbl = Table(
            id=f"tbl-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            table_number="T12",
            capacity=4,
            status="AVAILABLE",
        )
        db.add(tbl)

        # Event Table
        etbl = EventTable(
            id=f"etbl-{uuid.uuid4().hex[:6]}",
            event_id=ev_id,
            restaurant_id=rest_id,
            table_number="EVT-05",
            capacity=8,
        )
        db.add(etbl)

        await db.commit()

        # Generate tokens
        owner_token = create_jwt({
            "uid": owner_uid,
            "email": owner_email,
            "role": "OWNER",
            "scope": "OWNER",
            "restaurant_id": rest_id,
        })
        bar_staff_token = create_jwt({
            "uid": f"staff_bar_{uuid.uuid4().hex[:4]}",
            "email": "bar_bartender@staff.dinely.internal",
            "role": "BAR",
            "scope": "STAFF",
            "restaurant_id": rest_id,
        })
        hookah_staff_token = create_jwt({
            "uid": f"staff_hookah_{uuid.uuid4().hex[:4]}",
            "email": "hookah_master@staff.dinely.internal",
            "role": "HOOKAH",
            "scope": "STAFF",
            "restaurant_id": rest_id,
        })
        waiter_token = create_jwt({
            "uid": f"staff_waiter_{uuid.uuid4().hex[:4]}",
            "email": "waiter_service@staff.dinely.internal",
            "role": "WAITER",
            "scope": "STAFF",
            "restaurant_id": rest_id,
        })
        kitchen_staff_token = create_jwt({
            "uid": f"staff_kitchen_{uuid.uuid4().hex[:4]}",
            "email": "kitchen_chef@staff.dinely.internal",
            "role": "KITCHEN",
            "scope": "STAFF",
            "restaurant_id": rest_id,
        })
        other_staff_token = create_jwt({
            "uid": f"staff_other_{uuid.uuid4().hex[:4]}",
            "email": "other_bar@staff.dinely.internal",
            "role": "BAR",
            "scope": "STAFF",
            "restaurant_id": other_rest_id,
        })

        return {
            "rest_id": rest_id,
            "other_rest_id": other_rest_id,
            "ev_id": ev_id,
            "item_food": item_food,
            "item_bar": item_bar,
            "item_hookah": item_hookah,
            "owner_token": owner_token,
            "kitchen_staff_token": kitchen_staff_token,
            "bar_staff_token": bar_staff_token,
            "hookah_staff_token": hookah_staff_token,
            "waiter_token": waiter_token,
            "other_staff_token": other_staff_token,
        }

    async def test_criterion_1_and_2_bar_and_hookah_order_queues(self, db_session: AsyncSession):
        """Validates Criteria 1 & 2: Bar and Hookah orders appear in respective terminals."""
        f = await self._setup_fixtures(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Place mixed order with Food, Bar, and Hookah
            resp_order = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": f["rest_id"],
                    "tableNumber": "T12",
                    "items": [
                        {"name": f["item_food"].name, "menuItemId": f["item_food"].id, "quantity": 1, "price": 250.0},
                        {"name": f["item_bar"].name, "menuItemId": f["item_bar"].id, "quantity": 2, "price": 450.0},
                        {"name": f["item_hookah"].name, "menuItemId": f["item_hookah"].id, "quantity": 1, "price": 600.0},
                    ]
                }
            )
            assert resp_order.status_code == 201, resp_order.text
            created_order = resp_order.json()
            order_id = created_order["id"]

            # 2. Query Bar Terminal queue
            bar_resp = await client.get(
                f"/api/v1/orders/restaurant/{f['rest_id']}?station=BAR&active_only=true",
                headers={"Authorization": f"Bearer {f['bar_staff_token']}"}
            )
            assert bar_resp.status_code == 200, bar_resp.text
            bar_orders = bar_resp.json()
            assert any(o["id"] == order_id for o in bar_orders), "Order must appear in Bar Terminal!"
            # Ensure bar items only are returned for station=BAR
            matching_bar_order = next(o for o in bar_orders if o["id"] == order_id)
            assert all(it.get("targetDestination") == "BAR" for it in matching_bar_order["items"])
            assert any("Whiskey" in it.get("name", "") for it in matching_bar_order["items"])

            # 3. Query Hookah Terminal queue
            hookah_resp = await client.get(
                f"/api/v1/orders/restaurant/{f['rest_id']}?station=HOOKAH&active_only=true",
                headers={"Authorization": f"Bearer {f['hookah_staff_token']}"}
            )
            assert hookah_resp.status_code == 200, hookah_resp.text
            hookah_orders = hookah_resp.json()
            assert any(o["id"] == order_id for o in hookah_orders), "Order must appear in Hookah Terminal!"
            matching_h_order = next(o for o in hookah_orders if o["id"] == order_id)
            assert all(it.get("targetDestination") == "HOOKAH" for it in matching_h_order["items"])
            assert any("Shisha" in it.get("name", "") for it in matching_h_order["items"])

    async def test_criterion_3_assistance_requests_appear_in_terminal(self, db_session: AsyncSession):
        """Validates Criterion 3: Table Assistance requests appear in staff terminal."""
        f = await self._setup_fixtures(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Guest requests assistance
            req_resp = await client.post(
                f"/api/v1/restaurants/public/events/{f['ev_id']}/assistance",
                json={
                    "tableNumber": "EVT-05",
                    "guestName": "Sarah Wedding Guest",
                    "items": [{"code": "WATER", "label": "Drinking Water", "quantity": 2}],
                    "guestNote": "Cold water please",
                    "idempotencyKey": f"ast-{uuid.uuid4().hex[:6]}",
                }
            )
            assert req_resp.status_code == 201, req_resp.text
            created_req = req_resp.json()
            req_id = created_req["id"]

            # Staff queries assistance queue
            staff_resp = await client.get(
                f"/api/v1/restaurants/{f['rest_id']}/events/{f['ev_id']}/assistance",
                headers={"Authorization": f"Bearer {f['waiter_token']}"}
            )
            assert staff_resp.status_code == 200, staff_resp.text
            body = staff_resp.json()
            assert "requests" in body and "summary" in body
            assert any(r["id"] == req_id for r in body["requests"]), "Request must appear in Table Assistance Terminal!"
            match = next(r for r in body["requests"] if r["id"] == req_id)
            assert match["tableNumber"] == "EVT-05"
            assert match["status"] == "NEW"

    async def test_criterion_4_and_5_load_existing_and_new_records(self, db_session: AsyncSession):
        """Validates Criteria 4 & 5: Load existing pending records and newly created records."""
        f = await self._setup_fixtures(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Terminal loads existing initial state (0 orders)
            bar_init = await client.get(
                f"/api/v1/orders/restaurant/{f['rest_id']}?station=BAR&active_only=true",
                headers={"Authorization": f"Bearer {f['bar_staff_token']}"}
            )
            assert bar_init.status_code == 200
            initial_count = len(bar_init.json())

            # 2. New drink order created
            await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": f["rest_id"],
                    "tableNumber": "T12",
                    "items": [{"name": f["item_bar"].name, "menuItemId": f["item_bar"].id, "quantity": 1, "price": 450.0}]
                }
            )

            # 3. New record appears in queue
            bar_after = await client.get(
                f"/api/v1/orders/restaurant/{f['rest_id']}?station=BAR&active_only=true",
                headers={"Authorization": f"Bearer {f['bar_staff_token']}"}
            )
            assert len(bar_after.json()) == initial_count + 1

    async def test_criterion_6_status_updates_persist_across_reloads(self, db_session: AsyncSession):
        """Validates Criterion 6: Status updates persist and are retrievable across reloads."""
        f = await self._setup_fixtures(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create Hookah order
            resp = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": f["rest_id"],
                    "tableNumber": "T12",
                    "items": [{"name": f["item_hookah"].name, "menuItemId": f["item_hookah"].id, "quantity": 1, "price": 600.0}]
                }
            )
            order_id = resp.json()["id"]

            # Hookah Master marks ticket as PREPARING
            up_resp = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                headers={"Authorization": f"Bearer {f['hookah_staff_token']}"},
                json={"hookahStatus": "PREPARING"}
            )
            assert up_resp.status_code == 200, up_resp.text
            assert up_resp.json()["hookahStatus"] == "PREPARING"

            # Reload queue
            reload_resp = await client.get(
                f"/api/v1/orders/restaurant/{f['rest_id']}?station=HOOKAH&active_only=true",
                headers={"Authorization": f"Bearer {f['hookah_staff_token']}"}
            )
            reload_order = next(o for o in reload_resp.json() if o["id"] == order_id)
            assert reload_order["hookahStatus"] == "PREPARING"

            # Hookah Master advances to READY
            ready_resp = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                headers={"Authorization": f"Bearer {f['hookah_staff_token']}"},
                json={"hookahStatus": "READY"}
            )
            assert ready_resp.status_code == 200
            assert ready_resp.json()["hookahStatus"] == "READY"
            assert ready_resp.json()["status"] == "READY"

    async def test_criterion_7_and_8_empty_queue_and_error_states(self, db_session: AsyncSession):
        """Validates Criteria 7 & 8: Empty queues display valid empty state, API errors return proper codes."""
        f = await self._setup_fixtures(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Empty queue returns valid empty array
            empty_resp = await client.get(
                f"/api/v1/orders/restaurant/{f['rest_id']}?station=HOOKAH&active_only=true",
                headers={"Authorization": f"Bearer {f['hookah_staff_token']}"}
            )
            assert empty_resp.status_code == 200
            assert empty_resp.json() == []

            # Request non-existent order status update returns 404
            err_resp = await client.patch(
                "/api/v1/orders/non-existent-order-id/status",
                headers={"Authorization": f"Bearer {f['bar_staff_token']}"},
                json={"barStatus": "READY"}
            )
            assert err_resp.status_code == 404

            # Missing auth returns 401
            unauth_resp = await client.get(f"/api/v1/restaurants/{f['rest_id']}/events/{f['ev_id']}/assistance")
            assert unauth_resp.status_code == 401

    async def test_criterion_9_tenant_isolation(self, db_session: AsyncSession):
        """Validates Criterion 9: Staff from another restaurant cannot access records."""
        f = await self._setup_fixtures(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Staff from other restaurant attempts to access this restaurant's bar queue
            iso_resp = await client.get(
                f"/api/v1/orders/restaurant/{f['rest_id']}?station=BAR",
                headers={"Authorization": f"Bearer {f['other_staff_token']}"}
            )
            assert iso_resp.status_code == 403, "Cross-tenant access must be rejected with 403 Forbidden!"

            # Staff from other restaurant attempts to access table assistance
            iso_ast = await client.get(
                f"/api/v1/restaurants/{f['rest_id']}/events/{f['ev_id']}/assistance",
                headers={"Authorization": f"Bearer {f['other_staff_token']}"}
            )
            assert iso_ast.status_code == 403, "Cross-tenant assistance access must be rejected!"

    async def test_criterion_10_multi_station_readiness_lifecycle(self, db_session: AsyncSession):
        """Validates Criterion 10: Multi-station orders become READY only when all required stations finish."""
        f = await self._setup_fixtures(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create Food + Bar order
            resp = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": f["rest_id"],
                    "tableNumber": "T12",
                    "items": [
                        {"name": f["item_food"].name, "menuItemId": f["item_food"].id, "quantity": 1, "price": 250.0},
                        {"name": f["item_bar"].name, "menuItemId": f["item_bar"].id, "quantity": 1, "price": 450.0},
                    ]
                }
            )
            order_id = resp.json()["id"]

            # Food staff marks Kitchen READY, but Bar is still PENDING
            await client.patch(
                f"/api/v1/orders/{order_id}/status",
                headers={"Authorization": f"Bearer {f['kitchen_staff_token']}"},
                json={"kitchenStatus": "READY"}
            )
            check1 = await client.get(f"/api/v1/orders/{order_id}", headers={"Authorization": f"Bearer {f['owner_token']}"})
            # Parent order must NOT be READY yet because Bar hasn't completed
            assert check1.json()["status"] != "READY", "Parent order must not be ready until bar also completes!"

            # Bar staff marks Bar READY
            await client.patch(
                f"/api/v1/orders/{order_id}/status",
                headers={"Authorization": f"Bearer {f['bar_staff_token']}"},
                json={"barStatus": "READY"}
            )
            check2 = await client.get(f"/api/v1/orders/{order_id}", headers={"Authorization": f"Bearer {f['owner_token']}"})
            # Now both stations are READY, so parent order must be READY!
            assert check2.json()["status"] == "READY", "Parent order must become READY when all stations finish!"

    async def test_criterion_11_assistance_status_flow_and_idempotency(self, db_session: AsyncSession):
        """Validates Criterion 11: Claim, in-progress, completion lifecycle and rapid tap safety."""
        f = await self._setup_fixtures(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            idem_key = f"ast-rapid-{uuid.uuid4().hex[:6]}"
            # Submit initial assistance request
            r1 = await client.post(
                f"/api/v1/restaurants/public/events/{f['ev_id']}/assistance",
                json={
                    "tableNumber": "EVT-05",
                    "items": [{"code": "CUTLERY", "label": "Extra Spoons", "quantity": 2}],
                    "idempotencyKey": idem_key,
                }
            )
            assert r1.status_code == 201
            req_id = r1.json()["id"]

            # Rapid duplicate tap with same idempotency key returns 200 with existing record
            r2 = await client.post(
                f"/api/v1/restaurants/public/events/{f['ev_id']}/assistance",
                json={
                    "tableNumber": "EVT-05",
                    "items": [{"code": "CUTLERY", "label": "Extra Spoons", "quantity": 2}],
                    "idempotencyKey": idem_key,
                }
            )
            assert r2.status_code == 200
            assert r2.json()["id"] == req_id

            # Staff claims request -> ACKNOWLEDGED
            claim_resp = await client.patch(
                f"/api/v1/restaurants/{f['rest_id']}/events/{f['ev_id']}/assistance/{req_id}/status",
                headers={"Authorization": f"Bearer {f['waiter_token']}"},
                json={"status": "ACKNOWLEDGED", "assignedStaffName": "Alex Waiter"}
            )
            assert claim_resp.status_code == 200
            assert claim_resp.json()["status"] == "ACKNOWLEDGED"
            assert claim_resp.json()["assignedStaffName"] == "Alex Waiter"

            # Staff marks IN_PROGRESS
            prog_resp = await client.patch(
                f"/api/v1/restaurants/{f['rest_id']}/events/{f['ev_id']}/assistance/{req_id}/status",
                headers={"Authorization": f"Bearer {f['waiter_token']}"},
                json={"status": "IN_PROGRESS"}
            )
            assert prog_resp.status_code == 200
            assert prog_resp.json()["status"] == "IN_PROGRESS"

            # Staff marks COMPLETED
            comp_resp = await client.patch(
                f"/api/v1/restaurants/{f['rest_id']}/events/{f['ev_id']}/assistance/{req_id}/status",
                headers={"Authorization": f"Bearer {f['waiter_token']}"},
                json={"status": "COMPLETED"}
            )
            assert comp_resp.status_code == 200
            assert comp_resp.json()["status"] == "COMPLETED"

    async def test_criterion_12_event_portal_and_tab_navigation(self, db_session: AsyncSession):
        """Validates Criterion 12: Event scoped querying allows retrieving event orders and assistance independently."""
        f = await self._setup_fixtures(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create wedding event order
            evt_ord_resp = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": f["rest_id"],
                    "eventId": f["ev_id"],
                    "tableNumber": "EVT-05",
                    "legalDrinkingAgeAffirmed": True,
                    "items": [{"name": f["item_bar"].name, "menuItemId": f["item_bar"].id, "quantity": 2, "price": 0.0}]
                }
            )
            assert evt_ord_resp.status_code == 201
            evt_order_id = evt_ord_resp.json()["id"]

            # Event Scoped Query (used by WeddingEventPortal)
            portal_orders_resp = await client.get(
                f"/api/v1/orders/restaurant/{f['rest_id']}?event_id={f['ev_id']}",
                headers={"Authorization": f"Bearer {f['owner_token']}"}
            )
            assert portal_orders_resp.status_code == 200
            orders = portal_orders_resp.json()
            assert any(o["id"] == evt_order_id for o in orders), "Event order must be returned in event-scoped query!"

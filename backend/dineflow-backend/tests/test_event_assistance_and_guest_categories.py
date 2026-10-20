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
from app.modules.weddings.models import WeddingEvent, EventTable, EventAssistanceRequest
from app.modules.orders.models import Order
from app.core.config.settings import get_settings

settings = get_settings()


def create_fake_jwt(claims: dict) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_sig"
    return f"{header}.{payload}.{signature}"


def create_jwt(claims: dict) -> str:
    return create_fake_jwt(claims)


@pytest.mark.asyncio
class TestEventAssistanceAndGuestCategories:
    async def _setup_env(self, db_session: AsyncSession):
        rest_id = f"rest-venue-{uuid.uuid4().hex[:6]}"
        other_rest_id = f"rest-other-{uuid.uuid4().hex[:6]}"
        owner_uid = f"uid-owner-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@luxuryvenue.com"
        staff_uid = f"uid-staff-{uuid.uuid4().hex[:6]}"

        venue = Restaurant(
            id=rest_id,
            name="The Grand Palace Events & Catering",
            slug=f"palace-{uuid.uuid4().hex[:4]}",
            public_slug=f"palace-{uuid.uuid4().hex[:4]}",
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
            enabled_modules=["kitchen", "bar", "hookah", "waiter", "billing", "tables", "weddings"],
        )
        other_venue = Restaurant(
            id=other_rest_id,
            name="Other Venue",
            slug=f"other-{uuid.uuid4().hex[:4]}",
            public_slug=f"other-{uuid.uuid4().hex[:4]}",
            owner_uid="other-owner-uid",
            owner_email="other@venue.com",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_bar=True,
            has_hookah=True,
            has_tables=True,
            has_waiter=True,
            enabled_modules=["kitchen", "bar", "hookah", "waiter", "billing", "tables", "weddings"],
        )
        db_session.add_all([venue, other_venue])

        owner_mem = RestaurantMembership(
            id=f"mem-own-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=owner_uid,
            user_email=owner_email,
            role="OWNER",
        )
        staff_mem = RestaurantMembership(
            id=f"mem-stf-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=staff_uid,
            user_email=f"staff-{uuid.uuid4().hex[:4]}@luxuryvenue.com",
            role="WAITER",
        )
        db_session.add_all([owner_mem, staff_mem])

        # Categories
        cat_food = MenuCategory(
            id=f"cat-food-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            name="Banquet Starters & Mains",
            sort_order=1,
            is_enabled=True,
        )
        cat_bar = MenuCategory(
            id=f"cat-bar-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            name="Bar & Cocktails",
            sort_order=2,
            is_enabled=True,
        )
        cat_hookah = MenuCategory(
            id=f"cat-hk-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            name="Royal Shisha",
            sort_order=3,
            is_enabled=True,
        )
        db_session.add_all([cat_food, cat_bar, cat_hookah])
        await db_session.flush()

        # Food items: Veg & Non-Veg
        item_food_veg = MenuItem(
            id=f"item-veg-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat_food.id,
            name="Paneer Tikka Royale",
            price=24.0,
            target_destination="KITCHEN",
            is_vegetarian=True,
            is_available=True,
        )
        item_food_nonveg = MenuItem(
            id=f"item-nonveg-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat_food.id,
            name="Braised Wagyu Short Rib",
            price=45.0,
            target_destination="KITCHEN",
            is_vegetarian=False,
            is_available=True,
        )
        item_food_disabled = MenuItem(
            id=f"item-dis-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat_food.id,
            name="Seasonal Truffle Risotto",
            price=50.0,
            target_destination="KITCHEN",
            is_vegetarian=True,
            is_available=False,
        )
        # Bar item
        item_bar_alc = MenuItem(
            id=f"item-bar-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat_bar.id,
            name="Golden French 75",
            price=18.0,
            target_destination="BAR",
            is_alcoholic=True,
            is_available=True,
        )
        # Hookah item
        item_hookah = MenuItem(
            id=f"item-hk-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat_hookah.id,
            name="Double Apple Mint Shisha",
            price=55.0,
            target_destination="HOOKAH",
            is_available=True,
        )
        db_session.add_all([item_food_veg, item_food_nonveg, item_food_disabled, item_bar_alc, item_hookah])
        await db_session.commit()

        tokens = {
            "owner": create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest_id}),
            "staff": create_jwt({"sub": staff_uid, "email": "staff@luxuryvenue.com", "role": "WAITER", "restaurant_id": rest_id}),
            "other_owner": create_jwt({"sub": "other-owner-uid", "email": "other@venue.com", "role": "OWNER", "restaurant_id": other_rest_id}),
        }

        return {
            "venue": venue,
            "other_venue": other_venue,
            "tokens": tokens,
            "owner_uid": owner_uid,
            "staff_uid": staff_uid,
            "items": {
                "veg": item_food_veg,
                "nonveg": item_food_nonveg,
                "disabled": item_food_disabled,
                "bar": item_bar_alc,
                "hookah": item_hookah,
            },
        }

    # 1. Food categories load and dietary filters work
    async def test_criterion_1_food_categories_and_dietary(self, db_session):
        ctx = await self._setup_env(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['venue'].id}/events",
                json={
                    "title": "Summer Garden Wedding",
                    "eventType": "WEDDING",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "timezone": "UTC",
                    "tableCount": 5,
                    "status": "ACTIVE",
                    "isOrderingOpen": True,
                    "hasFood": True,
                    "hasBar": False,
                    "hasHookah": False,
                },
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert create_res.status_code == 201
            event_id = create_res.json()["id"]

            # Public QR fetch
            public_res = await client.get(f"/api/v1/public/events/{event_id}?table=01")
            assert public_res.status_code == 200
            data = public_res.json()
            assert data["event"]["hasFood"] is True
            assert data["event"]["hasBar"] is False
            assert data["event"]["hasHookah"] is False

            # Verify food categories and dietary fields returned
            menu = data["menu"]
            assert len(menu) >= 1
            food_cat = next((c for c in menu if c["name"] == "Banquet Starters & Mains"), None)
            assert food_cat is not None
            # Only available items loaded
            names = [item["name"] for item in food_cat["items"]]
            assert "Paneer Tikka Royale" in names
            assert "Braised Wagyu Short Rib" in names
            assert "Seasonal Truffle Risotto" not in names  # Unavailable item excluded

            # Check dietaryType and targetDestination flags
            veg_item = next(i for i in food_cat["items"] if i["name"] == "Paneer Tikka Royale")
            assert veg_item["dietaryType"] == "VEG"
            assert veg_item["targetDestination"] == "KITCHEN"

            nonveg_item = next(i for i in food_cat["items"] if i["name"] == "Braised Wagyu Short Rib")
            assert nonveg_item["dietaryType"] == "NON_VEG"

    # 2. Configured Bar and Hookah sections appear only when enabled
    async def test_criterion_2_bar_and_hookah_section_gating(self, db_session):
        ctx = await self._setup_env(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Event with Bar enabled, Hookah disabled
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['venue'].id}/events",
                json={
                    "title": "Black Tie Gala",
                    "eventType": "CORPORATE",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "timezone": "UTC",
                    "tableCount": 3,
                    "status": "ACTIVE",
                    "isOrderingOpen": True,
                    "hasFood": True,
                    "hasBar": True,
                    "hasHookah": False,
                },
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            event_id = create_res.json()["id"]

            res = await client.get(f"/api/v1/public/events/{event_id}?table=01")
            assert res.status_code == 200
            data = res.json()
            assert data["event"]["hasBar"] is True
            assert data["event"]["hasHookah"] is False

            all_cat_names = [c["name"] for c in data["menu"]]
            assert "Bar & Cocktails" in all_cat_names
            assert "Royal Shisha" not in all_cat_names  # Hookah category excluded because hasHookah is False

    # 3. Disabled or unavailable menu items cannot be ordered
    async def test_criterion_3_unavailable_items_rejected(self, db_session):
        ctx = await self._setup_env(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['venue'].id}/events",
                json={
                    "title": "Autumn Nuptials",
                    "eventType": "WEDDING",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "timezone": "UTC",
                    "tableCount": 2,
                    "status": "ACTIVE",
                    "isOrderingOpen": True,
                },
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            event_id = create_res.json()["id"]

            # Attempt ordering disabled item
            order_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": ctx["venue"].id,
                    "tableNumber": "01",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "Guest Table 1",
                    "items": [{
                        "menuItemId": ctx["items"]["disabled"].id,
                        "name": ctx["items"]["disabled"].name,
                        "price": 0.0,
                        "quantity": 1,
                    }],
                },
            )
            assert order_res.status_code == 400
            assert "unavailable" in order_res.text.lower() or "sold out" in order_res.text.lower()

    # 4 & 5. Guests place food and enabled service orders without payment; reach correct queues
    async def test_criterion_4_and_5_service_order_routing_and_no_payment(self, db_session):
        ctx = await self._setup_env(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['venue'].id}/events",
                json={
                    "title": "Royal Heritage Gala",
                    "eventType": "WEDDING",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "timezone": "UTC",
                    "tableCount": 4,
                    "status": "ACTIVE",
                    "isOrderingOpen": True,
                    "hasFood": True,
                    "hasBar": True,
                    "hasHookah": True,
                },
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            event_id = create_res.json()["id"]

            # Mixed order with food, bar, hookah
            order_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": ctx["venue"].id,
                    "tableNumber": "03",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "VIP Table 3",
                    "legalDrinkingAgeAffirmed": True,
                    "items": [
                        {
                            "menuItemId": ctx["items"]["veg"].id,
                            "name": ctx["items"]["veg"].name,
                            "price": 0.0,
                            "quantity": 2,
                            "targetDestination": "KITCHEN",
                        },
                        {
                            "menuItemId": ctx["items"]["bar"].id,
                            "name": ctx["items"]["bar"].name,
                            "price": 0.0,
                            "quantity": 2,
                            "targetDestination": "BAR",
                            "isAlcoholic": True,
                        },
                        {
                            "menuItemId": ctx["items"]["hookah"].id,
                            "name": ctx["items"]["hookah"].name,
                            "price": 0.0,
                            "quantity": 1,
                            "targetDestination": "HOOKAH",
                        },
                    ],
                },
            )
            assert order_res.status_code == 201
            order_data = order_res.json()
            assert order_data["status"] == "PENDING"
            # No billing/payment transaction required
            assert order_data["orderType"] in ("EVENT_ORDER", "WEDDING_EVENT")

            # Check Kitchen terminal queue contains this order
            kitchen_res = await client.get(
                f"/api/v1/orders/restaurant/{ctx['venue'].id}?station=KITCHEN",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert kitchen_res.status_code == 200
            kitchen_orders = kitchen_res.json()
            assert any(o["id"] == order_data["id"] for o in kitchen_orders)

            # Check Bar terminal queue contains this order
            bar_res = await client.get(
                f"/api/v1/orders/restaurant/{ctx['venue'].id}?station=BAR",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert bar_res.status_code == 200
            bar_orders = bar_res.json()
            assert any(o["id"] == order_data["id"] for o in bar_orders)

            # Check Hookah terminal queue contains this order
            hookah_res = await client.get(
                f"/api/v1/orders/restaurant/{ctx['venue'].id}?station=HOOKAH",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert hookah_res.status_code == 200
            hookah_orders = hookah_res.json()
            assert any(o["id"] == order_data["id"] for o in hookah_orders)

    # 6 & 7. Guests can submit table assistance for actual table; does NOT pollute food orders
    async def test_criterion_6_and_7_table_assistance_isolation(self, db_session):
        ctx = await self._setup_env(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['venue'].id}/events",
                json={
                    "title": "Reception Feast",
                    "eventType": "WEDDING",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "timezone": "UTC",
                    "tableCount": 4,
                    "status": "ACTIVE",
                    "isOrderingOpen": True,
                    "hasTableAssistance": True,
                },
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            event_id = create_res.json()["id"]

            # Count food orders before assistance request
            count_res = await client.get(
                f"/api/v1/orders/restaurant/{ctx['venue'].id}",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            orders_before = len(count_res.json())

            # Submit table assistance request
            req_payload = {
                "tableNumber": "02",
                "requestItems": [
                    {"code": "PLATES", "label": "Extra plates", "quantity": 4},
                    {"code": "NAPKINS", "label": "Tissues & napkins", "quantity": 6},
                    {"code": "WATER", "label": "Drinking water", "quantity": 2},
                ],
                "guestName": "Table 02 Guest",
                "guestNote": "Please bring chilled water",
                "idempotencyKey": "idem-key-test-001",
            }

            assist_res = await client.post(
                f"/api/v1/public/events/{event_id}/assistance",
                json=req_payload,
            )
            assert assist_res.status_code == 201
            assist_data = assist_res.json()
            assert assist_data["status"] == "NEW"
            assert assist_data["tableNumber"] == "02"
            assert assist_data["eventId"] == event_id
            request_id = assist_data["id"]

            # Verify food orders count did NOT increase (no zero-price orders created!)
            count_after_res = await client.get(
                f"/api/v1/orders/restaurant/{ctx['venue'].id}",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert len(count_after_res.json()) == orders_before

            # Verify assistance request did NOT appear in Kitchen or Bar queues
            kitchen_res = await client.get(
                f"/api/v1/orders/restaurant/{ctx['venue'].id}?station=KITCHEN",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert not any(o["id"] == request_id for o in kitchen_res.json())

    # 8. Authorized staff member can claim, acknowledge, in-progress, and complete a request
    async def test_criterion_8_staff_lifecycle_actions(self, db_session):
        ctx = await self._setup_env(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['venue'].id}/events",
                json={
                    "title": "Evening Banquet",
                    "eventType": "WEDDING",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "timezone": "UTC",
                    "tableCount": 3,
                    "status": "ACTIVE",
                    "isOrderingOpen": True,
                },
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            event_id = create_res.json()["id"]

            # Guest submits request
            assist_res = await client.post(
                f"/api/v1/public/events/{event_id}/assistance",
                json={
                    "tableNumber": "01",
                    "requestItems": [{"code": "CUTLERY", "label": "Cutlery", "quantity": 3}],
                },
            )
            assert assist_res.status_code == 201
            request_id = assist_res.json()["id"]

            # Staff member acknowledges and claims request
            ack_res = await client.patch(
                f"/api/v1/restaurants/{ctx['venue'].id}/events/{event_id}/assistance/{request_id}/status",
                json={"status": "ACKNOWLEDGED", "assignedStaffName": "Server Alex"},
                headers={"Authorization": f"Bearer {ctx['tokens']['staff']}"},
            )
            assert ack_res.status_code == 200
            ack_data = ack_res.json()
            assert ack_data["status"] == "ACKNOWLEDGED"
            assert ack_data["assignedStaffName"] == "Server Alex"
            assert ack_data["acknowledgedAt"] is not None

            # Staff marks IN_PROGRESS
            prog_res = await client.patch(
                f"/api/v1/restaurants/{ctx['venue'].id}/events/{event_id}/assistance/{request_id}/status",
                json={"status": "IN_PROGRESS"},
                headers={"Authorization": f"Bearer {ctx['tokens']['staff']}"},
            )
            assert prog_res.status_code == 200
            assert prog_res.json()["status"] == "IN_PROGRESS"
            assert prog_res.json()["inProgressAt"] is not None

            # Staff marks COMPLETED
            comp_res = await client.patch(
                f"/api/v1/restaurants/{ctx['venue'].id}/events/{event_id}/assistance/{request_id}/status",
                json={"status": "COMPLETED"},
                headers={"Authorization": f"Bearer {ctx['tokens']['staff']}"},
            )
            assert comp_res.status_code == 200
            assert comp_res.json()["status"] == "COMPLETED"
            assert comp_res.json()["completedAt"] is not None

            # Verify terminal metrics reflect completion
            metrics_res = await client.get(
                f"/api/v1/restaurants/{ctx['venue'].id}/events/{event_id}/assistance",
                headers={"Authorization": f"Bearer {ctx['tokens']['staff']}"},
            )
            assert metrics_res.status_code == 200
            summary = metrics_res.json()["summary"]
            assert summary["completed"] >= 1

    # 9. Multitenant isolation: unauthorized user cannot view or modify another event's request
    async def test_criterion_9_multitenant_assistance_isolation(self, db_session):
        ctx = await self._setup_env(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['venue'].id}/events",
                json={
                    "title": "Private Nuptials",
                    "eventType": "WEDDING",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "timezone": "UTC",
                    "tableCount": 2,
                    "status": "ACTIVE",
                    "isOrderingOpen": True,
                },
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            event_id = create_res.json()["id"]

            assist_res = await client.post(
                f"/api/v1/public/events/{event_id}/assistance",
                json={"tableNumber": "01", "requestItems": [{"code": "WAITER", "label": "Waiter", "quantity": 1}]},
            )
            request_id = assist_res.json()["id"]

            # Other restaurant owner attempts to view assistance requests -> Forbidden or 404
            other_view = await client.get(
                f"/api/v1/restaurants/{ctx['venue'].id}/events/{event_id}/assistance",
                headers={"Authorization": f"Bearer {ctx['tokens']['other_owner']}"},
            )
            assert other_view.status_code == 403

            # Other restaurant owner attempts to modify request -> Forbidden
            other_patch = await client.patch(
                f"/api/v1/restaurants/{ctx['venue'].id}/events/{event_id}/assistance/{request_id}/status",
                json={"status": "COMPLETED"},
                headers={"Authorization": f"Bearer {ctx['tokens']['other_owner']}"},
            )
            assert other_patch.status_code == 403

    # 10. Duplicate submissions and invalid status transitions are handled safely
    async def test_criterion_10_idempotency_and_safe_transitions(self, db_session):
        ctx = await self._setup_env(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['venue'].id}/events",
                json={
                    "title": "Gala Dinner",
                    "eventType": "WEDDING",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "timezone": "UTC",
                    "tableCount": 2,
                    "status": "ACTIVE",
                    "isOrderingOpen": True,
                },
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            event_id = create_res.json()["id"]

            # Idempotent double submission
            payload = {
                "tableNumber": "01",
                "requestItems": [{"code": "WATER", "label": "Water", "quantity": 1}],
                "idempotencyKey": "double-tap-12345",
            }
            res1 = await client.post(f"/api/v1/public/events/{event_id}/assistance", json=payload)
            assert res1.status_code == 201
            req_id1 = res1.json()["id"]

            # Second tap with same key returns existing request without duplicating
            res2 = await client.post(f"/api/v1/public/events/{event_id}/assistance", json=payload)
            assert res2.status_code == 200
            assert res2.json()["id"] == req_id1

            # Invalid status transition check
            invalid_trans = await client.patch(
                f"/api/v1/restaurants/{ctx['venue'].id}/events/{event_id}/assistance/{req_id1}/status",
                json={"status": "UNKNOWN_STATUS"},
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert invalid_trans.status_code in (400, 422)

    # 11. Guest request status updates appear correctly via public endpoint
    async def test_criterion_11_guest_polling_status(self, db_session):
        ctx = await self._setup_env(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['venue'].id}/events",
                json={
                    "title": "Family Reunion",
                    "eventType": "OTHER",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "timezone": "UTC",
                    "tableCount": 2,
                    "status": "ACTIVE",
                    "isOrderingOpen": True,
                },
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            event_id = create_res.json()["id"]

            assist_res = await client.post(
                f"/api/v1/public/events/{event_id}/assistance",
                json={"tableNumber": "02", "requestItems": [{"code": "PLATES", "label": "Plates", "quantity": 2}]},
            )
            req_id = assist_res.json()["id"]

            # Guest polls status by request_id
            poll_res = await client.get(f"/api/v1/public/events/{event_id}/assistance/status/{req_id}")
            assert poll_res.status_code == 200
            assert poll_res.json()["status"] == "NEW"

            # Staff claims it
            await client.patch(
                f"/api/v1/restaurants/{ctx['venue'].id}/events/{event_id}/assistance/{req_id}/status",
                json={"status": "IN_PROGRESS", "assignedStaffName": "Captain Maria"},
                headers={"Authorization": f"Bearer {ctx['tokens']['staff']}"},
            )

            # Guest polls status again
            poll_after = await client.get(f"/api/v1/public/events/{event_id}/assistance/status/{req_id}")
            assert poll_after.status_code == 200
            assert poll_after.json()["status"] == "IN_PROGRESS"
            assert poll_after.json()["assignedStaffName"] == "Captain Maria"

            # Guest queries requests for Table 02
            tbl_res = await client.get(f"/api/v1/public/events/{event_id}/assistance?table=02")
            assert tbl_res.status_code == 200
            tbl_data = tbl_res.json()
            tbl_list = tbl_data if isinstance(tbl_data, list) else tbl_data.get("requests", [])
            assert len(tbl_list) >= 1

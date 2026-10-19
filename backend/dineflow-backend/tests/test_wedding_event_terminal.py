import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone
from jose import jwt

from app.main import app
from app.modules.restaurants.models import Restaurant, RestaurantMembership
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.weddings.models import WeddingEvent, EventTable
from app.modules.orders.models import Order
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
class TestWeddingEventTerminal:
    async def _setup_event_environment(self, db_session):
        rest_id = f"rest-evt-{uuid.uuid4().hex[:6]}"
        other_rest_id = f"rest-other-{uuid.uuid4().hex[:6]}"
        owner_uid = f"uid-evt-owner-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@eventvenue.com"

        # 1. Approved Event Catering Venue
        rest = Restaurant(
            id=rest_id,
            name="The Grand Palace Events & Catering",
            slug=f"grand-palace-{uuid.uuid4().hex[:4]}",
            public_slug=f"grand-palace-{uuid.uuid4().hex[:4]}",
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

        # 2. Other Tenant Restaurant (without weddings module)
        other_rest = Restaurant(
            id=other_rest_id,
            name="Bistro Parisien",
            slug=f"bistro-{uuid.uuid4().hex[:4]}",
            public_slug=f"bistro-{uuid.uuid4().hex[:4]}",
            owner_uid="other-tenant-uid",
            owner_email="bistro@example.com",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_tables=True,
            enabled_modules=["kitchen", "waiter", "tables"],
        )
        db_session.add_all([rest, other_rest])

        # Staff memberships
        owner_mem = RestaurantMembership(
            id=f"mem-own-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=owner_uid,
            user_email=owner_email,
            role="OWNER",
        )
        waiter_uid = f"uid-waiter-{uuid.uuid4().hex[:6]}"
        waiter_mem = RestaurantMembership(
            id=f"mem-wai-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=waiter_uid,
            user_email=f"waiter-{uuid.uuid4().hex[:4]}@venue.com",
            role="WAITER",
        )
        hookah_staff_uid = f"uid-hkstaff-{uuid.uuid4().hex[:6]}"
        hookah_mem = RestaurantMembership(
            id=f"mem-hk-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=hookah_staff_uid,
            user_email=f"shisha-{uuid.uuid4().hex[:4]}@venue.com",
            role="HOOKAH",
        )
        other_mem = RestaurantMembership(
            id=f"mem-oth-{uuid.uuid4().hex[:6]}",
            restaurant_id=other_rest_id,
            user_uid="other-tenant-uid",
            user_email="bistro@example.com",
            role="OWNER",
        )
        db_session.add_all([owner_mem, waiter_mem, hookah_mem, other_mem])

        # Menu categories and items across Kitchen, Bar, and Hookah
        cat_food = MenuCategory(
            id=f"cat-food-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            name="Banquet Entrees",
            sort_order=1,
            is_enabled=True,
        )
        cat_bar = MenuCategory(
            id=f"cat-bar-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            name="Celebration Cocktails",
            sort_order=2,
            is_enabled=True,
        )
        cat_hookah = MenuCategory(
            id=f"cat-hk-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            name="Royal Shisha Lounge",
            sort_order=3,
            is_enabled=True,
        )
        db_session.add_all([cat_food, cat_bar, cat_hookah])
        await db_session.flush()

        item_food = MenuItem(
            id=f"item-food-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat_food.id,
            name="Braised Wagyu Short Rib",
            price=45.0,
            target_destination="KITCHEN",
            is_available=True,
        )
        item_bar = MenuItem(
            id=f"item-bar-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat_bar.id,
            name="Golden French 75",
            price=18.0,
            target_destination="BAR",
            is_alcoholic=True,
            is_available=True,
        )
        item_hookah = MenuItem(
            id=f"item-hk-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat_hookah.id,
            name="Double Apple Ice Shisha",
            price=60.0,
            target_destination="HOOKAH",
            is_available=True,
        )
        db_session.add_all([item_food, item_bar, item_hookah])
        await db_session.commit()

        tokens = {
            "owner": create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest_id}),
            "waiter": create_jwt({"sub": waiter_uid, "email": "waiter@venue.com", "role": "WAITER", "restaurant_id": rest_id}),
            "hookah": create_jwt({"sub": hookah_staff_uid, "email": "hookah@venue.com", "role": "HOOKAH", "restaurant_id": rest_id}),
            "other_owner": create_jwt({"sub": "other-tenant-uid", "email": "bistro@example.com", "role": "OWNER", "restaurant_id": other_rest_id}),
        }

        return {
            "rest": rest,
            "other_rest": other_rest,
            "tokens": tokens,
            "items": {"food": item_food, "bar": item_bar, "hookah": item_hookah},
            "owner_uid": owner_uid,
            "waiter_uid": waiter_uid,
            "hookah_uid": hookah_staff_uid,
        }

    # 1. Event Ordering is enabled only for appropriate approved business
    async def test_criterion_1_event_ordering_authorization(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Other tenant without weddings module cannot access event operations
            res_denied = await client.get(
                f"/api/v1/restaurants/{ctx['other_rest'].id}/events",
                headers={"Authorization": f"Bearer {ctx['tokens']['other_owner']}"},
            )
            # 403 Forbidden because weddings module is not enabled for other_rest
            assert res_denied.status_code == 403

            # Approved restaurant with weddings module can access events
            res_allowed = await client.get(
                f"/api/v1/restaurants/{ctx['rest'].id}/events",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert res_allowed.status_code == 200

    # 2. Event Terminal loads the correct event, live order counts, and readiness check
    async def test_criterion_2_terminal_loads_event_counts_and_readiness(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create active event with 3 tables
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['rest'].id}/events",
                json={
                    "title": "Royal Heritage Wedding Gala",
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
            assert create_res.status_code == 201
            evt_data = create_res.json()
            event_id = evt_data["id"]

            # Check 8-point readiness check endpoint
            readiness_res = await client.get(
                f"/api/v1/restaurants/{ctx['rest'].id}/events/{event_id}/readiness",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert readiness_res.status_code == 200
            readiness = readiness_res.json()
            assert "checklist" in readiness
            assert readiness["isFullyReady"] is True
            assert len(readiness["checklist"]) == 8

            # Place 2 orders: one in PENDING, one updated to PREPARING
            order1_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": ctx["rest"].id,
                    "tableNumber": "01",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "Guest Table 1",
                    "items": [{
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
                        "price": ctx["items"]["food"].price,
                        "quantity": 1,
                    }],
                },
            )
            assert order1_res.status_code == 201
            order1 = order1_res.json()

            order2_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": ctx["rest"].id,
                    "tableNumber": "02",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "Guest Table 2",
                    "items": [{
                        "menuItemId": ctx["items"]["bar"].id,
                        "name": ctx["items"]["bar"].name,
                        "price": ctx["items"]["bar"].price,
                        "quantity": 2,
                    }],
                },
            )
            assert order2_res.status_code == 201
            order2 = order2_res.json()

            # Advance order2 to PREPARING
            await client.patch(
                f"/api/v1/orders/{order2['id']}/status",
                json={"status": "PREPARING"},
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )

            # Query terminal orders list using /api/v1/orders/restaurant/{id}?event_id={event_id}
            orders_res = await client.get(
                f"/api/v1/orders/restaurant/{ctx['rest'].id}?event_id={event_id}",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert orders_res.status_code == 200
            order_list = orders_res.json()
            assert len(order_list) >= 2

            statuses = [o["status"] for o in order_list if o.get("eventId") == event_id]
            assert "PENDING" in statuses
            assert "PREPARING" in statuses

    # 3. Table QR ordering identifies the correct table
    async def test_criterion_3_table_qr_ordering_table_identification(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['rest'].id}/events",
                json={
                    "title": "Silver Anniversary Banquet",
                    "eventType": "ANNIVERSARY",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "timezone": "UTC",
                    "tableCount": 4,
                    "status": "ACTIVE",
                    "isOrderingOpen": True,
                },
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            event_id = create_res.json()["id"]

            # Query tables
            tables_res = await client.get(
                f"/api/v1/restaurants/{ctx['rest'].id}/events/{event_id}/tables",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert tables_res.status_code == 200
            tables = tables_res.json()
            assert len(tables) >= 4
            target_table = tables[2]  # Table 03

            # Guest placing order with that table number
            guest_order_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": ctx["rest"].id,
                    "tableNumber": target_table["tableNumber"],
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "Lord & Lady Montague",
                    "items": [{
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
                        "price": ctx["items"]["food"].price,
                        "quantity": 2,
                    }],
                },
            )
            assert guest_order_res.status_code == 201
            order_data = guest_order_res.json()
            assert order_data["tableNumber"] == target_table["tableNumber"]
            assert order_data["eventId"] == event_id

    # 4 & 5. Food, drinks, and Hookah reach correct stations and preserve parent order & independent station statuses
    async def test_criteria_4_and_5_station_routing_and_mixed_parent_order(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['rest'].id}/events",
                json={
                    "title": "VIP Executive Summit",
                    "eventType": "CORPORATE",
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

            # Place mixed order: 1 Food (Kitchen), 1 Cocktail (Bar), 1 Shisha (Hookah)
            order_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": ctx["rest"].id,
                    "tableNumber": "01",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "VIP Table",
                    "notes": "Extra mint in shisha, medium rare short rib",
                    "items": [
                        {
                            "menuItemId": ctx["items"]["food"].id,
                            "name": ctx["items"]["food"].name,
                            "price": ctx["items"]["food"].price,
                            "quantity": 1,
                            "targetDestination": "KITCHEN",
                        },
                        {
                            "menuItemId": ctx["items"]["bar"].id,
                            "name": ctx["items"]["bar"].name,
                            "price": ctx["items"]["bar"].price,
                            "quantity": 1,
                            "targetDestination": "BAR",
                            "isAlcoholic": True,
                        },
                        {
                            "menuItemId": ctx["items"]["hookah"].id,
                            "name": ctx["items"]["hookah"].name,
                            "price": ctx["items"]["hookah"].price,
                            "quantity": 1,
                            "targetDestination": "HOOKAH",
                        },
                    ],
                },
            )
            assert order_res.status_code == 201
            order = order_res.json()
            order_id = order["id"]

            # Check Bar Station Queue
            bar_queue_res = await client.get(
                f"/api/v1/orders/restaurant/{ctx['rest'].id}?station=BAR",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert bar_queue_res.status_code == 200
            bar_order_ids = [o["id"] for o in bar_queue_res.json()]
            assert order_id in bar_order_ids

            # Check Hookah Station Queue
            hookah_queue_res = await client.get(
                f"/api/v1/orders/restaurant/{ctx['rest'].id}?station=HOOKAH",
                headers={"Authorization": f"Bearer {ctx['tokens']['hookah']}"},
            )
            assert hookah_queue_res.status_code == 200
            hookah_order_ids = [o["id"] for o in hookah_queue_res.json()]
            assert order_id in hookah_order_ids

            # Update Hookah to READY independently
            hk_patch = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"hookahStatus": "READY"},
                headers={"Authorization": f"Bearer {ctx['tokens']['hookah']}"},
            )
            assert hk_patch.status_code == 200
            hk_patched_order = hk_patch.json()
            assert hk_patched_order["hookahStatus"] == "READY"
            # Bar and Kitchen statuses remain independent
            assert hk_patched_order.get("barStatus") != "READY"
            assert hk_patched_order["status"] != "READY"

            # Update Bar to READY
            bar_patch = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"barStatus": "READY"},
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert bar_patch.status_code == 200

            # Update Kitchen to READY -> Entire parent order status reaches READY
            kitch_patch = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"status": "READY"},
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert kitch_patch.status_code == 200
            ready_order = kitch_patch.json()
            assert ready_order["status"] == "READY"
            assert ready_order["hookahStatus"] == "READY"
            assert ready_order["barStatus"] == "READY"

    # 6 & 7. Ready orders enter delivery queue and only authorized staff can claim and confirm delivery
    async def test_criteria_6_and_7_delivery_dispatch_and_authorization(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['rest'].id}/events",
                json={
                    "title": "Summer Gala Dinner",
                    "eventType": "DINNER",
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

            order_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": ctx["rest"].id,
                    "tableNumber": "02",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "Gala Guest",
                    "items": [{
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
                        "price": ctx["items"]["food"].price,
                        "quantity": 1,
                    }],
                },
            )
            order_id = order_res.json()["id"]

            # Advance to READY
            await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"status": "READY"},
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )

            # Hookah station staff attempting to claim delivery MUST be rejected (403 Forbidden)
            hk_claim = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"deliveryStatus": "OUT_FOR_DELIVERY", "claimedBy": "Hookah Guy"},
                headers={"Authorization": f"Bearer {ctx['tokens']['hookah']}"},
            )
            assert hk_claim.status_code == 403

            # Authorized Waiter claiming delivery succeeds
            waiter_claim = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"deliveryStatus": "OUT_FOR_DELIVERY", "claimedBy": "Jean-Luc (Runner 3)"},
                headers={"Authorization": f"Bearer {ctx['tokens']['waiter']}"},
            )
            assert waiter_claim.status_code == 200
            claimed_order = waiter_claim.json()
            assert claimed_order["deliveryStatus"] == "OUT_FOR_DELIVERY"
            assert claimed_order["claimedBy"] == "Jean-Luc (Runner 3)"

            # Authorized Waiter confirming delivery
            waiter_confirm = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"status": "SERVED", "deliveryStatus": "DELIVERED"},
                headers={"Authorization": f"Bearer {ctx['tokens']['waiter']}"},
            )
            assert waiter_confirm.status_code == 200
            delivered_order = waiter_confirm.json()
            assert delivered_order["deliveryStatus"] == "DELIVERED"
            assert delivered_order["status"] == "SERVED"
            assert delivered_order.get("deliveredAt") is not None

    # 8. Closing an event stops new orders without losing existing ones
    async def test_criterion_8_closing_event_stops_new_orders_safely(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['rest'].id}/events",
                json={
                    "title": "Evening Soiree",
                    "eventType": "COCKTAIL",
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

            # Place existing order
            existing_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": ctx["rest"].id,
                    "tableNumber": "01",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "Early Bird",
                    "items": [{
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
                        "price": ctx["items"]["food"].price,
                        "quantity": 1,
                    }],
                },
            )
            assert existing_res.status_code == 201
            existing_id = existing_res.json()["id"]

            # Pause / Close ordering
            close_res = await client.post(
                f"/api/v1/restaurants/{ctx['rest'].id}/events/{event_id}/toggle-ordering",
                json={"isOpen": False},
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert close_res.status_code == 200
            assert close_res.json()["isOrderingOpen"] is False

            # New order on Table 02 must now be rejected because event ordering is paused/closed
            new_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": ctx["rest"].id,
                    "tableNumber": "02",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "Late Comer",
                    "items": [{
                        "menuItemId": ctx["items"]["bar"].id,
                        "name": ctx["items"]["bar"].name,
                        "price": ctx["items"]["bar"].price,
                        "quantity": 3,
                    }],
                },
            )
            assert new_res.status_code == 400
            assert "closed" in new_res.text.lower() or "paused" in new_res.text.lower()

            # Existing order is completely safe and intact
            check_existing = await client.get(
                f"/api/v1/orders/{existing_id}",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert check_existing.status_code == 200
            assert check_existing.json()["id"] == existing_id

    # 9. Refresh/reconnect restores correct order and table states from DB
    async def test_criterion_9_persistence_after_refresh(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['rest'].id}/events",
                json={
                    "title": "Persistent State Gala",
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

            order_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": ctx["rest"].id,
                    "tableNumber": "02",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "Persistent Guest",
                    "items": [{
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
                        "price": ctx["items"]["food"].price,
                        "quantity": 1,
                    }],
                },
            )
            order_id = order_res.json()["id"]

            # Claim and deliver
            await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"deliveryStatus": "OUT_FOR_DELIVERY", "claimedBy": "Runner Alex"},
                headers={"Authorization": f"Bearer {ctx['tokens']['waiter']}"},
            )

            # Query afresh from DB simulating browser reload/reconnect
            fresh_query = await client.get(
                f"/api/v1/orders/{order_id}",
                headers={"Authorization": f"Bearer {ctx['tokens']['owner']}"},
            )
            assert fresh_query.status_code == 200
            order_fetched = fresh_query.json()
            assert order_fetched["deliveryStatus"] == "OUT_FOR_DELIVERY"
            assert order_fetched["claimedBy"] == "Runner Alex"

    # 10. Tenant and event isolation: Other tenants cannot access events or orders
    async def test_criterion_10_multitenant_isolation(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['rest'].id}/events",
                json={
                    "title": "Private Venue Event",
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

            # Other tenant owner attempts to fetch this event
            leak_attempt = await client.get(
                f"/api/v1/restaurants/{ctx['rest'].id}/events/{event_id}",
                headers={"Authorization": f"Bearer {ctx['tokens']['other_owner']}"},
            )
            assert leak_attempt.status_code in [403, 404]

            # Other tenant attempts to fetch readiness
            readiness_leak = await client.get(
                f"/api/v1/restaurants/{ctx['rest'].id}/events/{event_id}/readiness",
                headers={"Authorization": f"Bearer {ctx['tokens']['other_owner']}"},
            )
            assert readiness_leak.status_code in [403, 404]

    # 11. Normal restaurant, Bar, Hookah, and Kitchen behavior remains intact
    async def test_criterion_11_normal_restaurant_operations_intact(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Regular Dine-In Order (no eventId)
            dinein_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": ctx["rest"].id,
                    "tableNumber": "T-10",
                    "orderType": "DINE_IN",
                    "customerName": "Regular Table Guest",
                    "items": [{
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
                        "price": ctx["items"]["food"].price,
                        "quantity": 1,
                    }],
                },
            )
            assert dinein_res.status_code == 201
            dinein_order = dinein_res.json()
            assert dinein_order["orderType"] == "DINE_IN"
            assert dinein_order.get("eventId") is None

    # 12. No ETA and no guest payment requirement in Event Ordering
    async def test_criterion_12_no_eta_no_guest_payment_in_event_ordering(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_res = await client.post(
                f"/api/v1/restaurants/{ctx['rest'].id}/events",
                json={
                    "title": "Zero ETA Zero Payment Wedding",
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

            # Order placed with 0 payment details, immediately accepted as paid/complimentary
            order_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": ctx["rest"].id,
                    "tableNumber": "01",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "Guest Free Ordering",
                    "items": [{
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
                        "price": ctx["items"]["food"].price,
                        "quantity": 1,
                    }],
                },
            )
            assert order_res.status_code == 201
            order = order_res.json()
            # No ETA is forced on event ordering
            assert order["orderType"] in ["EVENT_ORDER", "WEDDING_EVENT"]
            assert order.get("estimatedPrepTimeMinutes") is None
            assert order.get("estimated_prep_time_minutes") is None
            assert order.get("etaTargetTimestamp") is None
            assert order.get("estimatedPrepTime") is None or order.get("estimatedTime") is None
            # Payment status is not blocking order creation
            assert order["status"] == "PENDING"

import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone, timedelta
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
class TestWeddingProductSeparation:
    """
    Comprehensive regression suite for DineFlow v3 First-Class Wedding & Events Product Separation:
    1. Product Access & Role Authorization (Dual-product owner, single-product restaurant, staff access restrictions).
    2. Multi-Event Isolation within the same venue (Event A vs Event B).
    3. Restaurant Dining vs Wedding Event Order Queue Isolation (exclude_events=true vs event_id={id}).
    4. Guest Financial Privacy Enforcement (Menu & order prices redacted for guests, visible to authorized staff).
    5. Station-Scoped Event Routing (Kitchen, Bar, Hookah).
    """

    async def _setup_test_environment(self, db_session):
        now_utc = datetime.now(timezone.utc)
        today_str = now_utc.strftime("%Y-%m-%d")

        # 1. Dual-Product Venue (Has both Restaurant Dining and Wedding & Events modules enabled)
        dual_rest_id = f"rest-dual-{uuid.uuid4().hex[:6]}"
        dual_owner_uid = f"uid-dual-owner-{uuid.uuid4().hex[:6]}"
        dual_owner_email = f"owner-{uuid.uuid4().hex[:6]}@palace-events.com"

        dual_rest = Restaurant(
            id=dual_rest_id,
            name="The Grand Palace Resort & Events",
            slug=f"grand-palace-{uuid.uuid4().hex[:4]}",
            public_slug=f"grand-palace-{uuid.uuid4().hex[:4]}",
            owner_uid=dual_owner_uid,
            owner_email=dual_owner_email,
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

        # 2. Restaurant-Only Venue (Weddings module disabled)
        rest_only_id = f"rest-only-{uuid.uuid4().hex[:6]}"
        rest_owner_uid = f"uid-rest-owner-{uuid.uuid4().hex[:6]}"
        rest_owner_email = f"owner-{uuid.uuid4().hex[:6]}@bistro-only.com"

        rest_only = Restaurant(
            id=rest_only_id,
            name="Classic French Bistro",
            slug=f"bistro-{uuid.uuid4().hex[:4]}",
            public_slug=f"bistro-{uuid.uuid4().hex[:4]}",
            owner_uid=rest_owner_uid,
            owner_email=rest_owner_email,
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_tables=True,
            has_waiter=True,
            enabled_modules=["kitchen", "waiter", "tables", "billing"],
        )

        db_session.add_all([dual_rest, rest_only])

        # Staff Memberships
        dual_owner_mem = RestaurantMembership(
            id=f"mem-dual-own-{uuid.uuid4().hex[:6]}",
            restaurant_id=dual_rest_id,
            user_uid=dual_owner_uid,
            user_email=dual_owner_email,
            role="OWNER",
        )
        event_mgr_uid = f"uid-emgr-{uuid.uuid4().hex[:6]}"
        event_mgr_mem = RestaurantMembership(
            id=f"mem-emgr-{uuid.uuid4().hex[:6]}",
            restaurant_id=dual_rest_id,
            user_uid=event_mgr_uid,
            user_email=f"coordinator-{uuid.uuid4().hex[:4]}@palace-events.com",
            role="EVENT_MANAGER",
        )
        waiter_uid = f"uid-waiter-{uuid.uuid4().hex[:6]}"
        waiter_mem = RestaurantMembership(
            id=f"mem-waiter-{uuid.uuid4().hex[:6]}",
            restaurant_id=dual_rest_id,
            user_uid=waiter_uid,
            user_email=f"waiter-{uuid.uuid4().hex[:4]}@palace-events.com",
            role="WAITER",
        )
        rest_owner_mem = RestaurantMembership(
            id=f"mem-rest-own-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_only_id,
            user_uid=rest_owner_uid,
            user_email=rest_owner_email,
            role="OWNER",
        )

        db_session.add_all([dual_owner_mem, event_mgr_mem, waiter_mem, rest_owner_mem])

        # Menu Items for Dual Venue
        cat_food = MenuCategory(id=f"cat-f-{uuid.uuid4().hex[:6]}", restaurant_id=dual_rest_id, name="Banquet Dining", sort_order=1, is_enabled=True)
        cat_bar = MenuCategory(id=f"cat-b-{uuid.uuid4().hex[:6]}", restaurant_id=dual_rest_id, name="Royal Bar", sort_order=2, is_enabled=True)
        cat_hookah = MenuCategory(id=f"cat-h-{uuid.uuid4().hex[:6]}", restaurant_id=dual_rest_id, name="Shisha Terrace", sort_order=3, is_enabled=True)
        db_session.add_all([cat_food, cat_bar, cat_hookah])
        await db_session.flush()

        item_food = MenuItem(
            id=f"item-food-{uuid.uuid4().hex[:6]}",
            restaurant_id=dual_rest_id,
            category_id=cat_food.id,
            name="Filet Mignon au Poivre",
            price=65.0,
            target_destination="KITCHEN",
            is_available=True,
        )
        item_bar = MenuItem(
            id=f"item-bar-{uuid.uuid4().hex[:6]}",
            restaurant_id=dual_rest_id,
            category_id=cat_bar.id,
            name="Vintage Champagne Brut",
            price=95.0,
            target_destination="BAR",
            is_alcoholic=True,
            is_available=True,
        )
        item_hookah = MenuItem(
            id=f"item-hk-{uuid.uuid4().hex[:6]}",
            restaurant_id=dual_rest_id,
            category_id=cat_hookah.id,
            name="Citrus Mint Shisha",
            price=45.0,
            target_destination="HOOKAH",
            is_available=True,
        )
        db_session.add_all([item_food, item_bar, item_hookah])

        # Create Two Distinct Events in Dual Venue
        event_a = WeddingEvent(
            id=f"evt-alpha-{uuid.uuid4().hex[:6]}",
            restaurant_id=dual_rest_id,
            title="Sophia & Alexander Wedding Gala",
            event_type="WEDDING",
            event_date=today_str,
            start_time="00:00",
            end_time="23:59",
            start_datetime_utc=now_utc - timedelta(hours=2),
            end_datetime_utc=now_utc + timedelta(hours=10),
            status="ACTIVE",
            is_ordering_open=True,
            has_food=True,
            has_bar=True,
            has_hookah=True,
            has_table_assistance=True,
        )
        event_b = WeddingEvent(
            id=f"evt-beta-{uuid.uuid4().hex[:6]}",
            restaurant_id=dual_rest_id,
            title="TechCorp Annual Leadership Summit",
            event_type="CORPORATE",
            event_date=today_str,
            start_time="00:00",
            end_time="23:59",
            start_datetime_utc=now_utc - timedelta(hours=1),
            end_datetime_utc=now_utc + timedelta(hours=8),
            status="ACTIVE",
            is_ordering_open=True,
            has_food=True,
            has_bar=True,
            has_hookah=False,
            has_table_assistance=True,
        )
        db_session.add_all([event_a, event_b])
        await db_session.flush()

        tbl_a = EventTable(
            id=f"tbl-a-{uuid.uuid4().hex[:6]}",
            event_id=event_a.id,
            restaurant_id=dual_rest_id,
            table_number="A-01",
            table_label="Head Table A-01",
            capacity=10,
            is_active=True,
        )
        tbl_b = EventTable(
            id=f"tbl-b-{uuid.uuid4().hex[:6]}",
            event_id=event_b.id,
            restaurant_id=dual_rest_id,
            table_number="B-01",
            table_label="Executive Table B-01",
            capacity=8,
            is_active=True,
        )
        db_session.add_all([tbl_a, tbl_b])
        await db_session.commit()

        tokens = {
            "dual_owner": create_jwt({"sub": dual_owner_uid, "email": dual_owner_email, "role": "OWNER", "restaurant_id": dual_rest_id}),
            "event_manager": create_jwt({"sub": event_mgr_uid, "email": event_mgr_mem.user_email, "role": "EVENT_MANAGER", "restaurant_id": dual_rest_id}),
            "waiter": create_jwt({"sub": waiter_uid, "email": waiter_mem.user_email, "role": "WAITER", "restaurant_id": dual_rest_id}),
            "rest_owner": create_jwt({"sub": rest_owner_uid, "email": rest_owner_email, "role": "OWNER", "restaurant_id": rest_only_id}),
        }

        return {
            "dual_rest": dual_rest,
            "rest_only": rest_only,
            "event_a": event_a,
            "event_b": event_b,
            "tbl_a": tbl_a,
            "tbl_b": tbl_b,
            "items": {"food": item_food, "bar": item_bar, "hookah": item_hookah},
            "tokens": tokens,
        }

    # 1. Product Access & Authorization Separation
    async def test_product_access_and_authorization_separation(self, db_session):
        ctx = await self._setup_test_environment(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1a. Restaurant-only owner cannot access Wedding & Events operations
            res_denied = await client.get(
                f"/api/v1/restaurants/{ctx['rest_only'].id}/events",
                headers={"Authorization": f"Bearer {ctx['tokens']['rest_owner']}"},
            )
            assert res_denied.status_code == 403
            assert "not enabled" in res_denied.json()["detail"].lower()

            # 1b. Dual-product owner can access both Restaurant and Event operations
            res_dual_evt = await client.get(
                f"/api/v1/restaurants/{ctx['dual_rest'].id}/events",
                headers={"Authorization": f"Bearer {ctx['tokens']['dual_owner']}"},
            )
            assert res_dual_evt.status_code == 200
            assert len(res_dual_evt.json()) == 2

            # 1c. Line staff (Waiter) cannot create or modify events (strictly restricted to Event Manager/Owner)
            res_waiter_create = await client.post(
                f"/api/v1/restaurants/{ctx['dual_rest'].id}/events",
                headers={"Authorization": f"Bearer {ctx['tokens']['waiter']}"},
                json={"title": "Unauthorized Gala", "eventDate": "2026-11-01"},
            )
            assert res_waiter_create.status_code == 403

            # 1d. Event Manager CAN create events
            res_emgr_create = await client.post(
                f"/api/v1/restaurants/{ctx['dual_rest'].id}/events",
                headers={"Authorization": f"Bearer {ctx['tokens']['event_manager']}"},
                json={"title": "Authorized Charity Gala", "eventDate": "2026-11-15", "eventType": "GALA"},
            )
            assert res_emgr_create.status_code in (200, 201)
            created_evt = res_emgr_create.json()
            assert created_evt["title"] == "Authorized Charity Gala"

    # 2. Multi-Event Data Isolation within the Same Organization
    async def test_multi_event_data_isolation(self, db_session):
        ctx = await self._setup_test_environment(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Place order for Event A
            order_payload_a = {
                "restaurantId": ctx["dual_rest"].id,
                "eventId": ctx["event_a"].id,
                "tableNumber": ctx["tbl_a"].table_number,
                "customerName": "Guest Table A-01",
                "orderType": "WEDDING_EVENT",
                "items": [
                    {
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
                        "price": 0.0,
                        "quantity": 2,
                        "targetDestination": "KITCHEN",
                    }
                ],
            }
            res_ord_a = await client.post("/api/v1/orders", json=order_payload_a)
            assert res_ord_a.status_code in (200, 201)
            ord_a_id = res_ord_a.json()["id"]

            # Place order for Event B
            order_payload_b = {
                "restaurantId": ctx["dual_rest"].id,
                "eventId": ctx["event_b"].id,
                "tableNumber": ctx["tbl_b"].table_number,
                "customerName": "Guest Table B-01",
                "orderType": "EVENT_ORDER",
                "items": [
                    {
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
                        "price": 0.0,
                        "quantity": 4,
                        "targetDestination": "KITCHEN",
                    }
                ],
            }
            res_ord_b = await client.post("/api/v1/orders", json=order_payload_b)
            assert res_ord_b.status_code in (200, 201)
            ord_b_id = res_ord_b.json()["id"]

            # Query orders strictly scoped to Event A
            res_q_a = await client.get(
                f"/api/v1/orders/restaurant/{ctx['dual_rest'].id}?event_id={ctx['event_a'].id}",
                headers={"Authorization": f"Bearer {ctx['tokens']['event_manager']}"},
            )
            assert res_q_a.status_code == 200
            orders_a = res_q_a.json()
            order_ids_a = [o["id"] for o in orders_a]
            assert ord_a_id in order_ids_a
            assert ord_b_id not in order_ids_a

            # Query orders strictly scoped to Event B
            res_q_b = await client.get(
                f"/api/v1/orders/restaurant/{ctx['dual_rest'].id}?event_id={ctx['event_b'].id}",
                headers={"Authorization": f"Bearer {ctx['tokens']['event_manager']}"},
            )
            assert res_q_b.status_code == 200
            orders_b = res_q_b.json()
            order_ids_b = [o["id"] for o in orders_b]
            assert ord_b_id in order_ids_b
            assert ord_a_id not in order_ids_b

    # 3. Restaurant Dining vs Wedding Order Queue Separation
    async def test_restaurant_vs_event_order_isolation(self, db_session):
        ctx = await self._setup_test_environment(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 3a. Create standard restaurant dining order (no eventId)
            dine_in_payload = {
                "restaurantId": ctx["dual_rest"].id,
                "tableNumber": "T-12",
                "customerName": "Dining Walk-in",
                "orderType": "DINE_IN",
                "items": [
                    {
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
                        "price": 65.0,
                        "quantity": 1,
                        "targetDestination": "KITCHEN",
                    }
                ],
            }
            res_dine = await client.post("/api/v1/orders", json=dine_in_payload)
            assert res_dine.status_code in (200, 201)
            dine_order_id = res_dine.json()["id"]

            # 3b. Create event banquet order
            event_payload = {
                "restaurantId": ctx["dual_rest"].id,
                "eventId": ctx["event_a"].id,
                "tableNumber": ctx["tbl_a"].table_number,
                "customerName": "Wedding Guest",
                "orderType": "WEDDING_EVENT",
                "items": [
                    {
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
                        "price": 0.0,
                        "quantity": 1,
                        "targetDestination": "KITCHEN",
                    }
                ],
            }
            res_evt = await client.post("/api/v1/orders", json=event_payload)
            assert res_evt.status_code in (200, 201)
            evt_order_id = res_evt.json()["id"]

            # 3c. Regular Restaurant Kitchen queue with exclude_events=true MUST NOT contain the banquet order
            res_rest_queue = await client.get(
                f"/api/v1/orders/restaurant/{ctx['dual_rest'].id}?exclude_events=true",
                headers={"Authorization": f"Bearer {ctx['tokens']['waiter']}"},
            )
            assert res_rest_queue.status_code == 200
            rest_order_ids = [o["id"] for o in res_rest_queue.json()]
            assert dine_order_id in rest_order_ids
            assert evt_order_id not in rest_order_ids

            # 3d. Event terminal queue with event_id MUST NOT contain the regular restaurant dining order
            res_evt_queue = await client.get(
                f"/api/v1/orders/restaurant/{ctx['dual_rest'].id}?event_id={ctx['event_a'].id}",
                headers={"Authorization": f"Bearer {ctx['tokens']['event_manager']}"},
            )
            assert res_evt_queue.status_code == 200
            evt_order_ids = [o["id"] for o in res_evt_queue.json()]
            assert evt_order_id in evt_order_ids
            assert dine_order_id not in evt_order_ids

    # 4. Guest Financial Privacy Enforcement
    async def test_guest_financial_privacy(self, db_session):
        ctx = await self._setup_test_environment(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 4a. Public guest menu has all prices set to null (redacted)
            res_menu = await client.get(
                f"/api/v1/public/events/{ctx['event_a'].id}?table={ctx['tbl_a'].table_number}"
            )
            assert res_menu.status_code == 200
            menu_data = res_menu.json()
            assert "menu" in menu_data
            for cat in menu_data["menu"]:
                for it in cat.get("items", []):
                    assert it["price"] is None, f"Price leaked in guest menu item: {it['name']}"

            # 4b. Guest order submission returns redacted financials
            order_payload = {
                "restaurantId": ctx["dual_rest"].id,
                "eventId": ctx["event_a"].id,
                "tableNumber": ctx["tbl_a"].table_number,
                "customerName": "Guest Alice",
                "orderType": "WEDDING_EVENT",
                "items": [
                    {
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
                        "price": 0.0,
                        "quantity": 1,
                        "targetDestination": "KITCHEN",
                    }
                ],
            }
            # Guest calling without staff auth token
            res_guest_ord = await client.post("/api/v1/orders", json=order_payload)
            assert res_guest_ord.status_code in (200, 201)
            ord_resp = res_guest_ord.json()
            assert ord_resp["subtotal"] is None
            assert ord_resp["taxAmount"] is None
            assert ord_resp["totalAmount"] is None
            for it in ord_resp.get("items", []):
                assert it.get("price") is None

            # 4c. Customer order query (/orders/customer) also hides financials for event orders
            res_cust = await client.get(
                f"/api/v1/orders/customer?restaurant_id={ctx['dual_rest'].id}&table_id={ctx['tbl_a'].table_number}"
            )
            assert res_cust.status_code == 200
            cust_orders = res_cust.json()
            for o in cust_orders:
                if o.get("eventId"):
                    assert o.get("totalAmount") is None
                    assert o.get("subtotal") is None

    # 5. Station-Scoped Routing within Event Operations
    async def test_event_station_order_routing(self, db_session):
        ctx = await self._setup_test_environment(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Place order containing Food, Drink, and Hookah
            multi_item_payload = {
                "restaurantId": ctx["dual_rest"].id,
                "eventId": ctx["event_a"].id,
                "tableNumber": ctx["tbl_a"].table_number,
                "customerName": "Gourmet Guest",
                "orderType": "WEDDING_EVENT",
                "legalDrinkingAgeAffirmed": True,
                "items": [
                    {
                        "menuItemId": ctx["items"]["food"].id,
                        "name": ctx["items"]["food"].name,
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
            }
            res_order = await client.post("/api/v1/orders", json=multi_item_payload)
            assert res_order.status_code in (200, 201)
            order_id = res_order.json()["id"]

            # Verify Kitchen station queue shows this order and filters to kitchen items
            res_kitchen = await client.get(
                f"/api/v1/orders/restaurant/{ctx['dual_rest'].id}?station=KITCHEN&event_id={ctx['event_a'].id}",
                headers={"Authorization": f"Bearer {ctx['tokens']['dual_owner']}"},
            )
            assert res_kitchen.status_code == 200
            k_orders = res_kitchen.json()
            matching_k = next((o for o in k_orders if o["id"] == order_id), None)
            assert matching_k is not None
            k_item_names = [it["name"] for it in matching_k["items"]]
            assert ctx["items"]["food"].name in k_item_names
            assert ctx["items"]["bar"].name not in k_item_names
            assert ctx["items"]["hookah"].name not in k_item_names

            # Verify Bar station queue shows only bar items
            res_bar = await client.get(
                f"/api/v1/orders/restaurant/{ctx['dual_rest'].id}?station=BAR&event_id={ctx['event_a'].id}",
                headers={"Authorization": f"Bearer {ctx['tokens']['dual_owner']}"},
            )
            assert res_bar.status_code == 200
            b_orders = res_bar.json()
            matching_b = next((o for o in b_orders if o["id"] == order_id), None)
            assert matching_b is not None
            b_item_names = [it["name"] for it in matching_b["items"]]
            assert ctx["items"]["bar"].name in b_item_names
            assert ctx["items"]["food"].name not in b_item_names
            assert ctx["items"]["hookah"].name not in b_item_names

            # Verify Hookah station queue shows only hookah items
            res_hookah = await client.get(
                f"/api/v1/orders/restaurant/{ctx['dual_rest'].id}?station=HOOKAH&event_id={ctx['event_a'].id}",
                headers={"Authorization": f"Bearer {ctx['tokens']['dual_owner']}"},
            )
            assert res_hookah.status_code == 200
            h_orders = res_hookah.json()
            matching_h = next((o for o in h_orders if o["id"] == order_id), None)
            assert matching_h is not None
            h_item_names = [it["name"] for it in matching_h["items"]]
            assert ctx["items"]["hookah"].name in h_item_names
            assert ctx["items"]["food"].name not in h_item_names
            assert ctx["items"]["bar"].name not in h_item_names

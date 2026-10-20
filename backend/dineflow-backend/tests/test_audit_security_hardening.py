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
class TestAuditSecurityHardening:

    async def _setup_fixtures(self, db: AsyncSession):
        rest_id = f"rest-audit-{uuid.uuid4().hex[:6]}"
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@audit.com"
        rest = Restaurant(
            id=rest_id,
            name="Audit Security Hardening Bistro",
            slug=f"audit-{uuid.uuid4().hex[:6]}",
            public_slug=f"audit-{uuid.uuid4().hex[:6]}",
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

        cat = MenuCategory(
            id=f"cat-{rest_id}-1",
            restaurant_id=rest_id,
            name="Main Courses",
            sort_order=1,
            is_enabled=True,
        )
        db.add(cat)

        item_valid = MenuItem(
            id=f"item-{rest_id}-valid",
            restaurant_id=rest_id,
            category_id=cat.id,
            name="Authentic Biryani",
            price=350.0,
            is_available=True,
            target_destination="KITCHEN",
        )
        # Seeded item with 0.0 price to simulate historical/banquet record in menu catalog
        item_zero = MenuItem(
            id=f"item-{rest_id}-zero",
            restaurant_id=rest_id,
            category_id=cat.id,
            name="Banquet Zero Cocktail",
            price=0.0,
            is_available=True,
            target_destination="BAR",
        )
        db.add(item_valid)
        db.add(item_zero)

        table = Table(
            id=f"tbl-{rest_id}-01",
            restaurant_id=rest_id,
            table_number="Table 01",
            capacity=4,
            status="OCCUPIED",
            is_occupied=True,
        )
        db.add(table)
        await db.flush()

        session = TableSession(
            id=f"sess-{uuid.uuid4().hex[:8]}",
            restaurant_id=rest_id,
            table_id=table.id,
            table_number="Table 01",
            status="ACTIVE",
        )
        db.add(session)
        table.active_session_id = session.id
        await db.commit()

        owner_token = create_jwt({
            "sub": owner_uid,
            "email": owner_email,
            "role": "OWNER",
            "restaurant_id": rest_id,
            "scope": "OWNER",
        })

        waiter_token = create_jwt({
            "sub": f"staff_waiter_{uuid.uuid4().hex[:6]}",
            "email": "waiter@test.com",
            "role": "WAITER",
            "restaurant_id": rest_id,
            "scope": "STAFF",
        })

        return {
            "rest": rest,
            "cat": cat,
            "item_valid": item_valid,
            "item_zero": item_zero,
            "table": table,
            "session": session,
            "owner_token": owner_token,
            "waiter_token": waiter_token,
        }

    async def test_priority_1_prevent_zero_pricing_creation_and_standard_dining_abuse(self, db_session: AsyncSession):
        data = await self._setup_fixtures(db_session)
        rest = data["rest"]
        owner_token = data["owner_token"]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            headers = {"Authorization": f"Bearer {owner_token}"}

            # 1. Attempting to create a menu item with price 0.0 or negative must fail (400 or 422 Unprocessable)
            create_zero = await ac.post(
                f"/api/v1/restaurants/{rest.id}/menu",
                json={
                    "name": "Unintended Free Dish",
                    "price": 0.0,
                    "categoryId": data["cat"].id,
                },
                headers=headers
            )
            assert create_zero.status_code in [400, 422]

            # 2. Standard dining room customer attempting to order the pre-existing 0.0 price item must fail (400 Bad Request)
            order_zero = await ac.post(
                "/api/v1/orders",
                json={
                    "restaurantId": rest.id,
                    "tableNumber": "Table 01",
                    "tableSessionId": data["session"].id,
                    "orderType": "DINE_IN",
                    "items": [
                        {
                            "menuItemId": data["item_zero"].id,
                            "name": data["item_zero"].name,
                            "price": 0.0,
                            "quantity": 1,
                        }
                    ]
                }
            )
            assert order_zero.status_code == 400
            assert "invalid zero pricing" in order_zero.json()["detail"].lower() or "requires a valid price" in order_zero.json()["detail"].lower()

            # 3. Standard dining room order with legitimate positive pricing succeeds
            order_valid = await ac.post(
                "/api/v1/orders",
                json={
                    "restaurantId": rest.id,
                    "tableNumber": "Table 01",
                    "tableSessionId": data["session"].id,
                    "orderType": "DINE_IN",
                    "items": [
                        {
                            "menuItemId": data["item_valid"].id,
                            "name": data["item_valid"].name,
                            "price": 350.0,
                            "quantity": 1,
                        }
                    ]
                }
            )
            assert order_valid.status_code == 201
            assert order_valid.json()["subtotal"] == 350.0
            assert order_valid.json()["totalAmount"] == 367.5

    async def test_priority_2_and_4_public_assistance_sanitization_and_rapid_tap_throttling(self, db_session: AsyncSession):
        data = await self._setup_fixtures(db_session)
        rest = data["rest"]

        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        event = WeddingEvent(
            id=f"evt-{uuid.uuid4().hex[:8]}",
            restaurant_id=rest.id,
            title="Royal Gala Evening",
            event_type="WEDDING",
            event_date=today_str,
            start_time="00:00",
            end_time="23:59",
            timezone="UTC",
            status="ACTIVE",
            has_table_assistance=True,
            is_ordering_open=True,
        )
        db_session.add(event)
        event_table = EventTable(
            id=f"etbl-{uuid.uuid4().hex[:8]}",
            restaurant_id=rest.id,
            event_id=event.id,
            table_number="VIP 01",
            is_active=True,
        )
        db_session.add(event_table)
        await db_session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Guest creates assistance request from table
            req_post = await ac.post(
                f"/api/v1/restaurants/public/events/{event.id}/assistance",
                json={
                    "tableNumber": "VIP 01",
                    "requestItems": [{"item": "Water Refill", "quantity": 1}],
                    "note": "Still water please",
                }
            )
            assert req_post.status_code == 201
            created_req = req_post.json()
            # Verify internal assignedStaffUid is NOT exposed in public response
            assert "assignedStaffUid" not in created_req

            # 2. Duplicate rapid-tap within 60s at the same table for same request returns existing request (throttled)
            req_dup = await ac.post(
                f"/api/v1/restaurants/public/events/{event.id}/assistance",
                json={
                    "tableNumber": "VIP 01",
                    "requestItems": [{"item": "Water Refill", "quantity": 1}],
                    "note": "Still water please",
                }
            )
            assert req_dup.status_code == 200
            assert req_dup.json()["id"] == created_req["id"]

            # 3. Public status check endpoint also omits assignedStaffUid
            req_status = await ac.get(
                f"/api/v1/restaurants/public/events/{event.id}/assistance/status/{created_req['id']}"
            )
            assert req_status.status_code == 200
            assert "assignedStaffUid" not in req_status.json()

    async def test_priority_3_multi_station_readiness_requires_all_applicable_stations(self, db_session: AsyncSession):
        data = await self._setup_fixtures(db_session)
        rest = data["rest"]
        owner_token = data["owner_token"]
        headers = {"Authorization": f"Bearer {owner_token}"}

        # Order with 1 Kitchen item and 1 Bar item
        order = Order(
            id=f"ord-mixed-{uuid.uuid4().hex[:8]}",
            restaurant_id=rest.id,
            table_id=data["table"].id,
            table_number="Table 01",
            table_session_id=data["session"].id,
            status="PREPARING",
            kitchen_status="PREPARING",
            bar_status="PREPARING",
            total_amount=500.0,
            items_json=[
                {"id": "item-food", "name": "Pasta", "quantity": 1, "station": "KITCHEN"},
                {"id": "item-bar", "name": "Mojito", "quantity": 1, "station": "BAR"},
            ],
        )
        db_session.add(order)
        await db_session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Step 1: Kitchen marks READY while Bar is still PREPARING -> Parent status must NOT be READY!
            kitchen_upd = await ac.put(
                f"/api/v1/orders/{order.id}/status",
                json={"kitchenStatus": "READY"},
                headers=headers,
            )
            assert kitchen_upd.status_code == 200
            k_data = kitchen_upd.json()
            assert k_data["kitchenStatus"] == "READY"
            assert k_data["barStatus"] == "PREPARING"
            assert k_data["status"] == "PREPARING"  # Must remain PREPARING!

            # Step 2: Bar marks READY -> Now ALL applicable stations are READY -> Parent status reaches READY!
            bar_upd = await ac.put(
                f"/api/v1/orders/{order.id}/status",
                json={"barStatus": "READY"},
                headers=headers,
            )
            assert bar_upd.status_code == 200
            b_data = bar_upd.json()
            assert b_data["kitchenStatus"] == "READY"
            assert b_data["barStatus"] == "READY"
            assert b_data["status"] == "READY"  # Parent order is now READY!

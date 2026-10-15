import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from jose import jwt

from app.main import app
from app.modules.restaurants.models import Restaurant
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
class TestWeddingsAndEventsModule:
    async def _setup_restaurant(self, db_session: AsyncSession, name: str):
        owner_uid = f"uid-wed-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@test.com"
        rest_id = f"rest-wed-{uuid.uuid4().hex[:6]}"
        slug = f"wed-slug-{uuid.uuid4().hex[:6]}"

        rest = Restaurant(
            id=rest_id,
            name=name,
            slug=slug,
            public_slug=slug,
            has_tables=True,
            has_kitchen=True,
            has_waiter=True,
            enabled_modules=["kitchen", "waiter", "billing", "tables", "weddings"],
            owner_uid=owner_uid,
            owner_email=owner_email,
            is_approved=True,
            lifecycle_status="LIVE",
            status="OPEN",
        )
        db_session.add(rest)
        await db_session.commit()
        return rest, owner_uid, owner_email

    async def _setup_menu(self, db_session: AsyncSession, restaurant_id: str):
        cat = MenuCategory(
            id=f"cat-{uuid.uuid4().hex[:6]}",
            restaurant_id=restaurant_id,
            name="Wedding Specials",
            sort_order=1
        )
        db_session.add(cat)
        await db_session.flush()

        item1 = MenuItem(
            id=f"item-{uuid.uuid4().hex[:6]}",
            restaurant_id=restaurant_id,
            category_id=cat.id,
            name="Champagne Risotto",
            price=28.50,
            is_available=True,
            is_vegetarian=True
        )
        item2 = MenuItem(
            id=f"item-{uuid.uuid4().hex[:6]}",
            restaurant_id=restaurant_id,
            category_id=cat.id,
            name="Truffle Filet Mignon",
            price=48.00,
            is_available=True,
            is_vegetarian=False
        )
        db_session.add(item1)
        db_session.add(item2)
        await db_session.commit()
        return cat, [item1, item2]

    async def test_wedding_crud_lifecycle_and_table_autoprovisioning(self, db_session: AsyncSession):
        rest, owner_uid, owner_email = await self._setup_restaurant(db_session, "Château Grandeur")
        cat, items = await self._setup_menu(db_session, rest.id)
        token = create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Create Wedding Event with 5 tables auto-provisioned
            payload = {
                "title": "Aria & Julian's Black Tie Gala",
                "coupleNames": "Aria Montgomery & Julian Vance",
                "eventType": "WEDDING",
                "eventDate": "2026-11-20",
                "startTime": "18:00",
                "endTime": "23:30",
                "venueName": "The Rose Conservatory",
                "welcomeMessage": "Welcome to our celebration of love and companionship.",
                "themeColor": "champagne",
                "status": "ACTIVE",
                "isOrderingOpen": True,
                "menuSelectionType": "FULL_MENU",
                "estimatedGuestCount": 80,
                "tableCount": 5,
                "notes": "Champagne toast at 19:30"
            }
            create_res = await client.post(f"/api/v1/restaurants/{rest.id}/events", json=payload, headers=headers)
            assert create_res.status_code == 201, create_res.text
            ev_data = create_res.json()
            assert ev_data["title"] == payload["title"]
            assert ev_data["coupleNames"] == payload["coupleNames"]
            assert ev_data["tableCount"] == 5
            event_id = ev_data["id"]

            # 2. Get Event Detail with tables
            get_res = await client.get(f"/api/v1/restaurants/{rest.id}/events/{event_id}", headers=headers)
            assert get_res.status_code == 200
            detail = get_res.json()
            assert detail["id"] == event_id
            assert len(detail["tables"]) == 5
            table_numbers = [t["tableNumber"] for t in detail["tables"]]
            assert "01" in table_numbers
            assert "05" in table_numbers

            # 3. Add extra custom table
            add_table_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/events/{event_id}/tables",
                json={"tableNumber": "VIP-Head", "tableLabel": "Head Table / Couple", "capacity": 12},
                headers=headers
            )
            assert add_table_res.status_code == 201
            assert add_table_res.json()["tableNumber"] == "VIP-Head"

            # 4. Toggle ordering status
            toggle_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/events/{event_id}/toggle-ordering",
                headers=headers
            )
            assert toggle_res.status_code == 200
            assert toggle_res.json()["isOrderingOpen"] is False

            # Toggle back to open
            toggle_res2 = await client.post(
                f"/api/v1/restaurants/{rest.id}/events/{event_id}/toggle-ordering",
                headers=headers
            )
            assert toggle_res2.status_code == 200
            assert toggle_res2.json()["isOrderingOpen"] is True

            # 5. Public Guest Endpoint Check
            pub_res = await client.get(f"/api/v1/public/events/{event_id}?table=01")
            assert pub_res.status_code == 200
            pub_data = pub_res.json()
            assert pub_data["event"]["title"] == payload["title"]
            assert pub_data["restaurant"]["name"] == "Château Grandeur"
            assert pub_data["table"]["tableNumber"] == "01"
            assert len(pub_data["menu"]) > 0

    async def test_multitenant_event_isolation(self, db_session: AsyncSession):
        rest_a, owner_a, email_a = await self._setup_restaurant(db_session, "Venue Alpha")
        rest_b, owner_b, email_b = await self._setup_restaurant(db_session, "Venue Beta")

        token_a = create_jwt({"sub": owner_a, "email": email_a, "role": "OWNER", "restaurant_id": rest_a.id})
        token_b = create_jwt({"sub": owner_b, "email": email_b, "role": "OWNER", "restaurant_id": rest_b.id})

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create event in Venue A
            res = await client.post(
                f"/api/v1/restaurants/{rest_a.id}/events",
                json={"title": "Alpha Wedding", "eventDate": "2026-12-01", "tableCount": 3},
                headers={"Authorization": f"Bearer {token_a}"}
            )
            assert res.status_code == 201
            event_id = res.json()["id"]

            # Venue B attempts to read Venue A's event -> 403 Forbidden
            cross_get = await client.get(
                f"/api/v1/restaurants/{rest_a.id}/events/{event_id}",
                headers={"Authorization": f"Bearer {token_b}"}
            )
            assert cross_get.status_code in (403, 404)

            # Venue B attempts to delete Venue A's event -> 403 Forbidden
            cross_del = await client.delete(
                f"/api/v1/restaurants/{rest_a.id}/events/{event_id}",
                headers={"Authorization": f"Bearer {token_b}"}
            )
            assert cross_del.status_code in (403, 404)

    async def test_wedding_order_placement_and_kds_pipeline(self, db_session: AsyncSession):
        rest, owner_uid, owner_email = await self._setup_restaurant(db_session, "Villa Bellini")
        cat, items = await self._setup_menu(db_session, rest.id)
        token = create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Create Active Event
            ev_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/events",
                json={
                    "title": "Elena & Marco's Reception",
                    "coupleNames": "Elena & Marco",
                    "eventDate": "2026-11-25",
                    "status": "ACTIVE",
                    "isOrderingOpen": True,
                    "tableCount": 4
                },
                headers=headers
            )
            assert ev_res.status_code == 201
            event_id = ev_res.json()["id"]

            # 2. Place an Order as wedding guest via POST /api/v1/orders
            order_payload = {
                "restaurantId": rest.id,
                "tableNumber": "02",
                "customerName": "Guest at Table 02",
                "orderType": "WEDDING_EVENT",
                "eventId": event_id,
                "eventName": "Elena & Marco's Reception",
                "items": [
                    {
                        "menuItemId": items[0].id,
                        "name": items[0].name,
                        "quantity": 2,
                        "price": items[0].price,
                        "notes": "Extra parmesan please"
                    }
                ],
                "notes": "Celebrating at Elena & Marco wedding!"
            }

            order_res = await client.post("/api/v1/orders", json=order_payload)
            assert order_res.status_code == 201, order_res.text
            created_order = order_res.json()
            assert created_order["orderType"] == "WEDDING_EVENT"
            assert created_order["eventId"] == event_id
            assert created_order["eventName"] == "Elena & Marco's Reception"
            assert created_order["tableNumber"] == "02"

            # 3. Verify event orders endpoint returns this wedding order
            event_orders_res = await client.get(
                f"/api/v1/restaurants/{rest.id}/events/{event_id}/orders",
                headers=headers
            )
            assert event_orders_res.status_code == 200
            orders_list = event_orders_res.json()
            assert len(orders_list) >= 1
            assert orders_list[0]["id"] == created_order["id"]

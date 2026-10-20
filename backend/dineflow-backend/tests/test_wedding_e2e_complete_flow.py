import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone
from jose import jwt

from app.main import app
from app.modules.restaurants.models import Restaurant, RestaurantMembership
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.weddings.models import WeddingEvent, EventTable, EventAssistanceRequest
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
class TestWeddingE2ECompleteFlow:
    async def _setup_env(self, db_session):
        rest_id = f"rest-e2e-{uuid.uuid4().hex[:6]}"
        other_rest_id = f"rest-other-{uuid.uuid4().hex[:6]}"
        owner_uid = f"uid-owner-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@palace.com"

        manager_uid = f"uid-mgr-{uuid.uuid4().hex[:6]}"
        manager_email = f"manager-{uuid.uuid4().hex[:6]}@palace.com"

        rest = Restaurant(
            id=rest_id,
            name="The Royal Heritage Palace",
            slug=f"royal-heritage-{uuid.uuid4().hex[:4]}",
            public_slug=f"royal-heritage-{uuid.uuid4().hex[:4]}",
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

        other_rest = Restaurant(
            id=other_rest_id,
            name="Other Venue",
            slug=f"other-{uuid.uuid4().hex[:4]}",
            public_slug=f"other-{uuid.uuid4().hex[:4]}",
            owner_uid="other-uid",
            owner_email="other@venue.com",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_bar=False,
            has_hookah=False,
            has_tables=True,
            has_waiter=True,
            enabled_modules=["kitchen", "tables"],
        )

        owner_mem = RestaurantMembership(
            id=f"mem-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=owner_uid,
            user_email=owner_email,
            role="OWNER",
            is_active=True,
        )

        manager_mem = RestaurantMembership(
            id=f"mem-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=manager_uid,
            user_email=manager_email,
            role="EVENT_MANAGER",
            is_active=True,
        )

        cat_starters = MenuCategory(
            id=f"cat-starters-{rest_id}",
            restaurant_id=rest_id,
            name="Royal Starters",
            sort_order=1,
            is_enabled=True,
        )

        item_biryani = MenuItem(
            id=f"item-biryani-{rest_id}",
            restaurant_id=rest_id,
            category_id=f"cat-starters-{rest_id}",
            name="Royal Dum Biryani",
            price=380.0,
            is_available=True,
            target_destination="KITCHEN",
            is_vegetarian=False,
        )

        item_cocktail = MenuItem(
            id=f"item-cocktail-{rest_id}",
            restaurant_id=rest_id,
            category_id=f"cat-starters-{rest_id}",
            name="Signature Gold Cocktail",
            price=450.0,
            is_available=True,
            target_destination="BAR",
            is_alcoholic=True,
            is_vegetarian=True,
        )

        item_shisha = MenuItem(
            id=f"item-shisha-{rest_id}",
            restaurant_id=rest_id,
            category_id=f"cat-starters-{rest_id}",
            name="Mint Double Apple Hookah",
            price=600.0,
            is_available=True,
            target_destination="HOOKAH",
            is_vegetarian=True,
        )

        db_session.add_all([rest, other_rest, owner_mem, manager_mem, cat_starters, item_biryani, item_cocktail, item_shisha])
        await db_session.commit()

        owner_token = create_jwt({"uid": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest_id})
        manager_token = create_jwt({"uid": manager_uid, "email": manager_email, "role": "EVENT_MANAGER", "restaurant_id": rest_id})
        other_token = create_jwt({"uid": "other-uid", "email": "other@venue.com", "role": "OWNER", "restaurant_id": other_rest_id})

        return {
            "rest_id": rest_id,
            "other_rest_id": other_rest_id,
            "owner_token": owner_token,
            "manager_token": manager_token,
            "other_token": other_token,
            "item_biryani": item_biryani,
            "item_cocktail": item_cocktail,
            "item_shisha": item_shisha,
        }

    async def test_complete_wedding_flow(self, db_session):
        env = await self._setup_env(db_session)
        rest_id = env["rest_id"]
        mgr_hdr = {"Authorization": f"Bearer {env['manager_token']}"}
        owner_hdr = {"Authorization": f"Bearer {env['owner_token']}"}
        other_hdr = {"Authorization": f"Bearer {env['other_token']}"}

        transport = ASGITransport(app=app)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Event Manager creates a wedding event with independent station flags
            create_evt_resp = await client.post(
                f"/api/v1/restaurants/{rest_id}/events",
                headers=mgr_hdr,
                json={
                    "title": "Aarav & Meera Grand Gala",
                    "coupleNames": "Aarav & Meera",
                    "eventType": "WEDDING",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "timezone": "UTC",
                    "status": "ACTIVE",
                    "isOrderingOpen": True,
                    "tableCount": 5,
                    "estimatedGuestCount": 250,
                    "hasFood": True,
                    "hasBar": True,
                    "hasHookah": True,
                    "hasTableAssistance": True,
                    "autoActivate": True,
                }
            )
            assert create_evt_resp.status_code == 201, create_evt_resp.text
            evt_data = create_evt_resp.json()
            event_id = evt_data["id"]
            assert evt_data["status"] == "ACTIVE"
            assert evt_data["hasFood"] is True
            assert evt_data["hasBar"] is True
            assert evt_data["hasHookah"] is True

            # 2. Event Manager adds a new dish with valid price
            add_item_resp = await client.post(
                f"/api/v1/restaurants/{rest_id}/menu",
                headers=mgr_hdr,
                json={
                    "name": "Truffle Paneer Tikka",
                    "description": "Charcoal grilled paneer infused with black truffle",
                    "price": 320.0,
                    "categoryId": f"cat-starters-{rest_id}",
                    "isVegetarian": True,
                    "targetDestination": "KITCHEN",
                }
            )
            assert add_item_resp.status_code == 201, add_item_resp.text
            new_item = add_item_resp.json()
            assert new_item["name"] == "Truffle Paneer Tikka"
            assert new_item["price"] == 320.0
            new_item_id = new_item["id"]

            # Verify reload/persistence of menu
            get_menu_resp = await client.get(f"/api/v1/restaurants/{rest_id}/menu")
            assert get_menu_resp.status_code == 200
            menu_data = get_menu_resp.json()
            menu_list = menu_data.get("items", []) if isinstance(menu_data, dict) else menu_data
            assert any(it["id"] == new_item_id and it["price"] == 320.0 for it in menu_list)

            # 3. Public Guest opens event URL without logging in
            guest_menu_resp = await client.get(f"/api/v1/public/events/{event_id}?table=01")
            assert guest_menu_resp.status_code == 200, guest_menu_resp.text
            guest_data = guest_menu_resp.json()
            assert guest_data["event"]["title"] == "Aarav & Meera Grand Gala"
            assert guest_data["event"]["hasFood"] is True
            assert guest_data["event"]["hasBar"] is True
            assert guest_data["event"]["hasHookah"] is True

            # Find items in guest menu - guests MUST NEVER see prices
            all_guest_items = []
            for c in guest_data["menu"]:
                all_guest_items.extend(c["items"])
            guest_paneer = next(it for it in all_guest_items if it["id"] == new_item_id)
            assert guest_paneer["price"] is None, "Guest menu items must never expose price"
            assert all(it["price"] is None for it in all_guest_items), "All guest menu items must have price = None"

            # 4. Guest places order with Food + Bar + Hookah items
            order_id = f"ord-e2e-{uuid.uuid4().hex[:6]}"
            idempotency_key = f"idem-{uuid.uuid4().hex[:6]}"
            order_payload = {
                "id": order_id,
                "restaurantId": rest_id,
                "tableNumber": "01",
                "customerName": "Guest at Table 01",
                "orderType": "WEDDING_EVENT",
                "eventId": event_id,
                "idempotencyKey": idempotency_key,
                "legalDrinkingAgeAffirmed": True,
                "items": [
                    {
                        "menuItemId": new_item_id,
                        "name": "Truffle Paneer Tikka",
                        "quantity": 2,
                        "notes": "Extra spicy",
                    },
                    {
                        "menuItemId": env["item_cocktail"].id,
                        "name": "Signature Gold Cocktail",
                        "quantity": 1,
                        "isAlcoholic": True,
                    },
                    {
                        "menuItemId": env["item_shisha"].id,
                        "name": "Mint Double Apple Hookah",
                        "quantity": 1,
                    }
                ],
            }

            place_order_resp = await client.post("/api/v1/orders", json=order_payload)
            assert place_order_resp.status_code in (200, 201), place_order_resp.text
            placed = place_order_resp.json()

            # Accurate item and financial calculations: Guest response hides financials
            expected_subtotal = (320.0 * 2) + 450.0 + 600.0  # 640 + 450 + 600 = 1690.0
            assert placed["id"] == order_id
            assert placed["eventId"] == event_id
            assert placed["tableNumber"] == "01"
            assert placed["subtotal"] is None, "Guest order response must not expose subtotal"
            assert placed["totalAmount"] is None, "Guest order response must not expose totalAmount"
            assert all(it["price"] is None for it in placed["items"]), "Guest order items must not expose price"
            assert placed["kitchenStatus"] == "PENDING"
            assert placed["barStatus"] == "PENDING"
            assert placed["hookahStatus"] == "PENDING"
            assert placed["status"] == "PENDING"

            # Internal accounting: Staff query retains legitimate catalog revenue and pricing
            staff_ords_resp = await client.get(f"/api/v1/restaurants/{rest_id}/events/{event_id}/orders", headers=mgr_hdr)
            assert staff_ords_resp.status_code == 200
            staff_ord = next(o for o in staff_ords_resp.json() if o["id"] == order_id)
            assert staff_ord["subtotal"] == expected_subtotal
            assert staff_ord["totalAmount"] >= expected_subtotal

            # 5. Duplicate submission guard (rapid tap or retry with same key)
            dup_resp = await client.post("/api/v1/orders", json=order_payload)
            assert dup_resp.status_code in (200, 201), dup_resp.text
            dup_placed = dup_resp.json()
            assert dup_placed["id"] == order_id  # Returns identical order, no double-insert

            # 6. Operational Terminal Multi-Station Lifecycle:
            # Kitchen marks preparing -> ready
            k_prep = await client.put(
                f"/api/v1/orders/{order_id}/status",
                headers=mgr_hdr,
                json={"kitchenStatus": "PREPARING"}
            )
            assert k_prep.status_code == 200
            assert k_prep.json()["kitchenStatus"] == "PREPARING"
            assert k_prep.json()["status"] == "PREPARING"

            k_ready = await client.put(
                f"/api/v1/orders/{order_id}/status",
                headers=mgr_hdr,
                json={"kitchenStatus": "READY"}
            )
            assert k_ready.status_code == 200
            # Safety: Order MUST NOT be fully READY because Bar and Hookah are still pending!
            assert k_ready.json()["kitchenStatus"] == "READY"
            assert k_ready.json()["status"] == "PREPARING"

            # Bar station marks preparing -> ready
            b_ready = await client.put(
                f"/api/v1/orders/{order_id}/status",
                headers=mgr_hdr,
                json={"barStatus": "READY"}
            )
            assert b_ready.status_code == 200
            assert b_ready.json()["barStatus"] == "READY"
            # Order still preparing because Hookah is pending
            assert b_ready.json()["status"] == "PREPARING"

            # Hookah station marks ready -> Now ALL required stations are ready!
            h_ready = await client.put(
                f"/api/v1/orders/{order_id}/status",
                headers=mgr_hdr,
                json={"hookahStatus": "READY"}
            )
            assert h_ready.status_code == 200
            assert h_ready.json()["hookahStatus"] == "READY"
            assert h_ready.json()["status"] == "READY"

            # 7. Delivery Runner claims and delivers order
            deliv_resp = await client.put(
                f"/api/v1/orders/{order_id}/status",
                headers=mgr_hdr,
                json={"status": "DELIVERED"}
            )
            assert deliv_resp.status_code == 200
            assert deliv_resp.json()["status"] == "DELIVERED"

            # 8. Table Assistance Flow: Guest requests assistance
            assist_resp = await client.post(
                f"/api/v1/public/events/{event_id}/assistance",
                json={
                    "tableNumber": "01",
                    "guestName": "Table Host",
                    "guestNote": "Please bring 2 bottles of sparkling water",
                    "items": [{"code": "WATER", "label": "Sparkling Water", "quantity": 2}],
                }
            )
            assert assist_resp.status_code == 201, assist_resp.text
            assist_req = assist_resp.json()
            assist_id = assist_req["id"]
            assert assist_req["status"] == "NEW"

            # Staff terminal acknowledges request
            ack_resp = await client.patch(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/assistance/{assist_id}/status",
                headers=mgr_hdr,
                json={"status": "ACKNOWLEDGED", "assignedStaffName": "Pooja"}
            )
            assert ack_resp.status_code == 200
            assert ack_resp.json()["status"] == "ACKNOWLEDGED"

            # Complete assistance request
            comp_assist = await client.patch(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/assistance/{assist_id}/status",
                headers=mgr_hdr,
                json={"status": "COMPLETED"}
            )
            assert comp_assist.status_code == 200
            assert comp_assist.json()["status"] == "COMPLETED"

            # 9. Tenant Isolation: Other restaurant owner cannot access this event or menu items
            iso_evt = await client.get(f"/api/v1/restaurants/{env['other_rest_id']}/events/{event_id}", headers=other_hdr)
            assert iso_evt.status_code in (403, 404)

            iso_order = await client.get(f"/api/v1/orders/restaurant/{env['other_rest_id']}?event_id={event_id}", headers=other_hdr)
            assert iso_order.status_code == 200
            assert len(iso_order.json()) == 0

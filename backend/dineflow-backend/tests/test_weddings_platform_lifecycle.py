import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from jose import jwt
import json
import base64

from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.weddings.models import WeddingAccessRequest, WeddingWorkspace, WeddingEvent, EventTable
from app.modules.orders.models import Order
from app.modules.tables.models import Table
from app.core.config.settings import get_settings

settings = get_settings()


def create_fake_jwt(claims: dict) -> str:
    """Helper to encode an un-signed or HS256 base64 JSON payload for testing token decoding."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_signature"
    return f"{header}.{payload}.{signature}"


def create_admin_jwt() -> str:
    return create_fake_jwt({
        "uid": "admin-ayan-uid",
        "email": "ayan090912@gmail.com",
        "email_verified": True,
        "admin": True,
        "role": "SUPER_ADMIN",
    })


def create_user_jwt(uid: str, email: str, role: str = "OWNER", restaurant_id: str = None) -> str:
    claims = {
        "uid": uid,
        "email": email,
        "email_verified": True,
        "role": role,
    }
    if restaurant_id:
        claims["restaurant_id"] = restaurant_id
    return create_fake_jwt(claims)


@pytest.mark.asyncio
class TestWeddingsPlatformLifecycle:
    async def _setup_restaurant_partner(self, db_session: AsyncSession, name: str = "Grand Palais Catering"):
        owner_uid = f"uid-rest-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@catering.com"
        rest_id = f"rest-cater-{uuid.uuid4().hex[:6]}"
        slug = f"cater-{uuid.uuid4().hex[:6]}"

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
        await db_session.flush()

        # Regular dining table for restaurant
        normal_table = Table(
            id=f"tbl-norm-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_number="T-01",
            capacity=4,
            status="AVAILABLE",
            is_occupied=False,
        )
        db_session.add(normal_table)

        # Menu Category & Dishes
        cat = MenuCategory(
            id=f"cat-wed-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            name="Banquet Feast",
            is_enabled=True,
            sort_order=1,
        )
        db_session.add(cat)
        await db_session.flush()

        item1 = MenuItem(
            id=f"item-1-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            category_id=cat.id,
            name="Royal Saffron Biryani",
            price=32.00,
            is_available=True,
            is_vegetarian=True,
        )
        item2 = MenuItem(
            id=f"item-2-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            category_id=cat.id,
            name="Grilled Lamb Cutlets",
            price=44.00,
            is_available=True,
            is_vegetarian=False,
        )
        db_session.add(item1)
        db_session.add(item2)
        await db_session.commit()

        return rest, [item1, item2], normal_table

    async def test_complete_14_step_wedding_lifecycle(self, db_session: AsyncSession):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 0. Setup catering restaurant and kitchen
            catering_rest, menu_items, normal_tbl = await self._setup_restaurant_partner(db_session)

            # STEP 1: A visitor submits a wedding ordering request
            organizer_email = f"sarah.organizer.{uuid.uuid4().hex[:6]}@celebrate.com"
            application_payload = {
                "applicantName": "Sarah Sterling",
                "applicantEmail": organizer_email,
                "applicantPhone": "+1-555-019-2834",
                "weddingName": "Sarah & Michael's Autumn Nuptials",
                "eventType": "WEDDING",
                "eventDate": "2026-11-28",
                "startTime": "17:00",
                "endTime": "23:00",
                "venueName": "The Grand Atrium & Gardens",
                "venueCity": "San Francisco",
                "estimatedGuestCount": 180,
                "cateringNotes": "Multi-course service with table QR ordering",
                "additionalRequirements": "Vegetarian & non-vegetarian banquet courses",
            }

            resp_apply = await client.post("/api/v1/weddings/requests", json=application_payload)
            assert resp_apply.status_code == 201, resp_apply.text
            apply_data = resp_apply.json()
            assert apply_data["status"] == "success"
            assert apply_data["lifecycleStatus"] == "SUBMITTED"
            request_id = apply_data["requestId"]
            assert request_id is not None

            # Duplicate submission handling
            resp_dup = await client.post("/api/v1/weddings/requests", json=application_payload)
            assert resp_dup.status_code in (200, 201)
            assert resp_dup.json().get("isDuplicate") is True

            # STEP 2: The request persists and appears in Platform Admin
            admin_token = create_admin_jwt()
            admin_headers = {"Authorization": f"Bearer {admin_token}"}

            resp_admin_list = await client.get("/api/v1/admin/wedding-requests", headers=admin_headers)
            assert resp_admin_list.status_code == 200, resp_admin_list.text
            admin_data = resp_admin_list.json()
            matched_req = next((r for r in admin_data["requests"] if r["id"] == request_id), None)
            assert matched_req is not None
            assert matched_req["applicantEmail"] == organizer_email
            assert matched_req["lifecycleStatus"] == "SUBMITTED"

            # STEP 3: A normal account is denied admin approval privileges (HTTP 403)
            normal_token = create_user_jwt("normal-uid", "random_owner@store.com", role="RESTAURANT_OWNER")
            normal_headers = {"Authorization": f"Bearer {normal_token}"}

            resp_unauth_approve = await client.post(
                f"/api/v1/admin/wedding-requests/{request_id}/approve",
                json={"cateringRestaurantId": catering_rest.id, "reviewNotes": "Unauthorized attempt"},
                headers=normal_headers,
            )
            assert resp_unauth_approve.status_code == 403

            # STEP 4: The authorized platform admin approves the request
            # Must assign the catering restaurant
            resp_approve = await client.post(
                f"/api/v1/admin/wedding-requests/{request_id}/approve",
                json={
                    "cateringRestaurantId": catering_rest.id,
                    "reviewNotes": "Approved by chief administrator after kitchen capacity review",
                },
                headers=admin_headers,
            )
            assert resp_approve.status_code == 200, resp_approve.text
            approval_result = resp_approve.json()
            assert approval_result["status"] in ("success", "APPROVED")
            workspace_id = approval_result["workspaceId"]
            event_id = approval_result["eventId"]
            assert workspace_id is not None
            assert event_id is not None

            # STEP 5: The workspace is provisioned exactly once (idempotent repeated approvals)
            resp_approve_again = await client.post(
                f"/api/v1/admin/wedding-requests/{request_id}/approve",
                json={"cateringRestaurantId": catering_rest.id},
                headers=admin_headers,
            )
            assert resp_approve_again.status_code == 200
            assert resp_approve_again.json()["workspaceId"] == workspace_id
            assert resp_approve_again.json()["eventId"] == event_id

            # STEP 6: The approved applicant can sign in and access their workspace
            organizer_uid = f"uid-organizer-{uuid.uuid4().hex[:6]}"
            organizer_token = create_user_jwt(organizer_uid, organizer_email, role="OWNER")
            organizer_headers = {"Authorization": f"Bearer {organizer_token}"}

            resp_my_workspaces = await client.get("/api/v1/weddings/workspaces/my", headers=organizer_headers)
            assert resp_my_workspaces.status_code == 200, resp_my_workspaces.text
            workspaces = resp_my_workspaces.json()["workspaces"]
            assert len(workspaces) >= 1
            assert workspaces[0]["id"] == workspace_id
            assert workspaces[0]["restaurantId"] == catering_rest.id

            resp_ws_detail = await client.get(f"/api/v1/weddings/workspaces/{workspace_id}", headers=organizer_headers)
            assert resp_ws_detail.status_code == 200
            ws_detail = resp_ws_detail.json()
            assert ws_detail["workspace"]["id"] == workspace_id
            assert ws_detail["event"]["id"] == event_id
            assert ws_detail["restaurant"]["id"] == catering_rest.id
            assert len(ws_detail["tables"]) >= 1

            # STEP 7: The organizer configures an event, provider menu, tables and QR codes
            # 7a. Update event
            update_payload = {
                "title": "Sarah & Michael's Luxury Wedding Feast",
                "coupleNames": "Sarah & Michael",
                "eventDate": "2026-11-28",
                "startTime": "17:30",
                "endTime": "23:30",
                "venueName": "Grand Ballroom",
                "welcomeMessage": "Welcome beloved family & friends! Please order banquet courses below.",
                "themeColor": "#d4af37",
                "estimatedGuests": 200,
            }
            resp_update_event = await client.put(
                f"/api/v1/weddings/workspaces/{workspace_id}/event",
                json=update_payload,
                headers=organizer_headers,
            )
            assert resp_update_event.status_code == 200
            assert resp_update_event.json()["status"] == "success"

            # 7b. Add a dedicated banquet table
            resp_add_tbl = await client.post(
                f"/api/v1/weddings/workspaces/{workspace_id}/tables",
                json={"tableNumber": "VIP-1", "label": "Bride's Immediate Family", "capacity": 10},
                headers=organizer_headers,
            )
            assert resp_add_tbl.status_code == 201
            vip_table = resp_add_tbl.json()["table"]
            assert vip_table["tableNumber"] == "VIP-1"
            assert "table=VIP-1" in resp_add_tbl.json()["qrUrl"]

            # STEP 8: A guest opens the QR URL without logging in (Public, No Auth)
            resp_guest_public = await client.get(f"/api/v1/public/events/{event_id}?table=VIP-1")
            assert resp_guest_public.status_code == 200, resp_guest_public.text
            guest_view = resp_guest_public.json()
            assert guest_view["event"]["id"] == event_id
            assert guest_view["table"]["tableNumber"] == "VIP-1"
            assert len(guest_view["menu"]) >= 1
            available_dishes = guest_view["menu"][0]["items"]
            assert len(available_dishes) >= 2

            # STEP 9: The guest browses the permitted menu and places an order
            order_item = available_dishes[0]
            guest_order_payload = {
                "restaurantId": catering_rest.id,
                "tableNumber": "VIP-1",
                "customerName": "Uncle David",
                "orderType": "WEDDING_EVENT",
                "eventId": event_id,
                "eventName": "Sarah & Michael's Luxury Wedding Feast",
                "items": [
                    {
                        "menuItemId": order_item["id"],
                        "name": order_item["name"],
                        "quantity": 2,
                        "notes": "Extra spicy please",
                    }
                ],
                "notes": "[Wedding Banquet] Table VIP-1 Guest Order",
            }

            resp_order = await client.post("/api/v1/orders", json=guest_order_payload)
            assert resp_order.status_code == 201, resp_order.text
            created_order = resp_order.json()
            order_id = created_order["id"]
            assert created_order["restaurantId"] == catering_rest.id
            assert created_order["orderType"] == "WEDDING_EVENT"
            assert created_order["eventId"] == event_id
            assert created_order["tableNumber"] == "VIP-1"
            assert created_order["totalAmount"] is None  # Guests must never see financial info

            # STEP 10: The order is committed and appears on the correct kitchen terminal
            caterer_kitchen_token = create_user_jwt(
                catering_rest.owner_uid,
                catering_rest.owner_email,
                role="OWNER",
                restaurant_id=catering_rest.id,
            )
            caterer_kitchen_headers = {"Authorization": f"Bearer {caterer_kitchen_token}"}

            resp_kitchen_orders = await client.get(
                f"/api/v1/orders/restaurant/{catering_rest.id}",
                headers=caterer_kitchen_headers,
            )
            assert resp_kitchen_orders.status_code == 200, resp_kitchen_orders.text
            kitchen_tickets = resp_kitchen_orders.json()
            matched_ticket = next((o for o in kitchen_tickets if o["id"] == order_id), None)
            assert matched_ticket is not None
            assert matched_ticket["tableNumber"] == "VIP-1"
            assert matched_ticket["orderType"] == "WEDDING_EVENT"

            # STEP 11: Kitchen status changes are reflected where supported
            resp_status_prep = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"status": "PREPARING"},
                headers=caterer_kitchen_headers,
            )
            assert resp_status_prep.status_code == 200

            resp_status_ready = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"status": "READY"},
                headers=caterer_kitchen_headers,
            )
            assert resp_status_ready.status_code == 200

            # Organizer checks live orders feed
            resp_org_orders = await client.get(
                f"/api/v1/weddings/workspaces/{workspace_id}/orders",
                headers=organizer_headers,
            )
            assert resp_org_orders.status_code == 200
            org_orders = resp_org_orders.json()["orders"]
            org_order = next((o for o in org_orders if o["id"] == order_id), None)
            assert org_order is not None
            assert org_order["status"] in ("READY", "PREPARING")

            # STEP 12: Another wedding organizer cannot access the workspace, orders or tables
            other_organizer_token = create_user_jwt("intruder-uid", "intruder@otherwedding.com", role="OWNER")
            other_headers = {"Authorization": f"Bearer {other_organizer_token}"}

            resp_intruder_detail = await client.get(
                f"/api/v1/weddings/workspaces/{workspace_id}",
                headers=other_headers,
            )
            assert resp_intruder_detail.status_code in (403, 404)

            resp_intruder_orders = await client.get(
                f"/api/v1/weddings/workspaces/{workspace_id}/orders",
                headers=other_headers,
            )
            assert resp_intruder_orders.status_code in (403, 404)

            # STEP 13: Closed or unapproved events reject new orders
            # Toggle ordering off
            resp_toggle_off = await client.post(
                f"/api/v1/weddings/workspaces/{workspace_id}/toggle-ordering",
                headers=organizer_headers,
            )
            assert resp_toggle_off.status_code == 200
            assert resp_toggle_off.json()["isOrderingOpen"] is False

            # Placing order now must be rejected
            resp_order_rejected = await client.post("/api/v1/orders", json=guest_order_payload)
            assert resp_order_rejected.status_code == 400
            assert "paused or closed" in resp_order_rejected.text.lower()

            # STEP 14: Ordinary restaurant owners and normal restaurant operations remain functional
            normal_dining_order_payload = {
                "restaurantId": catering_rest.id,
                "tableNumber": normal_tbl.table_number,
                "customerName": "Normal Dine-In Customer",
                "orderType": "DINE_IN",
                "items": [
                    {
                        "menuItemId": menu_items[1].id,
                        "name": menu_items[1].name,
                        "price": menu_items[1].price,
                        "quantity": 1,
                    }
                ],
                "notes": "Regular restaurant customer order",
            }
            resp_norm_order = await client.post("/api/v1/orders", json=normal_dining_order_payload)
            assert resp_norm_order.status_code == 201, resp_norm_order.text
            assert resp_norm_order.json()["orderType"] == "DINE_IN"
            assert resp_norm_order.json()["eventId"] is None

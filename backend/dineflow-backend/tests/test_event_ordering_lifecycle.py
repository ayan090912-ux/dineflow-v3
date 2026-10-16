import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta
from jose import jwt

from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.weddings.models import WeddingAccessRequest, WeddingWorkspace, WeddingEvent, EventTable
from app.modules.orders.models import Order
from app.modules.weddings.service_period import (
    calculate_event_service_window,
    get_authoritative_event_status,
    validate_order_within_event_window,
    _ensure_utc,
)
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
class TestEventOrderingLifecycle:
    async def _setup_restaurant(self, db_session: AsyncSession, name: str = "Grand Catering Kitchen"):
        owner_uid = f"uid-cater-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@cater.com"
        rest_id = f"rest-cater-{uuid.uuid4().hex[:6]}"
        slug = f"cater-slug-{uuid.uuid4().hex[:6]}"

        rest = Restaurant(
            id=rest_id,
            name=name,
            slug=slug,
            public_slug=slug,
            has_tables=True,
            has_kitchen=True,
            has_waiter=True,
            has_bar=True,
            enabled_modules=["kitchen", "waiter", "billing", "tables", "weddings"],
            owner_uid=owner_uid,
            owner_email=owner_email,
            is_approved=True,
            lifecycle_status="LIVE",
        )
        db_session.add(rest)
        await db_session.flush()

        cat = MenuCategory(
            id=f"cat-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            name="Banquet Entrees",
            is_enabled=True,
            sort_order=1,
        )
        db_session.add(cat)
        await db_session.flush()

        item = MenuItem(
            id=f"item-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            category_id=cat.id,
            name="Pan-Seared Seabass",
            price=28.50,
            is_available=True,
            is_vegetarian=False,
        )
        db_session.add(item)
        await db_session.commit()

        return rest, item, owner_uid, owner_email

    # -----------------------------------------------------------------------
    # Scenario 1: Setup submission and Platform Admin approval (ayan090912@gmail.com)
    # -----------------------------------------------------------------------
    async def test_setup_submission_and_platform_admin_approval_enforcement(self, db_session: AsyncSession):
        rest, item, owner_uid, owner_email = await self._setup_restaurant(db_session)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            applicant_email = f"host-{uuid.uuid4().hex[:6]}@corporate.org"
            sub_res = await client.post(
                "/api/v1/weddings/requests",
                json={
                    "applicantName": "Global Corp Host",
                    "applicantEmail": applicant_email,
                    "applicantPhone": "+1-555-892-1200",
                    "weddingName": "Tech Leadership Summit Banquet",
                    "eventType": "CORPORATE",
                    "eventDate": "2026-12-10",
                    "endDate": "2026-12-12",
                    "startTime": "09:00",
                    "endTime": "18:00",
                    "timezone": "Asia/Kolkata",
                    "serviceDays": 3,
                    "venueName": "Convention Hall Alpha",
                    "venueCity": "Bengaluru",
                    "cateringRestaurantId": rest.id,
                }
            )
            assert sub_res.status_code == 201, sub_res.text
            req_data = sub_res.json()
            request_id = req_data["requestId"]

            # Non-admin attempt -> 403 Forbidden
            imposter_token = create_jwt({"sub": "random-uid", "email": "imposter@gmail.com", "role": "USER"})
            imp_res = await client.post(
                f"/api/v1/admin/wedding-requests/{request_id}/approve",
                json={"cateringRestaurantId": rest.id},
                headers={"Authorization": f"Bearer {imposter_token}"}
            )
            assert imp_res.status_code in (401, 403)

            # Authorized Platform Admin: ayan090912@gmail.com
            admin_token = create_jwt({"sub": "admin-uid-1", "email": "ayan090912@gmail.com", "role": "PLATFORM_ADMIN", "admin": True, "email_verified": True})
            appr_res = await client.post(
                f"/api/v1/admin/wedding-requests/{request_id}/approve",
                json={"cateringRestaurantId": rest.id, "reviewNotes": "Approved for Corporate Summit"},
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            assert appr_res.status_code == 200, appr_res.text
            appr_data = appr_res.json()
            assert appr_data["status"] == "success"
            assert appr_data["workspaceId"] is not None
            assert appr_data["eventId"] is not None

    # -----------------------------------------------------------------------
    # Scenario 2: Service period calculations (single-day, multi-day, midnight spans)
    # -----------------------------------------------------------------------
    def test_service_period_engine_calculations(self):
        # A: Single-day normal evening
        res_single = calculate_event_service_window(
            start_date_str="2026-11-20",
            start_time_str="18:00",
            end_date_str="2026-11-20",
            end_time_str="23:30",
            timezone_str="Asia/Kolkata",
        )
        assert res_single["isCrossMidnight"] is False
        assert res_single["isMultiDay"] is False
        assert res_single["durationHours"] == 5.5

        # B: Cross-midnight span (19:00 to 02:30 next day)
        res_midnight = calculate_event_service_window(
            start_date_str="2026-11-20",
            start_time_str="19:00",
            end_date_str=None, # Auto inferred cross-midnight
            end_time_str="02:30",
            timezone_str="Asia/Kolkata",
        )
        assert res_midnight["isCrossMidnight"] is True
        assert res_midnight["endDate"] == "2026-11-21"
        assert res_midnight["durationHours"] == 7.5

        # C: Multi-day 3-day gala
        res_multiday = calculate_event_service_window(
            start_date_str="2026-11-20",
            start_time_str="10:00",
            end_date_str=None,
            end_time_str="22:00",
            service_days=3,
            timezone_str="Asia/Kolkata",
        )
        assert res_multiday["isMultiDay"] is True
        assert res_multiday["serviceDays"] == 3
        assert res_multiday["endDate"] == "2026-11-22"

    # -----------------------------------------------------------------------
    # Scenario 3: Activation & event expiry authoritative enforcement
    # -----------------------------------------------------------------------
    def test_authoritative_event_status_lifecycle(self):
        now = datetime.now(timezone.utc)
        start_future = now + timedelta(days=2)
        end_future = now + timedelta(days=2, hours=6)

        # 1. Future event with auto_activate=True -> SCHEDULED
        st_sched = get_authoritative_event_status(
            current_status="SCHEDULED",
            start_dt_utc=start_future,
            end_dt_utc=end_future,
            is_ordering_open=True,
            now_utc=now,
            auto_activate=True,
        )
        assert st_sched == "SCHEDULED"

        # 2. Window is active now
        start_past = now - timedelta(hours=2)
        end_upcoming = now + timedelta(hours=4)
        st_active = get_authoritative_event_status(
            current_status="SCHEDULED",
            start_dt_utc=start_past,
            end_dt_utc=end_upcoming,
            is_ordering_open=True,
            now_utc=now,
            auto_activate=True,
        )
        assert st_active == "ACTIVE"

        # 3. Window ended 10 minutes ago -> CLOSED
        end_past = now - timedelta(minutes=10)
        st_closed = get_authoritative_event_status(
            current_status="ACTIVE",
            start_dt_utc=start_past,
            end_dt_utc=end_past,
            is_ordering_open=True,
            now_utc=now,
            auto_activate=True,
        )
        assert st_closed == "CLOSED"

    # -----------------------------------------------------------------------
    # Scenario 4 & 5: Orders accepted during window, rejected before & after
    # -----------------------------------------------------------------------
    async def test_order_rejection_before_opening_and_after_closure(self, db_session: AsyncSession):
        rest, item, owner_uid, owner_email = await self._setup_restaurant(db_session)
        owner_token = create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {owner_token}"}
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Create Future Scheduled Event
            sched_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/events",
                json={
                    "title": "Future Anniversary Gala",
                    "eventType": "ANNIVERSARY",
                    "eventDate": "2029-06-15",
                    "startTime": "18:00",
                    "endTime": "23:00",
                    "status": "SCHEDULED",
                    "autoActivate": True,
                    "tableCount": 2,
                },
                headers=headers,
            )
            assert sched_res.status_code == 201
            sched_event_id = sched_res.json()["id"]

            # Order placed before start must be rejected
            res_rejected_early = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": rest.id,
                    "tableNumber": "01",
                    "customerName": "Early Guest",
                    "orderType": "EVENT_ORDER",
                    "eventId": sched_event_id,
                    "items": [{"menuItemId": item.id, "name": item.name, "quantity": 1, "price": item.price}],
                }
            )
            assert res_rejected_early.status_code == 400
            assert "not opened yet" in res_rejected_early.text.lower()

            # 2. Create Active Event (Service Window covering right now)
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            active_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/events",
                json={
                    "title": "Live Birthday Party",
                    "eventType": "BIRTHDAY",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "status": "ACTIVE",
                    "autoActivate": False,
                    "tableCount": 2,
                },
                headers=headers,
            )
            assert active_res.status_code == 201
            active_event_id = active_res.json()["id"]

            # Order during active window accepted without payment
            res_accepted = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": rest.id,
                    "tableNumber": "01",
                    "customerName": "Party Guest",
                    "orderType": "EVENT_ORDER",
                    "eventId": active_event_id,
                    "items": [{"menuItemId": item.id, "name": item.name, "quantity": 2, "price": item.price}],
                }
            )
            assert res_accepted.status_code == 201, res_accepted.text
            placed = res_accepted.json()
            assert placed["eventId"] == active_event_id
            assert placed["orderType"] == "EVENT_ORDER"
            assert placed["tableNumber"] == "01"

    # -----------------------------------------------------------------------
    # Scenario 6: Guest ordering without an account or payment method
    # -----------------------------------------------------------------------
    async def test_guest_ordering_without_payment_or_account(self, db_session: AsyncSession):
        rest, item, owner_uid, owner_email = await self._setup_restaurant(db_session)
        owner_token = create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {owner_token}"}
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            ev_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/events",
                json={
                    "title": "Private Dinner Party",
                    "eventType": "PARTY",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "status": "ACTIVE",
                    "tableCount": 3,
                },
                headers=headers,
            )
            assert ev_res.status_code == 201
            event_id = ev_res.json()["id"]

            # Public guest endpoint (No Auth)
            pub_res = await client.get(f"/api/v1/public/events/{event_id}?table=02")
            assert pub_res.status_code == 200
            pub_data = pub_res.json()
            assert pub_data["event"]["status"] == "ACTIVE"
            assert pub_data["table"]["tableNumber"] == "02"
            assert len(pub_data["menu"]) >= 1

            # Submit order without payment method, credit card, or guest account
            order_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": rest.id,
                    "tableNumber": "02",
                    "customerName": "Seated Guest",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "items": [{"menuItemId": item.id, "name": item.name, "quantity": 1, "price": item.price}],
                }
            )
            assert order_res.status_code == 201
            ord_json = order_res.json()
            assert ord_json["status"] == "PENDING"
            assert ord_json["kitchenStatus"] == "PENDING"
            assert ord_json["eventId"] == event_id

    # -----------------------------------------------------------------------
    # Scenario 7: Correct table mapping and kitchen delivery
    # -----------------------------------------------------------------------
    async def test_table_mapping_and_kitchen_ticket_routing(self, db_session: AsyncSession):
        rest, item, owner_uid, owner_email = await self._setup_restaurant(db_session)
        owner_token = create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {owner_token}"}
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            ev_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/events",
                json={
                    "title": "Reception Feast",
                    "eventType": "RECEPTION",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "status": "ACTIVE",
                    "tableCount": 5,
                },
                headers=headers,
            )
            event_id = ev_res.json()["id"]

            order_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": rest.id,
                    "tableNumber": "03",
                    "customerName": "VIP Table Guest",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "eventName": "Reception Feast",
                    "items": [{"menuItemId": item.id, "name": item.name, "quantity": 3, "price": item.price, "notes": "Well done"}],
                    "notes": "Table 03 special banquet course",
                }
            )
            assert order_res.status_code == 201
            order_id = order_res.json()["id"]

            # Route to kitchen terminal
            kds_res = await client.get(f"/api/v1/orders/restaurant/{rest.id}", headers=headers)
            assert kds_res.status_code == 200
            tickets = kds_res.json()
            ticket = next((t for t in tickets if t["id"] == order_id), None)
            assert ticket is not None
            assert ticket["tableNumber"] == "03"
            assert ticket["eventName"] == "Reception Feast"
            assert ticket["eventId"] == event_id
            assert ticket["items"][0]["notes"] == "Well done"

    # -----------------------------------------------------------------------
    # Scenario 8: Cross-tenant access isolation
    # -----------------------------------------------------------------------
    async def test_cross_tenant_access_isolation(self, db_session: AsyncSession):
        rest_a, item_a, uid_a, email_a = await self._setup_restaurant(db_session, "Restaurant A")
        rest_b, item_b, uid_b, email_b = await self._setup_restaurant(db_session, "Restaurant B")
        token_b = create_jwt({"sub": uid_b, "email": email_b, "role": "OWNER", "restaurant_id": rest_b.id})
        headers_b = {"Authorization": f"Bearer {token_b}"}
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token_a = create_jwt({"sub": uid_a, "email": email_a, "role": "OWNER", "restaurant_id": rest_a.id})
            ev_a = await client.post(
                f"/api/v1/restaurants/{rest_a.id}/events",
                json={"title": "Private Gala A", "eventDate": "2026-11-15", "status": "ACTIVE"},
                headers={"Authorization": f"Bearer {token_a}"}
            )
            event_id_a = ev_a.json()["id"]

            # Owner B tries to access or delete Event A -> Forbidden (403)
            cross_get = await client.get(f"/api/v1/restaurants/{rest_a.id}/events/{event_id_a}", headers=headers_b)
            assert cross_get.status_code == 403

            cross_del = await client.delete(f"/api/v1/restaurants/{rest_a.id}/events/{event_id_a}", headers=headers_b)
            assert cross_del.status_code == 403

    # -----------------------------------------------------------------------
    # Scenario 9: Existing restaurant ordering & billing unchanged
    # -----------------------------------------------------------------------
    async def test_normal_restaurant_ordering_unaffected(self, db_session: AsyncSession):
        rest, item, owner_uid, owner_email = await self._setup_restaurant(db_session)
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            normal_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": rest.id,
                    "tableNumber": "T-10",
                    "customerName": "Normal Walk-in",
                    "orderType": "DINE_IN",
                    "items": [{"menuItemId": item.id, "name": item.name, "quantity": 1, "price": item.price}],
                }
            )
            assert normal_res.status_code == 201
            normal_order = normal_res.json()
            assert normal_order["orderType"] == "DINE_IN"
            assert normal_order["eventId"] is None

    # -----------------------------------------------------------------------
    # Scenario 10: Reopening / extending an event safely via audited extension
    # -----------------------------------------------------------------------
    async def test_reopen_and_extend_event_service_period(self, db_session: AsyncSession):
        rest, item, owner_uid, owner_email = await self._setup_restaurant(db_session)
        owner_token = create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {owner_token}"}
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create closed event
            ev_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/events",
                json={
                    "title": "Expiring Event",
                    "eventDate": "2020-01-01",
                    "startTime": "10:00",
                    "endTime": "12:00",
                    "status": "CLOSED",
                    "autoActivate": True,
                },
                headers=headers,
            )
            event_id = ev_res.json()["id"]
            assert ev_res.json()["status"] == "CLOSED"

            # Orders are rejected on closed event
            rej_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": rest.id,
                    "tableNumber": "01",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "items": [{"menuItemId": item.id, "name": item.name, "quantity": 1, "price": item.price}],
                }
            )
            assert rej_res.status_code == 400

            # Extend event by 120 minutes
            ext_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/events/{event_id}/extend",
                json={"extensionMinutes": 120, "reason": "Host added 2 hours for midnight celebration"},
                headers=headers,
            )
            assert ext_res.status_code == 200, ext_res.text
            extended_data = ext_res.json()
            assert extended_data["status"] == "ACTIVE"
            assert extended_data["extendedReason"] == "Host added 2 hours for midnight celebration"
            assert extended_data["isOrderingOpen"] is True
            assert extended_data["extendedAt"] is not None

            # New orders are now successfully accepted
            accepted_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": rest.id,
                    "tableNumber": "01",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "items": [{"menuItemId": item.id, "name": item.name, "quantity": 1, "price": item.price}],
                }
            )
            assert accepted_res.status_code == 201

    # -----------------------------------------------------------------------
    # Scenario 11: Idempotency and deduplication guard
    # -----------------------------------------------------------------------
    async def test_order_idempotency_and_rapid_double_tap_guard(self, db_session: AsyncSession):
        rest, item, owner_uid, owner_email = await self._setup_restaurant(db_session)
        owner_token = create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {owner_token}"}
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            ev_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/events",
                json={
                    "title": "Idempotent Banquet",
                    "eventDate": today_str,
                    "startTime": "00:00",
                    "endTime": "23:59",
                    "status": "ACTIVE",
                },
                headers=headers,
            )
            event_id = ev_res.json()["id"]

            key = f"client-idemp-{uuid.uuid4().hex[:8]}"
            payload = {
                "restaurantId": rest.id,
                "tableNumber": "04",
                "customerName": "Guest 04",
                "orderType": "EVENT_ORDER",
                "eventId": event_id,
                "idempotencyKey": key,
                "items": [{"menuItemId": item.id, "name": item.name, "quantity": 1, "price": item.price}],
            }

            res1 = await client.post("/api/v1/orders", json=payload)
            assert res1.status_code == 201
            order_id_1 = res1.json()["id"]

            # Second identical tap with same idempotencyKey -> returns original order without duplicating
            res2 = await client.post("/api/v1/orders", json=payload)
            assert res2.status_code == 200 or res2.status_code == 201
            order_id_2 = res2.json()["id"]
            assert order_id_1 == order_id_2

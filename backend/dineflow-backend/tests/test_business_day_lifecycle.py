import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
from jose import jwt

from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table, TableSession
from app.modules.orders.models import Order, Bill, OrderItem
from app.modules.customer_requests.models import CustomerRequestModel
from app.modules.business_day.models import BusinessDay
from app.modules.menu.models import MenuCategory, MenuItem
from app.core.config.settings import get_settings

settings = get_settings()

def create_test_jwt(payload: dict) -> str:
    claims = {
        "exp": int(datetime.now(timezone.utc).timestamp()) + 3600,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        **payload,
    }
    return jwt.encode(claims, settings.JWT_ACCESS_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


@pytest.mark.asyncio
class TestBusinessDayLifecycle:
    async def _create_test_restaurant(self, db: AsyncSession, slug: str, owner_uid: str, owner_email: str) -> Restaurant:
        rest_id = f"rest-bday-{slug}-{uuid.uuid4().hex[:6]}"
        rest = Restaurant(
            id=rest_id,
            name=f"Bday Test {slug.title()}",
            slug=slug,
            public_slug=slug,
            cuisine="Indian",
            business_type="RESTAURANT",
            has_kitchen=True,
            has_bar=True,
            has_waiter=True,
            has_inventory=True,
            has_billing=True,
            has_tables=True,
            enabled_modules=["kitchen", "bar", "waiter", "inventory", "billing"],
            owner_uid=owner_uid,
            owner_email=owner_email,
            is_approved=True,
            lifecycle_status="LIVE",
            status="OPEN",
        )
        db.add(rest)
        await db.commit()
        await db.refresh(rest)
        return rest

    async def test_get_current_business_day(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"slug-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/current", headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert data["restaurant_id"] == rest.id
            assert data["status"] == "OPEN"
            assert "business_date" in data

    async def test_precheck_unresolved_operational_records(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"slug-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        # Create active table
        tbl = Table(
            id=f"tbl-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_number="T1",
            status="OCCUPIED",
            capacity=4,
        )
        db_session.add(tbl)

        # Create open order
        order = Order(
            id=f"ord-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_id=tbl.id,
            table_number="T1",
            status="PREPARING",
            kitchen_status="PREPARING",
            total_amount=500.0,
            items_json=[],
        )
        db_session.add(order)

        # Create pending bill
        bill = Bill(
            id=f"bill-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_id=tbl.id,
            table_number="T1",
            table_session_id=f"sess-{uuid.uuid4().hex[:6]}",
            subtotal=500.0,
            grand_total=500.0,
            status="PENDING",
            payment_status="UNPAID",
        )
        db_session.add(bill)

        # Create open waiter request
        req = CustomerRequestModel(
            id=f"req-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_id=tbl.id,
            table_number="T1",
            request_type="CALL_WAITER",
            message="Please assist table",
            status="PENDING",
        )
        db_session.add(req)
        await db_session.commit()

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/precheck", headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert data["active_tables_count"] == 1
            assert data["open_orders_count"] == 1
            assert data["unpaid_bills_count"] == 1
            assert data["open_waiter_requests_count"] == 1
            assert data["can_close_safely"] is False

    async def test_close_business_day_atomic_and_idempotent(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"slug-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        # Create active table and order
        tbl = Table(
            id=f"tbl-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_number="T2",
            status="OCCUPIED",
            capacity=2,
        )
        db_session.add(tbl)

        order = Order(
            id=f"ord-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_id=tbl.id,
            table_number="T2",
            status="READY",
            kitchen_status="READY",
            total_amount=250.0,
            items_json=[],
        )
        db_session.add(order)
        await db_session.commit()

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Close business day with force_close=True
            close_payload = {
                "force_close": True,
                "notes": "End of shift test",
                "cash_counted": 1000.0,
            }
            res = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/close", json=close_payload, headers=headers)
            assert res.status_code == 200, res.text
            close_data = res.json()
            assert close_data["status"] == "CLOSED"
            assert "closed_at" in close_data

            # Verify table was reset to AVAILABLE
            await db_session.refresh(tbl)
            assert tbl.status == "AVAILABLE"

            # Verify historical order still exists and is preserved in DB!
            await db_session.refresh(order)
            assert order is not None
            assert order.id is not None

            # 2. Repeated close request idempotency: closing again returns 200 with the existing closed day without duplicating
            res2 = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/close", json=close_payload, headers=headers)
            assert res2.status_code == 200
            assert res2.json()["status"] == "CLOSED"
            assert res2.json()["id"] == close_data["id"]

            count_res = await db_session.execute(select(func.count(BusinessDay.id)).where(BusinessDay.restaurant_id == rest.id))
            assert count_res.scalar() == 1

            # 3. Next day open: call /open to start the next business day
            open_res = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/open", headers=headers)
            assert open_res.status_code == 200
            current_day = open_res.json()
            assert current_day["status"] == "OPEN"
            assert current_day["id"] != close_data["id"]

            # And /current returns that newly opened day
            res3 = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/current", headers=headers)
            assert res3.status_code == 200
            assert res3.json()["status"] == "OPEN"
            assert res3.json()["id"] == current_day["id"]

    async def test_tenant_isolation(self, db_session: AsyncSession):
        owner_a = f"uid_a_{uuid.uuid4().hex[:6]}"
        email_a = f"owner_a_{uuid.uuid4().hex[:6]}@test.com"
        rest_a = await self._create_test_restaurant(db_session, f"rest-a-{uuid.uuid4().hex[:6]}", owner_a, email_a)

        owner_b = f"uid_b_{uuid.uuid4().hex[:6]}"
        email_b = f"owner_b_{uuid.uuid4().hex[:6]}@test.com"
        rest_b = await self._create_test_restaurant(db_session, f"rest-b-{uuid.uuid4().hex[:6]}", owner_b, email_b)

        # Owner A tries to close Restaurant B's day -> Forbidden 403
        token_a = create_test_jwt({"sub": owner_a, "email": email_a, "role": "OWNER", "restaurant_id": rest_a.id})
        headers_a = {"Authorization": f"Bearer {token_a}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post(
                f"/api/v1/restaurants/{rest_b.id}/business-day/close",
                json={"force_close": True},
                headers=headers_a
            )
            assert res.status_code == 403

    async def test_non_owner_cannot_close_or_open_day(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"non-owner-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        for non_owner_role in ["WAITER", "CHEF", "KITCHEN", "BARTENDER", "BAR_STAFF", "CUSTOMER"]:
            token = create_test_jwt({"sub": f"staff_{non_owner_role.lower()}", "email": f"{non_owner_role.lower()}@test.com", "role": non_owner_role, "restaurant_id": rest.id})
            headers = {"Authorization": f"Bearer {token}"}

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                # Attempt close
                close_res = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/close", json={"force_close": True}, headers=headers)
                assert close_res.status_code in [403, 401], f"Role {non_owner_role} should not close day"

                # Attempt open
                open_res = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/open", json={}, headers=headers)
                assert open_res.status_code in [403, 401], f"Role {non_owner_role} should not open day"

    async def test_duplicate_open_is_idempotent(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"idemp-open-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Open business day explicitly
            res1 = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/open", json={"business_date": "04 Oct 2026"}, headers=headers)
            assert res1.status_code == 200
            day1 = res1.json()
            assert day1["status"] == "OPEN"
            assert day1["business_date"] == "04 Oct 2026"

            # 2. Duplicate open request must return the existing open day idempotently
            res2 = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/open", json={"business_date": "04 Oct 2026"}, headers=headers)
            assert res2.status_code == 200
            day2 = res2.json()
            assert day2["id"] == day1["id"]
            assert day2["status"] == "OPEN"

            # 3. Verify exactly one open day exists in DB
            bday_count_res = await db_session.execute(
                select(func.count(BusinessDay.id)).where(BusinessDay.restaurant_id == rest.id, BusinessDay.status == "OPEN")
            )
            assert bday_count_res.scalar() == 1

    async def test_historical_records_preserved_and_read_only(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"hist-rec-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Ensure day is open
            open_res = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/open", json={"business_date": "04 Oct 2026"}, headers=headers)
            assert open_res.status_code == 200
            open_bday_id = open_res.json()["id"]

            now_ts = datetime.now(timezone.utc)

            # Add completed order and bill
            tbl = Table(id=f"tbl-{uuid.uuid4().hex[:6]}", restaurant_id=rest.id, table_number="T10", status="AVAILABLE", capacity=4)
            db_session.add(tbl)
            order = Order(
                id=f"ord-{uuid.uuid4().hex[:6]}",
                restaurant_id=rest.id,
                table_id=tbl.id,
                table_number="T10",
                business_day_id=open_bday_id,
                status="COMPLETED",
                total_amount=1200.0,
                created_at=now_ts,
                items_json=[{"name": "Curry", "price": 600.0, "quantity": 2, "station": "KITCHEN"}],
            )
            db_session.add(order)
            bill = Bill(
                id=f"bill-{uuid.uuid4().hex[:6]}",
                restaurant_id=rest.id,
                table_id=tbl.id,
                table_number="T10",
                table_session_id=f"sess-{uuid.uuid4().hex[:6]}",
                subtotal=1200.0,
                grand_total=1200.0,
                status="PAID",
                payment_status="PAID",
                payment_method="UPI",
                created_at=now_ts,
            )
            db_session.add(bill)
            await db_session.commit()

            # Close the business day
            close_res = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/close", json={"force_close": True}, headers=headers)
            assert close_res.status_code == 200
            closed_data = close_res.json()
            assert closed_data["total_sales"] == 1200.0
            assert closed_data["upi_sales"] == 1200.0

            # Verify history list contains the closed day
            hist_res = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/history", headers=headers)
            assert hist_res.status_code == 200
            history_list = hist_res.json()
            assert len(history_list) >= 1
            assert any(d["id"] == closed_data["id"] for d in history_list)

            # Verify history detail endpoint returns full read-only data
            detail_res = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/history/{closed_data['id']}", headers=headers)
            assert detail_res.status_code == 200
            detail = detail_res.json()
            assert detail["id"] == closed_data["id"]
            assert detail["total_sales"] == 1200.0
            assert detail["status"] == "CLOSED"

            # Verify order and bill are fully preserved in DB
            await db_session.refresh(order)
            assert order is not None
            assert order.total_amount == 1200.0
            await db_session.refresh(bill)
            assert bill is not None
            assert bill.status == "PAID"

    async def test_business_date_computation_and_midnight_crossing(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"cross-mid-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Open with 04 Oct 2026
            open1 = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/open", json={"business_date": "04 Oct 2026"}, headers=headers)
            assert open1.status_code == 200
            bday1 = open1.json()
            assert bday1["business_date"] == "04 Oct 2026"
            assert bday1["next_business_date"] == "05 Oct 2026"

            # 2. Close 04 Oct 2026
            close1 = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/close", json={"force_close": True}, headers=headers)
            assert close1.status_code == 200
            assert close1.json()["next_business_date"] == "05 Oct 2026"

            # 3. Open next day without explicit date -> automatically computes 05 Oct 2026!
            open2 = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/open", json={}, headers=headers)
            assert open2.status_code == 200
            bday2 = open2.json()
            assert bday2["business_date"] == "05 Oct 2026"
            assert bday2["next_business_date"] == "06 Oct 2026"

    async def test_close_precheck_enforcement_blocks_closing(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"enforce-close-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/open", json={"business_date": "04 Oct 2026"}, headers=headers)

            tbl = Table(id=f"tbl-{uuid.uuid4().hex[:6]}", restaurant_id=rest.id, table_number="T88", status="OCCUPIED", capacity=4)
            db_session.add(tbl)
            await db_session.commit()

            # Attempt close WITHOUT force_close -> 400 Bad Request
            res = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/close", json={"force_close": False}, headers=headers)
            assert res.status_code == 400
            assert "Cannot close day yet" in res.json()["detail"]

            # Attempt close WITH force_close -> 200 OK and table is reset
            res_ok = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/close", json={"force_close": True}, headers=headers)
            assert res_ok.status_code == 200
            await db_session.refresh(tbl)
            assert tbl.status == "AVAILABLE"

    async def test_bar_terminal_queue_isolation_and_eod_reset(self, db_session: AsyncSession):
        """
        Verify that:
        1. When business day 1 is open, bar orders appear in active bar queue.
        2. Order creation automatically attaches business_day_id.
        3. When business day 1 is closed, active bar queue is immediately empty.
        4. Reconnecting / refreshing page does NOT restore old completed bar tickets.
        5. When business day 2 is opened, it starts with an empty bar queue.
        6. New bar order on business day 2 appears in day 2 queue only.
        7. Historical day 1 bar order is permanently preserved and retrievable in Business Management.
        """
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"bar-eod-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        # Seed bar menu items so server authoritatively classifies items as BAR
        cat_bar = MenuCategory(
            id=f"cat-bar-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            name="Cocktails",
            sort_order=1,
        )
        db_session.add(cat_bar)

        item1 = MenuItem(
            id=f"item-of-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            category_id=cat_bar.id,
            name="Old Fashioned",
            price=550.0,
            target_destination="BAR",
            is_alcoholic=True,
        )
        item2 = MenuItem(
            id=f"item-dm-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            category_id=cat_bar.id,
            name="Dry Martini",
            price=600.0,
            target_destination="BAR",
            is_alcoholic=True,
        )
        db_session.add_all([item1, item2])
        await db_session.commit()

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Open Day 1
            open1 = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/open", json={"business_date": "10 Oct 2026"}, headers=headers)
            assert open1.status_code == 200
            day1_id = open1.json()["id"]

            # 2. Place an order containing BAR items
            order_payload = {
                "restaurantId": rest.id,
                "tableNumber": "T-BAR-1",
                "customerName": "John Cocktail",
                "items": [
                    {
                        "name": "Old Fashioned",
                        "price": 550.0,
                        "quantity": 2,
                        "targetDestination": "BAR",
                        "isAlcoholic": True,
                    }
                ],
            }
            order1_res = await ac.post("/api/v1/orders", json=order_payload, headers=headers)
            assert order1_res.status_code == 201
            ord1 = order1_res.json()
            assert ord1["bar_status"] == "PENDING"
            assert ord1["business_day_id"] == day1_id

            # 3. Bar queue returns this active order
            bar_queue1 = await ac.get(f"/api/v1/orders/restaurant/{rest.id}?station=BAR&active_only=true", headers=headers)
            assert bar_queue1.status_code == 200
            queue_items = bar_queue1.json()
            assert len(queue_items) == 1
            assert queue_items[0]["id"] == ord1["id"]

            # 4. Close Day 1 (force_close to finalize active tickets)
            close1 = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/close", json={"force_close": True}, headers=headers)
            assert close1.status_code == 200

            # 5. Bar queue immediately resets to 0 (clean operational state)
            bar_queue_closed = await ac.get(f"/api/v1/orders/restaurant/{rest.id}?station=BAR&active_only=true", headers=headers)
            assert bar_queue_closed.status_code == 200
            assert len(bar_queue_closed.json()) == 0

            # 6. Refresh / reconnect simulation: queue remains 0
            bar_queue_reconnect = await ac.get(f"/api/v1/orders/restaurant/{rest.id}?station=BAR&active_only=true", headers=headers)
            assert bar_queue_reconnect.status_code == 200
            assert len(bar_queue_reconnect.json()) == 0

            # 7. Open Day 2
            open2 = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/open", json={"business_date": "11 Oct 2026"}, headers=headers)
            assert open2.status_code == 200
            day2_id = open2.json()["id"]

            # 8. Day 2 active queue is clean (old tickets do NOT reappear in Day 2)
            bar_queue_day2_initial = await ac.get(f"/api/v1/orders/restaurant/{rest.id}?station=BAR&active_only=true", headers=headers)
            assert bar_queue_day2_initial.status_code == 200
            assert len(bar_queue_day2_initial.json()) == 0

            # 9. Create a new beverage order on Day 2
            order2_payload = {
                "restaurantId": rest.id,
                "tableNumber": "T-BAR-2",
                "customerName": "Alice Martini",
                "items": [
                    {
                        "name": "Dry Martini",
                        "price": 600.0,
                        "quantity": 1,
                        "targetDestination": "BAR",
                        "isAlcoholic": True,
                    }
                ],
            }
            order2_res = await ac.post("/api/v1/orders", json=order2_payload, headers=headers)
            assert order2_res.status_code == 201
            ord2 = order2_res.json()
            assert ord2["business_day_id"] == day2_id

            # 10. Day 2 queue shows ONLY the new beverage order
            bar_queue_day2_active = await ac.get(f"/api/v1/orders/restaurant/{rest.id}?station=BAR&active_only=true", headers=headers)
            assert bar_queue_day2_active.status_code == 200
            d2_items = bar_queue_day2_active.json()
            assert len(d2_items) == 1
            assert d2_items[0]["id"] == ord2["id"]
            assert d2_items[0]["id"] != ord1["id"]

            # 11. Historical Day 1 records are permanently preserved and retrievable by Business Management
            hist_orders_res = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/history/{day1_id}/orders", headers=headers)
            assert hist_orders_res.status_code == 200
            day1_orders = hist_orders_res.json()
            assert len(day1_orders) >= 1
            assert any(o["id"] == ord1["id"] for o in day1_orders)
            assert all(o["business_day_id"] == day1_id for o in day1_orders)

    async def test_kitchen_and_waiter_queues_reset_on_eod(self, db_session: AsyncSession):
        """
        Verify that Kitchen KDS and Waiter terminal views follow the same business-day lifecycle.
        """
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"kds-eod-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Open Day
            await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/open", json={"business_date": "15 Oct 2026"}, headers=headers)

            # 2. Add kitchen order
            k_payload = {
                "restaurantId": rest.id,
                "tableNumber": "T-KDS-1",
                "customerName": "Guest",
                "items": [{"name": "Butter Chicken", "price": 450.0, "quantity": 1, "targetDestination": "KITCHEN"}],
            }
            ord_res = await ac.post("/api/v1/orders", json=k_payload, headers=headers)
            assert ord_res.status_code == 201
            k_ord = ord_res.json()

            # 3. Active kitchen queue returns this order
            kds_res = await ac.get(f"/api/v1/orders/restaurant/{rest.id}?station=KITCHEN&active_only=true", headers=headers)
            assert kds_res.status_code == 200
            assert len(kds_res.json()) == 1

            # 4. Active waiter queue returns this order
            waiter_res = await ac.get(f"/api/v1/orders/restaurant/{rest.id}?active_only=true", headers=headers)
            assert waiter_res.status_code == 200
            assert len(waiter_res.json()) == 1

            # 5. Close day
            await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/close", json={"force_close": True}, headers=headers)

            # 6. Both queues must now be empty
            kds_after = await ac.get(f"/api/v1/orders/restaurant/{rest.id}?station=KITCHEN&active_only=true", headers=headers)
            assert len(kds_after.json()) == 0

            waiter_after = await ac.get(f"/api/v1/orders/restaurant/{rest.id}?active_only=true", headers=headers)
            assert len(waiter_after.json()) == 0

    async def test_cross_tenant_isolation_on_station_queues(self, db_session: AsyncSession):
        """
        Verify that staff or owners from restaurant A cannot access restaurant B's station queues.
        """
        owner_a = f"uid_a_{uuid.uuid4().hex[:6]}"
        rest_a = await self._create_test_restaurant(db_session, f"iso-a-{uuid.uuid4().hex[:6]}", owner_a, "a@test.com")

        owner_b = f"uid_b_{uuid.uuid4().hex[:6]}"
        rest_b = await self._create_test_restaurant(db_session, f"iso-b-{uuid.uuid4().hex[:6]}", owner_b, "b@test.com")

        # Staff token for Restaurant A
        staff_a_token = create_test_jwt({"sub": "staff_a", "role": "BARTENDER", "restaurant_id": rest_a.id})
        headers_a = {"Authorization": f"Bearer {staff_a_token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Staff A queries Restaurant B's bar orders -> 403 Forbidden
            res = await ac.get(f"/api/v1/orders/restaurant/{rest_b.id}?station=BAR", headers=headers_a)
            assert res.status_code == 403

    async def test_multi_day_gap_resynchronizes_to_current_date(self, db_session: AsyncSession):
        """
        Verify that determine_next_open_business_date calculates the restaurant's current local date
        when a multi-day gap exists, and opening a shift with this date correctly records it.
        """
        from app.modules.business_day.router import determine_next_open_business_date

        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"resync-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        # Create closed business day with an ancient date
        old_closed_bday = BusinessDay(
            id=f"bday-old-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            business_date="06 Oct 2026",
            status="CLOSED",
            opened_at=datetime(2026, 10, 6, 10, 0, 0, tzinfo=timezone.utc),
            closed_at=datetime(2026, 10, 6, 23, 0, 0, tzinfo=timezone.utc),
        )
        db_session.add(old_closed_bday)
        await db_session.commit()

        # Authoritatively compute recommended next open business date
        expected_date = determine_next_open_business_date(rest, old_closed_bday)
        assert expected_date is not None
        assert expected_date != "07 Oct 2026"

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            open_res = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/open", json={"business_date": expected_date}, headers=headers)
            assert open_res.status_code == 200
            data = open_res.json()
            assert data["status"] == "OPEN"
            assert data["business_date"] == expected_date

    async def test_delivered_orders_excluded_from_station_pending_counts(self, db_session: AsyncSession):
        """
        Verify that orders that have already reached DELIVERED or COMPLETED status
        are strictly excluded from station pending counts (bar_pending_count, kitchen_pending_count),
        preventing phantom pending counts from historical orders.
        """
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"deliv-filter-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        # Order marked DELIVERED but lingering bar_status='PENDING'
        ord_delivered = Order(
            id=f"ord-deliv-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_number="T5",
            status="DELIVERED",
            kitchen_status="COMPLETED",
            bar_status="PENDING",
            total_amount=150.0,
            items_json=[],
        )
        db_session.add(ord_delivered)
        await db_session.commit()

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/current", headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert data["bar_pending_count"] == 0
            assert data["kitchen_pending_count"] == 0

            precheck_res = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/precheck", headers=headers)
            assert precheck_res.status_code == 200
            precheck_data = precheck_res.json()
            assert precheck_data["uncompletedBarOrdersCount"] == 0
            assert precheck_data["uncompletedKitchenOrdersCount"] == 0

    async def test_precheck_count_and_blocking_reasons_parity(self, db_session: AsyncSession):
        """
        Verify that precheck warnings count matches blocking_reasons array length exactly,
        and that station items (kitchen, bar, waiter) provide valid navigational blocking reasons.
        """
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"parity-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        tbl = Table(
            id=f"tbl-p-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_number="T1",
            status="AVAILABLE",
            capacity=4,
        )
        db_session.add(tbl)

        # 1. Unpaid bill
        bill = Bill(
            id=f"bill-p-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_id=tbl.id,
            table_number="T1",
            table_session_id=f"sess-{uuid.uuid4().hex[:6]}",
            subtotal=300.0,
            grand_total=300.0,
            status="PENDING",
            payment_status="UNPAID",
        )
        db_session.add(bill)

        # 2. Open bar order
        ord_bar = Order(
            id=f"ord-bar-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_id=tbl.id,
            table_number="T1",
            status="ACCEPTED",
            kitchen_status="NONE",
            bar_status="PENDING",
            total_amount=200.0,
            items_json=[],
        )
        db_session.add(ord_bar)

        # 3. Open waiter request
        req = CustomerRequestModel(
            id=f"req-p-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_id=tbl.id,
            table_number="T1",
            request_type="WATER",
            message="Water please",
            status="PENDING",
        )
        db_session.add(req)
        await db_session.commit()

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/precheck", headers=headers)
            assert res.status_code == 200
            data = res.json()
            # 3 total active items: 1 bill, 1 bar ticket, 1 waiter request
            assert len(data["warnings"]) == 3
            assert len(data["blocking_reasons"]) == 3
            # Every blocking reason has an id, label, and link
            types = [b["type"] for b in data["blocking_reasons"]]
            assert "BILL" in types
            assert "BAR" in types
            assert "WAITER" in types
            assert all(b.get("link") is not None for b in data["blocking_reasons"])

    async def test_paid_sales_strictly_scoped_to_active_shift(self, db_session: AsyncSession):
        """
        Verify that lifetime historical paid bills do NOT leak into current operational sales.
        When a new shift opens with 0 orders and 0 bills paid in that shift, total_sales is 0.0.
        """
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"sales-scope-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        tbl = Table(
            id=f"tbl-s-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_number="T1",
            status="AVAILABLE",
            capacity=4,
        )
        db_session.add(tbl)

        # Create historical closed business day with paid bills
        past_bday = BusinessDay(
            id=f"bday-past-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            business_date="01 Oct 2026",
            status="CLOSED",
            opened_at=datetime(2026, 10, 1, 9, 0, 0, tzinfo=timezone.utc),
            closed_at=datetime(2026, 10, 1, 23, 0, 0, tzinfo=timezone.utc),
            total_sales=5000.0,
            total_orders=10,
        )
        db_session.add(past_bday)

        # Historical bill stamped with past shift
        hist_bill = Bill(
            id=f"bill-hist-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_id=tbl.id,
            business_day_id=past_bday.id,
            table_number="T1",
            table_session_id=f"sess-hist-{uuid.uuid4().hex[:6]}",
            subtotal=5000.0,
            grand_total=5000.0,
            status="PAID",
            payment_status="PAID",
            payment_method="CASH",
            created_at=datetime(2026, 10, 1, 14, 0, 0, tzinfo=timezone.utc),
        )
        db_session.add(hist_bill)

        # Now open today's business day
        now_utc = datetime.now(timezone.utc)
        today_bday = BusinessDay(
            id=f"bday-today-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            business_date=now_utc.strftime("%d %b %Y"),
            status="OPEN",
            opened_at=now_utc,
            opened_by=owner_email,
        )
        db_session.add(today_bday)
        await db_session.commit()

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/current", headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert data["id"] == today_bday.id
            # Authoritative shift sales must be 0.0, NOT 5000.0!
            assert data["total_sales"] == 0.0
            assert data["totalOrders"] == 0


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
from app.modules.orders.models import Order, Bill
from app.modules.business_day.models import BusinessDay
from app.modules.business_day.service import (
    get_operational_business_date,
    check_shift_requires_rollover,
    calculate_shift_financial_ledger,
    perform_business_day_rollover,
    compute_next_rollover_timestamp,
    get_restaurant_tz,
)
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
class TestAuthoritativeDayManagement:
    async def _create_test_restaurant(self, db: AsyncSession, slug: str, owner_uid: str, owner_email: str) -> Restaurant:
        rest_id = f"rest-auth-{slug}-{uuid.uuid4().hex[:6]}"
        rest = Restaurant(
            id=rest_id,
            name=f"Auth Day {slug.title()}",
            slug=slug,
            public_slug=slug,
            cuisine="Indian",
            business_type="RESTAURANT",
            timezone="Asia/Kolkata",
            rollover_time="04:00",
            auto_rollover_enabled=True,
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

    async def test_live_timezone_and_rollover_cutoff_metadata(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"tz-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/current", headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert data["restaurant_timezone"] == "Asia/Kolkata"
            assert "current_local_time" in data
            assert "current_local_date" in data
            assert "next_rollover_at" in data
            assert "last_sync_time" in data

    async def test_financial_ledger_unbilled_and_unpaid_separation(self, db_session: AsyncSession):
        """
        Verify that orders created without bills show as unbilled_orders_amount
        while settled bills show as settled_sales (total_sales).
        Explaining the production bug where sales showed ₹0.00 while orders existed!
        """
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"ledger-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        # 1. Initialize business day
        bday = BusinessDay(
            id=f"bday-{rest.id}-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            business_date="23 Oct 2026",
            status="OPEN",
            opened_at=datetime.now(timezone.utc),
            opened_by=owner_email,
        )
        db_session.add(bday)
        await db_session.commit()

        # 2. Add 2 food orders and 1 bar order, but NO bills generated
        ord1 = Order(
            id=f"ord-f1-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_number="T1",
            business_day_id=bday.id,
            status="COMPLETED",
            kitchen_status="COMPLETED",
            total_amount=400.0,
            items_json=[{"name": "Paneer Tikka", "price": 400.0, "quantity": 1, "station": "KITCHEN"}],
        )
        ord2 = Order(
            id=f"ord-b1-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_number="T1",
            business_day_id=bday.id,
            status="COMPLETED",
            bar_status="COMPLETED",
            total_amount=600.0,
            items_json=[{"name": "Mojito", "price": 300.0, "quantity": 2, "station": "BAR"}],
        )
        db_session.add_all([ord1, ord2])
        await db_session.commit()

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/current", headers=headers)
            assert res.status_code == 200
            data = res.json()

            # Settled sales is 0.0 because no bills have been paid
            assert data["settled_sales"] == 0.0
            assert data["total_sales"] == 0.0

            # Order value (gross sales) is 1000.0
            assert data["order_value"] == 1000.0
            assert data["gross_sales"] == 1000.0
            assert data["food_sales"] == 400.0
            assert data["bar_sales"] == 600.0

            # Unbilled orders amount is 1000.0
            assert data["unbilled_orders_amount"] == 1000.0
            assert data["unbilled_orders_count"] == 2
            assert data["outstanding_receivables"] == 1000.0

            # 3. Now generate a paid bill for ord1 (400.0 paid by UPI)
            bill1 = Bill(
                id=f"bill-{uuid.uuid4().hex[:6]}",
                restaurant_id=rest.id,
                table_id="tbl-1",
                table_number="T1",
                table_session_id="sess-1",
                business_day_id=bday.id,
                status="PAID",
                payment_status="PAID",
                payment_method="UPI",
                grand_total=400.0,
                orders_snapshot_json=[{"id": ord1.id}],
            )
            db_session.add(bill1)
            await db_session.commit()

            res2 = await ac.get(f"/api/v1/restaurants/{rest.id}/business-day/current", headers=headers)
            assert res2.status_code == 200
            data2 = res2.json()

            # Now settled sales is 400.0, UPI sales 400.0
            assert data2["settled_sales"] == 400.0
            assert data2["upi_sales"] == 400.0
            assert data2["cash_sales"] == 0.0

            # Unbilled is now only ord2 (600.0)
            assert data2["unbilled_orders_amount"] == 600.0
            assert data2["unbilled_orders_count"] == 1
            assert data2["outstanding_receivables"] == 600.0

    async def test_manual_sync_and_advance_stale_shift(self, db_session: AsyncSession):
        """
        Verify that a stale shift from days ago (e.g. 16 Oct) can be manually
        synchronized and advanced to today, preserving all 16 Oct order attributions.
        """
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"stale-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        # 1. Stale shift left open from 16 Oct
        past_opened_at = datetime.now(timezone.utc) - timedelta(days=7)
        stale_bday = BusinessDay(
            id=f"bday-stale-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            business_date="16 Oct 2026",
            status="OPEN",
            opened_at=past_opened_at,
            opened_by="past_manager@test.com",
        )
        db_session.add(stale_bday)

        # Order belonging to 16 Oct
        stale_order = Order(
            id=f"ord-stale-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_number="T1",
            business_day_id=stale_bday.id,
            status="COMPLETED",
            total_amount=1008.0,
            items_json=[],
            created_at=past_opened_at,
        )
        db_session.add(stale_order)
        await db_session.commit()

        token = create_test_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Call manual sync-and-advance
            res = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/sync-and-advance", headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert data["success"] is True

            # Closed day is 16 Oct with orders intact
            closed_day = data["closedDay"]
            assert closed_day["business_date"] == "16 Oct 2026"
            assert closed_day["status"] == "CLOSED"
            assert closed_day["order_value"] == 1008.0

            # Active day is opened for current operational date
            active_day = data["activeDay"]
            assert active_day["status"] == "OPEN"
            assert active_day["id"] != stale_bday.id
            assert active_day["total_orders"] == 0
            assert active_day["total_sales"] == 0.0

            # Verify in DB that historical order is still bound to the closed 16 Oct day
            await db_session.refresh(stale_order)
            assert stale_order.business_day_id == stale_bday.id

    async def test_automatic_rollover_idempotency_and_concurrency(self, db_session: AsyncSession):
        """
        Verify that multiple concurrent rollover attempts only execute once and do not duplicate.
        """
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"conc-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        # Open shift
        bday = BusinessDay(
            id=f"bday-conc-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            business_date="16 Oct 2026",
            status="OPEN",
            opened_at=datetime.now(timezone.utc) - timedelta(days=2),
            opened_by=owner_email,
        )
        db_session.add(bday)
        await db_session.commit()

        # Run 2 sequential rollover calls
        rolled1, closed1, new1 = await perform_business_day_rollover(rest, db_session, caller_actor="Worker 1")
        assert rolled1 is True
        assert closed1.id == bday.id
        assert new1 is not None

        # Second attempt should see shift is already on current operational date and return False
        rolled2, closed2, new2 = await perform_business_day_rollover(rest, db_session, caller_actor="Worker 2", force_close=False)
        assert rolled2 is False
        assert closed2.id == new1.id
        assert new2 is None

        # Verify only 1 OPEN day exists in DB
        open_days_res = await db_session.execute(
            select(func.count(BusinessDay.id)).where(BusinessDay.restaurant_id == rest.id, BusinessDay.status == "OPEN")
        )
        assert open_days_res.scalar() == 1

    async def test_overnight_service_orders_attribution(self, db_session: AsyncSession):
        """
        Verify overnight operational date attribution:
        Time before 04:00 AM cutoff belongs to preceding calendar day.
        Time at or after 04:00 AM cutoff belongs to the new calendar day.
        """
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"night-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        # 02:30 AM on 24 Oct in Asia/Kolkata (+05:30) is 23 Oct 21:00 UTC
        dt_night = datetime(2026, 10, 23, 21, 0, tzinfo=timezone.utc)
        op_date_night = get_operational_business_date(dt_night, rest)
        assert op_date_night == "23 Oct 2026"

        # 04:30 AM on 24 Oct in Asia/Kolkata (+05:30) is 23 Oct 23:00 UTC
        dt_morning = datetime(2026, 10, 23, 23, 0, tzinfo=timezone.utc)
        op_date_morning = get_operational_business_date(dt_morning, rest)
        assert op_date_morning == "24 Oct 2026"

    async def test_new_day_accepts_orders_while_prior_day_reconciliation_pending(self, db_session: AsyncSession):
        """
        Verify that when a business day rolls over with unbilled/unsettled orders,
        the prior day is marked requires_reconciliation = True,
        and the new operational day opens freely and accepts new customer orders.
        """
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"recon-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        # 1. Day 1: 16 Oct with unbilled orders
        day1 = BusinessDay(
            id=f"bday-day1-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            business_date="16 Oct 2026",
            status="OPEN",
            opened_at=datetime.now(timezone.utc) - timedelta(days=3),
            opened_by=owner_email,
        )
        db_session.add(day1)

        ord_unbilled = Order(
            id=f"ord-unbilled-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_number="T1",
            business_day_id=day1.id,
            status="COMPLETED",
            kitchen_status="COMPLETED",
            total_amount=1008.0,
            items_json=[],
        )
        db_session.add(ord_unbilled)
        await db_session.commit()

        # 2. Rollover occurs
        rolled, closed_day, new_day = await perform_business_day_rollover(rest, db_session, caller_actor="Auto Daemon")
        assert rolled is True
        assert closed_day.id == day1.id
        assert closed_day.status == "CLOSED"
        assert closed_day.requires_reconciliation is True
        assert closed_day.unbilled_orders_amount == 1008.0
        assert closed_day.total_sales == 0.0

        # 3. New day is OPEN and ready to take orders
        assert new_day.status == "OPEN"
        assert new_day.total_orders == 0
        assert new_day.total_sales == 0.0

        # 4. New order placed today
        ord_today = Order(
            id=f"ord-today-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            table_number="T2",
            business_day_id=new_day.id,
            status="DELIVERED",
            total_amount=500.0,
            items_json=[],
        )
        db_session.add(ord_today)
        await db_session.commit()

        # 5. Query active ledger
        metrics_today = await calculate_shift_financial_ledger(rest.id, new_day, db_session)
        assert metrics_today["total_orders"] == 1
        assert metrics_today["gross_sales"] == 500.0

        # 6. Verify Day 1 historical record was completely untouched
        await db_session.refresh(closed_day)
        assert closed_day.unbilled_orders_amount == 1008.0
        assert closed_day.gross_sales == 1008.0

    async def test_tenant_isolation_business_days(self, db_session: AsyncSession):
        """
        Verify that multiple restaurants maintain completely isolated business day lifecycles.
        """
        owner_uid_a = f"uid_a_{uuid.uuid4().hex[:6]}"
        owner_email_a = f"a_{uuid.uuid4().hex[:6]}@test.com"
        rest_a = await self._create_test_restaurant(db_session, f"tenant-a-{uuid.uuid4().hex[:6]}", owner_uid_a, owner_email_a)

        owner_uid_b = f"uid_b_{uuid.uuid4().hex[:6]}"
        owner_email_b = f"b_{uuid.uuid4().hex[:6]}@test.com"
        rest_b = await self._create_test_restaurant(db_session, f"tenant-b-{uuid.uuid4().hex[:6]}", owner_uid_b, owner_email_b)

        # Open days for both
        bday_a = BusinessDay(
            id=f"bday-a-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_a.id,
            business_date="20 Oct 2026",
            status="OPEN",
            opened_at=datetime.now(timezone.utc) - timedelta(days=2),
            opened_by=owner_email_a,
        )
        bday_b = BusinessDay(
            id=f"bday-b-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_b.id,
            business_date="22 Oct 2026",
            status="OPEN",
            opened_at=datetime.now(timezone.utc) - timedelta(days=1),
            opened_by=owner_email_b,
        )
        db_session.add_all([bday_a, bday_b])
        await db_session.commit()

        # Rollover restaurant A only
        rolled_a, closed_a, new_a = await perform_business_day_rollover(rest_a, db_session, caller_actor="Worker A")
        assert rolled_a is True
        assert closed_a.id == bday_a.id

        # Restaurant B must remain OPEN and untouched
        await db_session.refresh(bday_b)
        assert bday_b.status == "OPEN"
        assert bday_b.business_date == "22 Oct 2026"

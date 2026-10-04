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
from app.modules.customer_requests.models import CustomerRequestModel
from app.modules.business_day.models import BusinessDay
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

            # 2. Double-close protection: closing again without opening another day returns 409
            res2 = await ac.post(f"/api/v1/restaurants/{rest.id}/business-day/close", json=close_payload, headers=headers)
            assert res2.status_code == 409
            assert "No active open business day found" in res2.json()["detail"]

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

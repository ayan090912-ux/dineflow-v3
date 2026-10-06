import pytest
import uuid
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table, TableSession
from app.modules.orders.models import Order, Bill


@pytest.mark.asyncio
class TestKitchenWaiterDeliveryAndBilling:

    async def _setup_restaurant_and_tokens(self, db: AsyncSession):
        rest_id = f"rest-test-{uuid.uuid4().hex[:6]}"
        rest = Restaurant(
            id=rest_id,
            name="Delivery & Billing Test Bistro",
            slug=f"deliv-test-{uuid.uuid4().hex[:6]}",
            public_slug=f"deliv-test-{uuid.uuid4().hex[:6]}",
            owner_uid=f"uid_{uuid.uuid4().hex[:6]}",
            owner_email=f"owner_{uuid.uuid4().hex[:6]}@test.com",
            status="ACTIVE",
            lifecycle_status="LIVE",
            has_kitchen=True,
            has_waiter=True,
        )
        db.add(rest)

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
        await db.refresh(rest)
        await db.refresh(table)
        await db.refresh(session)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Login Chef
            chef_login = await ac.post("/api/v1/auth/terminal-login", json={
                "restaurant_id": rest_id,
                "identifier": "Head Chef",
                "passcode": "1234",
                "role": "CHEF"
            })
            assert chef_login.status_code == 200, chef_login.text
            chef_token = chef_login.json()["access_token"]

            # Login Waiter
            waiter_login = await ac.post("/api/v1/auth/terminal-login", json={
                "restaurant_id": rest_id,
                "identifier": "Floor Waiter",
                "passcode": "1234",
                "role": "WAITER"
            })
            assert waiter_login.status_code == 200, waiter_login.text
            waiter_token = waiter_login.json()["access_token"]

        return {
            "rest": rest,
            "table": table,
            "session": session,
            "chef_token": chef_token,
            "waiter_token": waiter_token,
        }

    async def test_kitchen_can_mark_ready_but_cannot_mark_delivered(self, db_session: AsyncSession):
        data = await self._setup_restaurant_and_tokens(db_session)
        rest = data["rest"]
        chef_token = data["chef_token"]
        waiter_token = data["waiter_token"]

        # Create an order
        order = Order(
            id=f"ord-{uuid.uuid4().hex[:8]}",
            restaurant_id=rest.id,
            table_id=data["table"].id,
            table_number="Table 01",
            table_session_id=data["session"].id,
            status="PREPARING",
            kitchen_status="PREPARING",
            total_amount=500.0,
            items_json=[{"id": "item-1", "name": "Pasta", "quantity": 1, "price": 500.0, "station": "KITCHEN"}],
        )
        db_session.add(order)
        await db_session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            chef_headers = {"Authorization": f"Bearer {chef_token}"}

            # 1. Kitchen marks READY -> Expected: 200 OK
            ready_resp = await ac.put(
                f"/api/v1/orders/{order.id}/status",
                json={"status": "READY", "kitchenStatus": "READY"},
                headers=chef_headers
            )
            assert ready_resp.status_code == 200, ready_resp.text
            order_data = ready_resp.json()
            assert order_data["status"] == "READY"
            assert order_data["kitchenStatus"] == "READY"

            # 2. Kitchen attempts to mark DELIVERED -> Expected: 403 Forbidden!
            deliver_try = await ac.put(
                f"/api/v1/orders/{order.id}/status",
                json={"status": "DELIVERED"},
                headers=chef_headers
            )
            assert deliver_try.status_code == 403
            assert "Kitchen staff cannot deliver orders to tables" in deliver_try.json()["detail"]

            # 3. Waiter marks DELIVERED -> Expected: 200 OK
            waiter_headers = {"Authorization": f"Bearer {waiter_token}"}
            waiter_deliver = await ac.put(
                f"/api/v1/orders/{order.id}/status",
                json={"status": "DELIVERED", "kitchenStatus": "COMPLETED"},
                headers=waiter_headers
            )
            assert waiter_deliver.status_code == 200, waiter_deliver.text
            assert waiter_deliver.json()["status"] == "DELIVERED"

    async def test_customer_cannot_fabricate_paid_status(self, db_session: AsyncSession):
        data = await self._setup_restaurant_and_tokens(db_session)
        rest = data["rest"]

        bill = Bill(
            id=f"bill-{uuid.uuid4().hex[:8]}",
            restaurant_id=rest.id,
            table_id=data["table"].id,
            table_number="Table 01",
            table_session_id=data["session"].id,
            status="OPEN",
            subtotal=500.0,
            tax_amount=25.0,
            grand_total=525.0,
            payment_status="UNPAID",
        )
        db_session.add(bill)
        await db_session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Customer reports payment via customer endpoint
            report_resp = await ac.post(
                f"/api/v1/restaurants/{rest.id}/billing/{bill.id}/report-customer-payment",
                json={
                    "payment_method": "UPI",
                    "table_session_id": data["session"].id,
                    "amount": 525.0
                }
            )
            assert report_resp.status_code == 200, report_resp.text
            resp_json = report_resp.json()
            # Must NOT be marked PAID directly
            assert resp_json["paymentStatus"] == "PAYMENT_AWAITING_CONFIRMATION"
            assert resp_json["status"] == "OPEN"

    async def test_authorized_staff_records_payment_and_closes_table(self, db_session: AsyncSession):
        data = await self._setup_restaurant_and_tokens(db_session)
        rest = data["rest"]
        waiter_token = data["waiter_token"]

        bill = Bill(
            id=f"bill-{uuid.uuid4().hex[:8]}",
            restaurant_id=rest.id,
            table_id=data["table"].id,
            table_number="Table 01",
            table_session_id=data["session"].id,
            status="OPEN",
            subtotal=500.0,
            tax_amount=25.0,
            grand_total=525.0,
            payment_status="UNPAID",
        )
        db_session.add(bill)
        await db_session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            waiter_headers = {"Authorization": f"Bearer {waiter_token}"}

            # 1. Attempting to close table with unpaid active bill should be rejected
            close_fail = await ac.post(
                f"/api/v1/restaurants/{rest.id}/tables/{data['table'].id}/close-session",
                json={"table_session_id": data["session"].id},
                headers=waiter_headers
            )
            assert close_fail.status_code == 400
            assert "unpaid" in close_fail.json()["detail"].lower()

            # 2. Staff records authorized manual payment (Cash / UPI)
            pay_resp = await ac.post(
                f"/api/v1/restaurants/{rest.id}/billing/{bill.id}/pay",
                json={
                    "payment_method": "CASH",
                    "verified_by": "Floor Waiter",
                    "payment_reference": "CASH-1234"
                },
                headers=waiter_headers
            )
            assert pay_resp.status_code == 200, pay_resp.text
            paid_bill = pay_resp.json()
            assert paid_bill["paymentStatus"] == "PAID"
            assert paid_bill["status"] in ["PAID", "CLOSED", "success"]
            assert (paid_bill.get("bill", {}).get("status") or paid_bill.get("billStatus")) in ["PAID", "CLOSED"]

            # 3. Now closing the table session should succeed
            close_success = await ac.post(
                f"/api/v1/restaurants/{rest.id}/tables/{data['table'].id}/close-session",
                json={"table_session_id": data["session"].id},
                headers=waiter_headers
            )
            assert close_success.status_code == 200, close_success.text
            table_data = close_success.json()
            assert table_data["status"] == "success"
            assert table_data["isOccupied"] is False

            # Verify table state in database
            tbl_res = await db_session.execute(select(Table).where(Table.id == data["table"].id))
            tbl_obj = tbl_res.scalar_one()
            assert tbl_obj.status == "AVAILABLE"
            assert tbl_obj.is_occupied is False

    async def test_historical_unpaid_bill_does_not_block_current_session(self, db_session: AsyncSession):
        data = await self._setup_restaurant_and_tokens(db_session)
        rest = data["rest"]
        waiter_token = data["waiter_token"]
        table = data["table"]
        curr_session = data["session"]

        # An old session for this table that was closed previously with an unpaid bill
        old_session = TableSession(
            id=f"sess-old-{uuid.uuid4().hex[:8]}",
            restaurant_id=rest.id,
            table_id=table.id,
            table_number="Table 01",
            status="CLOSED",
        )
        db_session.add(old_session)

        old_unpaid_bill = Bill(
            id=f"bill-old-{uuid.uuid4().hex[:8]}",
            restaurant_id=rest.id,
            table_id=table.id,
            table_number="Table 01",
            table_session_id=old_session.id,
            status="OPEN",
            subtotal=300.0,
            grand_total=300.0,
            payment_status="UNPAID",
        )
        db_session.add(old_unpaid_bill)

        # Current session has NO unpaid bill
        await db_session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            waiter_headers = {"Authorization": f"Bearer {waiter_token}"}
            # Current session close must NOT be blocked by historical session's unpaid bill
            close_resp = await ac.post(
                f"/api/v1/restaurants/{rest.id}/tables/{table.id}/close-session",
                json={"table_session_id": curr_session.id},
                headers=waiter_headers
            )
            assert close_resp.status_code == 200, close_resp.text
            assert close_resp.json()["status"] == "success"

    async def test_bar_role_cannot_deliver_order(self, db_session: AsyncSession):
        data = await self._setup_restaurant_and_tokens(db_session)
        rest = data["rest"]

        order = Order(
            id=f"ord-{uuid.uuid4().hex[:8]}",
            restaurant_id=rest.id,
            table_id=data["table"].id,
            table_number="Table 01",
            status="READY",
            kitchen_status="READY",
            total_amount=200.0,
            items_json=[{"id": "item-1", "name": "Cocktail", "quantity": 1, "station": "BAR"}],
        )
        db_session.add(order)
        await db_session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Login Bar staff
            bar_login = await ac.post("/api/v1/auth/terminal-login", json={
                "restaurant_id": rest.id,
                "identifier": "Bartender",
                "passcode": "1234",
                "role": "BARTENDER"
            })
            assert bar_login.status_code == 200, bar_login.text
            bar_token = bar_login.json()["access_token"]
            bar_headers = {"Authorization": f"Bearer {bar_token}"}

            # Bartender attempts to mark DELIVERED -> Expected: 403 Forbidden
            deliver_try = await ac.put(
                f"/api/v1/orders/{order.id}/status",
                json={"status": "DELIVERED"},
                headers=bar_headers
            )
            assert deliver_try.status_code == 403
            assert "not authorized to deliver" in deliver_try.json()["detail"].lower()

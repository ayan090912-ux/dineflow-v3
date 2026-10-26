import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone
import uuid

from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.orders.models import Order
from app.core.security.jwt import create_access_token


@pytest.mark.asyncio
async def test_operational_workflow_simplification_and_optional_eta(db_session):
    """
    Test suite verifying operational workflow simplification:
    1. Kitchen 1-click start preparing: ETA is strictly optional (no fake 15m default invented).
    2. Optional ETA: when provided, eta_target_timestamp is correctly computed.
    3. Multi-station independence:
       - Food ready + Drink preparing => overall status remains PREPARING (not falsely READY).
       - Both stations ready => overall status becomes READY.
       - Delivering via waiter marks order DELIVERED without altering billing totals.
    4. Tenant isolation is strictly enforced.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Setup Test Restaurant and Staff
        rest_id = f"test-os-simplification-{uuid.uuid4().hex[:6]}"
        rest = Restaurant(
            id=rest_id,
            name="Workflow Test Lounge",
            slug=rest_id,
            business_type="RESTAURANT_BAR",
            has_kitchen=True,
            has_bar=True,
            has_hookah=True,
            owner_uid="owner-simplification-1",
            currency="INR (₹)",
            is_approved=True,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(rest)

        # Staff Tokens
        chef_token = create_access_token(
            subject=uuid.uuid4(),
            scope="CHEF",
            extra_claims={
                "uid": "chef-1",
                "email": "chef@workflow.test",
                "role": "CHEF",
                "restaurant_id": rest_id,
            },
        )
        bartender_token = create_access_token(
            subject=uuid.uuid4(),
            scope="BAR",
            extra_claims={
                "uid": "bar-1",
                "email": "bar@workflow.test",
                "role": "BAR",
                "restaurant_id": rest_id,
            },
        )
        waiter_token = create_access_token(
            subject=uuid.uuid4(),
            scope="WAITER",
            extra_claims={
                "uid": "waiter-1",
                "email": "waiter@workflow.test",
                "role": "WAITER",
                "restaurant_id": rest_id,
            },
        )

        await db_session.commit()

        # 2. Kitchen Terminal Workflow: Optional ETA
        order_1_id = f"ord-k-eta-{uuid.uuid4().hex[:6]}"
        order_1 = Order(
            id=order_1_id,
            restaurant_id=rest_id,
            table_number="T1",
            customer_name="Priya",
            status="PENDING",
            kitchen_status="PENDING",
            items_json=[
                {"name": "Paneer Tikka", "quantity": 1, "price": 320.0, "station": "KITCHEN"}
            ],
            total_amount=320.0,
            subtotal=320.0,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(order_1)
        await db_session.commit()

        # Step 2A: Chef 1-click Start Preparing WITHOUT setting ETA
        res = await client.put(
            f"/api/v1/orders/{order_1_id}/status",
            json={"kitchenStatus": "PREPARING"},
            headers={"Authorization": f"Bearer {chef_token}"},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["kitchen_status"] == "PREPARING"
        # ETA target MUST NOT be invented when staff do not set one!
        assert data.get("eta_target_timestamp") is None, "Backend must not invent a default 15m ETA!"

        # Step 2B: Chef sets optional ETA (+12 mins)
        res_eta = await client.put(
            f"/api/v1/orders/{order_1_id}/status",
            json={"kitchenStatus": "PREPARING", "estimatedPrepTimeMinutes": 12},
            headers={"Authorization": f"Bearer {chef_token}"},
        )
        assert res_eta.status_code == 200, res_eta.text
        data_eta = res_eta.json()
        assert data_eta.get("eta_target_timestamp") is not None
        assert data_eta.get("estimated_prep_time_minutes") == 12

        # 3. Multi-Station Order Independence (Food + Drink)
        order_2_id = f"ord-multi-{uuid.uuid4().hex[:6]}"
        order_2 = Order(
            id=order_2_id,
            restaurant_id=rest_id,
            table_number="T2",
            customer_name="Rahul",
            status="PREPARING",
            kitchen_status="PREPARING",
            bar_status="PREPARING",
            items_json=[
                {"name": "Butter Chicken", "quantity": 1, "price": 450.0, "station": "KITCHEN"},
                {"name": "Mojito", "quantity": 2, "price": 300.0, "station": "BAR"},
            ],
            total_amount=1050.0,
            subtotal=1050.0,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(order_2)
        await db_session.commit()

        # Step 3A: Kitchen marks food READY, but drinks are still PREPARING at the bar
        res_k_ready = await client.put(
            f"/api/v1/orders/{order_2_id}/status",
            json={"kitchenStatus": "READY"},
            headers={"Authorization": f"Bearer {chef_token}"},
        )
        assert res_k_ready.status_code == 200
        data_k = res_k_ready.json()
        assert data_k["kitchen_status"] == "READY"
        assert data_k["bar_status"] == "PREPARING"
        # Overall status MUST NOT be reported as READY while drinks are unfinished!
        assert data_k["status"] == "PREPARING", "Order with pending drinks must not be overall READY!"

        # Step 3B: Bar marks drinks READY -> Now both stations are ready, overall order becomes READY
        res_b_ready = await client.put(
            f"/api/v1/orders/{order_2_id}/status",
            json={"barStatus": "READY"},
            headers={"Authorization": f"Bearer {bartender_token}"},
        )
        assert res_b_ready.status_code == 200
        data_b = res_b_ready.json()
        assert data_b["kitchen_status"] == "READY"
        assert data_b["bar_status"] == "READY"
        assert data_b["status"] == "READY", "Overall order must become READY once all required stations are ready!"

        # Step 3C: Waiter delivers order to table
        res_deliv = await client.put(
            f"/api/v1/orders/{order_2_id}/status",
            json={"status": "DELIVERED"},
            headers={"Authorization": f"Bearer {waiter_token}"},
        )
        assert res_deliv.status_code == 200
        data_deliv = res_deliv.json()
        assert data_deliv["status"] == "DELIVERED"
        assert data_deliv["delivery_status"] == "DELIVERED"
        # Financial total remains intact
        assert data_deliv["total_amount"] == 1050.0

        # 4. Multi-Tenant Isolation: Another restaurant staff cannot access or mutate order
        foreign_token = create_access_token(
            subject=uuid.uuid4(),
            scope="CHEF",
            extra_claims={
                "uid": "foreign-chef",
                "email": "foreign@other.com",
                "role": "CHEF",
                "restaurant_id": "other-restaurant-999",
            },
        )
        res_isolated = await client.put(
            f"/api/v1/orders/{order_2_id}/status",
            json={"kitchenStatus": "COMPLETED"},
            headers={"Authorization": f"Bearer {foreign_token}"},
        )
        assert res_isolated.status_code == 403, "Cross-tenant mutation must be rejected with 403 Forbidden"

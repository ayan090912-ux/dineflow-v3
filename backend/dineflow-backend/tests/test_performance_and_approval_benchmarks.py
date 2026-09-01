import asyncio
import time
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.modules.restaurants.models import Restaurant
from app.core.database.connection import AsyncSessionLocal
from app.core.security.rbac import require_platform_admin

MOCK_ADMIN_CLAIMS = {
    "uid": "admin_perf_test_uid",
    "user_id": "admin_perf_test_uid",
    "email": "ayan090912@gmail.com",
    "admin": True,
    "role": "PLATFORM_ADMIN"
}

@pytest.mark.asyncio
async def test_performance_and_approval_benchmarks():
    app.dependency_overrides[require_platform_admin] = lambda: MOCK_ADMIN_CLAIMS
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Benchmark: Restaurant Onboarding / Creation
        t0 = time.perf_counter()
        create_res = await client.post("/api/v1/restaurants", json={
            "name": "The Grand Performance Bistro",
            "cuisine": "Modern European",
            "business_type": "RESTAURANT",
            "owner_name": "Test Owner",
            "owner_email": "perf_owner@dinely.food",
            "has_kitchen": True,
            "has_waiter": True,
            "has_bar": True,
            "has_tables": True,
            "tables_count": 8,
        })
        t_create = (time.perf_counter() - t0) * 1000
        assert create_res.status_code == 201
        rest_data = create_res.json()
        rest_id = rest_data["id"]
        print(f"\n[BENCHMARK] Restaurant Creation: {t_create:.2f}ms")
        assert t_create < 500, f"Creation too slow: {t_create}ms"

        # 2. Benchmark: Platform Admin Approval
        t0 = time.perf_counter()
        approve_res = await client.post("/api/v1/admin/restaurants/approve", json={
            "restaurant_id": rest_id
        })
        t_approve = (time.perf_counter() - t0) * 1000
        assert approve_res.status_code == 200
        approve_data = approve_res.json()
        assert approve_data["status"] == "SUCCESS"
        assert approve_data["lifecycleStatus"] == "LIVE"
        assert approve_data["isApproved"] is True
        print(f"[BENCHMARK] Platform Admin Approval: {t_approve:.2f}ms")
        assert t_approve < 300, f"Approval too slow: {t_approve}ms"

        # 3. Benchmark: Idempotent duplicate approval
        t0 = time.perf_counter()
        dup_approve_res = await client.post("/api/v1/admin/restaurants/approve", json={
            "restaurant_id": rest_id
        })
        t_dup_approve = (time.perf_counter() - t0) * 1000
        assert dup_approve_res.status_code == 200
        assert dup_approve_res.json()["status"] == "SUCCESS"
        assert dup_approve_res.json().get("already_approved") is True
        print(f"[BENCHMARK] Duplicate Idempotent Approval: {t_dup_approve:.2f}ms")
        assert t_dup_approve < 100, f"Duplicate approval too slow: {t_dup_approve}ms"

        # 4. Benchmark: Table read endpoint (without write transaction lock)
        t0 = time.perf_counter()
        tbl_res = await client.get(f"/api/v1/restaurants/{rest_id}/tables")
        t_tables = (time.perf_counter() - t0) * 1000
        assert tbl_res.status_code == 200
        print(f"[BENCHMARK] Tables Fetch (Read-Optimized): {t_tables:.2f}ms")
        assert t_tables < 150, f"Tables read too slow: {t_tables}ms"

        # 5. Benchmark: Orders Fetch with Limits
        t0 = time.perf_counter()
        orders_res = await client.get(f"/api/v1/orders/restaurant/{rest_id}?limit=50")
        t_orders = (time.perf_counter() - t0) * 1000
        assert orders_res.status_code == 200
        print(f"[BENCHMARK] Paginated Orders Fetch: {t_orders:.2f}ms")
        assert t_orders < 150, f"Orders read too slow: {t_orders}ms"

        # 6. Benchmark: Billing Config Lookups (Optimized Single OR Query)
        t0 = time.perf_counter()
        billing_res = await client.get(f"/api/v1/restaurants/{rest_id}/billing/config")
        t_billing = (time.perf_counter() - t0) * 1000
        assert billing_res.status_code == 200
        print(f"[BENCHMARK] Billing Config Lookup: {t_billing:.2f}ms")
        assert t_billing < 150, f"Billing lookup too slow: {t_billing}ms"

    app.dependency_overrides.pop(require_platform_admin, None)

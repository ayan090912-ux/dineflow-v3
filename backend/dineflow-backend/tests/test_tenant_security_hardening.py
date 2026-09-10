import json
import base64
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from app.main import app
from app.core.config.settings import get_settings
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table, TableSession
from app.modules.orders.models import Order, Bill

client = TestClient(app)
settings = get_settings()


def create_fake_jwt(claims: dict) -> str:
    """Helper to encode an un-signed base64 JSON payload for test token simulation."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_test_signature"
    return f"{header}.{payload}.{signature}"


@pytest.mark.asyncio
class TestTenantSecurityHardening:

    async def _seed_test_restaurants(self, db_session):
        """Seed two distinct isolated tenants for cross-tenant testing."""
        rest_a = Restaurant(
            id="tenant-a-id",
            name="Restaurant Alpha",
            slug="tenant-a",
            public_slug="tenant-a",
            owner_uid="uid_owner_alpha",
            owner_email="owner.alpha@dinely.food",
            lifecycle_status="LIVE"
        )
        rest_b = Restaurant(
            id="tenant-b-id",
            name="Restaurant Beta",
            slug="tenant-b",
            public_slug="tenant-b",
            owner_uid="uid_owner_beta",
            owner_email="owner.beta@dinely.food",
            lifecycle_status="LIVE"
        )
        db_session.add(rest_a)
        db_session.add(rest_b)
        await db_session.commit()

    # =========================================================================
    # 1. Orders Endpoint Multi-Tenant Isolation
    # =========================================================================

    def test_orders_unauthenticated_returns_401(self):
        res = client.get("/api/v1/orders/restaurant/tenant-a-id")
        assert res.status_code == 401
        assert "Authentication credentials are required" in res.json().get("detail", "")

    async def test_orders_cross_tenant_owner_returns_403(self, db_session):
        await self._seed_test_restaurants(db_session)
        # Owner of Restaurant B attempts to access orders for Restaurant A
        token_b = create_fake_jwt({
            "uid": "uid_owner_beta",
            "email": "owner.beta@dinely.food",
            "role": "RESTAURANT_OWNER"
        })
        res = client.get(
            "/api/v1/orders/restaurant/tenant-a-id",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res.status_code == 403
        assert "Access denied" in res.json().get("detail", "")

    async def test_orders_authorized_owner_returns_200(self, db_session):
        await self._seed_test_restaurants(db_session)
        # Owner of Restaurant A accesses orders for Restaurant A
        token_a = create_fake_jwt({
            "uid": "uid_owner_alpha",
            "email": "owner.alpha@dinely.food",
            "role": "RESTAURANT_OWNER"
        })
        res = client.get(
            "/api/v1/orders/restaurant/tenant-a-id",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    async def test_orders_cross_tenant_staff_returns_403(self, db_session):
        await self._seed_test_restaurants(db_session)
        # Staff of Restaurant B attempts to access orders for Restaurant A
        token_staff_b = create_fake_jwt({
            "uid": "staff-b-1",
            "role": "WAITER",
            "restaurant_id": "tenant-b-id"
        })
        res = client.get(
            "/api/v1/orders/restaurant/tenant-a-id",
            headers={
                "Authorization": f"Bearer {token_staff_b}",
                "X-Staff-Role": "WAITER",
                "X-Staff-Restaurant-Id": "tenant-b-id"
            }
        )
        assert res.status_code == 403

    # =========================================================================
    # 2. Customer Requests (Waiter Calls) Multi-Tenant Isolation
    # =========================================================================

    def test_customer_requests_unauthenticated_returns_401(self):
        res = client.get("/api/v1/customer-requests?restaurant_id=tenant-a-id")
        assert res.status_code == 401

    async def test_customer_requests_cross_tenant_returns_403(self, db_session):
        await self._seed_test_restaurants(db_session)
        token_b = create_fake_jwt({
            "uid": "uid_owner_beta",
            "email": "owner.beta@dinely.food",
            "role": "RESTAURANT_OWNER"
        })
        res = client.get(
            "/api/v1/customer-requests?restaurant_id=tenant-a-id",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res.status_code == 403

    async def test_customer_requests_authorized_owner_returns_200(self, db_session):
        await self._seed_test_restaurants(db_session)
        token_a = create_fake_jwt({
            "uid": "uid_owner_alpha",
            "email": "owner.alpha@dinely.food",
            "role": "RESTAURANT_OWNER"
        })
        res = client.get(
            "/api/v1/customer-requests?restaurant_id=tenant-a-id",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res.status_code == 200

    # =========================================================================
    # 3. Billing & Financial Data Multi-Tenant Isolation
    # =========================================================================

    def test_billing_bills_unauthenticated_returns_401(self):
        res = client.get("/api/v1/restaurants/tenant-a-id/billing/bills")
        assert res.status_code == 401

    async def test_billing_bills_cross_tenant_returns_403(self, db_session):
        await self._seed_test_restaurants(db_session)
        token_b = create_fake_jwt({
            "uid": "uid_owner_beta",
            "email": "owner.beta@dinely.food",
            "role": "RESTAURANT_OWNER"
        })
        res = client.get(
            "/api/v1/restaurants/tenant-a-id/billing/bills",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res.status_code == 403

    async def test_billing_bills_authorized_owner_returns_200(self, db_session):
        await self._seed_test_restaurants(db_session)
        token_a = create_fake_jwt({
            "uid": "uid_owner_alpha",
            "email": "owner.alpha@dinely.food",
            "role": "RESTAURANT_OWNER"
        })
        res = client.get(
            "/api/v1/restaurants/tenant-a-id/billing/bills",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res.status_code == 200

    def test_billing_close_table_unauthenticated_returns_401(self):
        res = client.post("/api/v1/restaurants/tenant-a-id/billing/bill-999/close-table")
        assert res.status_code == 401

    async def test_billing_close_table_cross_tenant_returns_403(self, db_session):
        await self._seed_test_restaurants(db_session)
        token_b = create_fake_jwt({
            "uid": "uid_owner_beta",
            "email": "owner.beta@dinely.food",
            "role": "RESTAURANT_OWNER"
        })
        res = client.post(
            "/api/v1/restaurants/tenant-a-id/billing/bill-999/close-table",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res.status_code == 403

    # =========================================================================
    # 4. Unknown Tenant Access Returns 404
    # =========================================================================

    async def test_unknown_tenant_returns_404(self, db_session):
        token_a = create_fake_jwt({
            "uid": "uid_owner_alpha",
            "email": "owner.alpha@dinely.food",
            "role": "RESTAURANT_OWNER"
        })
        res = client.get(
            "/api/v1/orders/restaurant/non-existent-restaurant-id",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res.status_code == 404

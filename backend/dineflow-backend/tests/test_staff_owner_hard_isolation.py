import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from jose import jwt as jose_jwt

from app.main import app
from app.core.config.settings import get_settings

settings = get_settings()

@pytest.mark.asyncio
async def test_staff_hard_blocked_from_owner_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest_id = f"rest-iso-{uuid.uuid4().hex[:6]}"
        owner_uid = f"owner-{uuid.uuid4().hex[:6]}"

        token_owner = jose_jwt.encode(
            {"sub": owner_uid, "role": "OWNER", "restaurant_id": rest_id, "scope": "OWNER"},
            settings.JWT_ACCESS_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM
        )
        headers_owner = {"Authorization": f"Bearer {token_owner}"}

        # 1. Create restaurant
        r_create = await client.post(
            "/api/v1/restaurants",
            json={"id": rest_id, "name": "Hard Isolation Bistro", "ownerUid": owner_uid},
            headers=headers_owner
        )
        assert r_create.status_code in [200, 201]

        # 2. Owner creates real waiter staff account
        username = f"waiter_{uuid.uuid4().hex[:6]}"
        pw = "WaiterPass123!"
        r_staff = await client.post(
            f"/api/v1/restaurants/{rest_id}/staff",
            json={
                "name": "Waiter Jack",
                "username": username,
                "password": pw,
                "role": "WAITER",
                "terminal": "WAITER-01",
                "isActive": True
            },
            headers=headers_owner
        )
        assert r_staff.status_code == 201

        # 3. Staff logs in via /staff/auth/login
        r_login = await client.post(
            "/api/v1/staff/auth/login",
            json={"username": username, "password": pw}
        )
        assert r_login.status_code == 200
        staff_data = r_login.json()
        waiter_token = staff_data["access_token"]
        headers_waiter = {"Authorization": f"Bearer {waiter_token}"}

        # =====================================================================
        # SECURITY CHECKS: WAITER ATTEMPTING OWNER ENDPOINTS MUST BE REJECTED 403
        # =====================================================================

        # A. Staff list management (GET /staff) -> MUST BE 403
        r_get_staff = await client.get(
            f"/api/v1/restaurants/{rest_id}/staff",
            headers=headers_waiter
        )
        assert r_get_staff.status_code == 403, f"Expected 403, got {r_get_staff.status_code}"

        # B. Staff creation (POST /staff) -> MUST BE 403
        r_post_staff = await client.post(
            f"/api/v1/restaurants/{rest_id}/staff",
            json={"name": "Attacker", "username": "attacker01", "password": "xyz", "role": "WAITER"},
            headers=headers_waiter
        )
        assert r_post_staff.status_code == 403, f"Expected 403, got {r_post_staff.status_code}"

        # C. Owner context (GET /owner-context) -> MUST BE 403
        r_owner_ctx = await client.get(
            f"/api/v1/restaurants/{rest_id}/owner-context",
            headers=headers_waiter
        )
        assert r_owner_ctx.status_code == 403, f"Expected 403, got {r_owner_ctx.status_code}"

        # D. Taxes management (POST /restaurants/{id}/taxes) -> MUST BE 403
        r_taxes = await client.post(
            f"/api/v1/restaurants/{rest_id}/taxes",
            json={"name": "VAT", "type": "PERCENTAGE", "rate": 5.0},
            headers=headers_waiter
        )
        assert r_taxes.status_code == 403, f"Expected 403, got {r_taxes.status_code}"

        # E. Query owner workspaces (GET /restaurants/owner/my) -> MUST BE EMPTY []
        r_owner_my = await client.get(
            "/api/v1/restaurants/owner/my",
            headers=headers_waiter
        )
        assert r_owner_my.status_code == 200
        assert r_owner_my.json() == [], "Staff token must NEVER return owner restaurants!"

        # F. Cross-tenant access to another existing restaurant's operational endpoints -> MUST BE 403
        other_rest_id = f"rest-other-{uuid.uuid4().hex[:6]}"
        other_owner_uid = f"owner-other-{uuid.uuid4().hex[:6]}"
        token_other_owner = jose_jwt.encode(
            {"sub": other_owner_uid, "role": "OWNER", "restaurant_id": other_rest_id, "scope": "OWNER"},
            settings.JWT_ACCESS_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM
        )
        await client.post(
            "/api/v1/restaurants",
            json={"id": other_rest_id, "name": "Other Restaurant", "ownerUid": other_owner_uid},
            headers={"Authorization": f"Bearer {token_other_owner}"}
        )

        r_cross = await client.post(
            f"/api/v1/restaurants/{other_rest_id}/tables/tbl-1/close-session",
            json={},
            headers=headers_waiter
        )
        assert r_cross.status_code == 403, f"Cross-tenant access must be 403, got {r_cross.status_code}"

        # G. Genuine Owner must still have full access
        r_owner_check = await client.get(
            f"/api/v1/restaurants/{rest_id}/staff",
            headers=headers_owner
        )
        assert r_owner_check.status_code == 200, f"Owner must be 200, got {r_owner_check.status_code}"

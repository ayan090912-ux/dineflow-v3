import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.config.settings import get_settings
from jose import jwt as jose_jwt

settings = get_settings()

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.mark.asyncio
async def test_staff_account_lifecycle_and_security():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Setup two distinct restaurants with owners
        rest_a_id = f"rest-staff-a-{uuid.uuid4().hex[:6]}"
        rest_b_id = f"rest-staff-b-{uuid.uuid4().hex[:6]}"

        owner_a_uid = f"owner-a-{uuid.uuid4().hex[:6]}"
        owner_b_uid = f"owner-b-{uuid.uuid4().hex[:6]}"

        token_owner_a = jose_jwt.encode(
            {"sub": owner_a_uid, "role": "OWNER", "restaurant_id": rest_a_id},
            settings.JWT_ACCESS_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM
        )
        token_owner_b = jose_jwt.encode(
            {"sub": owner_b_uid, "role": "OWNER", "restaurant_id": rest_b_id},
            settings.JWT_ACCESS_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM
        )

        headers_owner_a = {"Authorization": f"Bearer {token_owner_a}"}
        headers_owner_b = {"Authorization": f"Bearer {token_owner_b}"}

        # Create restaurants
        r_create_a = await client.post(
            "/api/v1/restaurants",
            json={"id": rest_a_id, "name": "Restaurant Alpha", "ownerUid": owner_a_uid},
            headers=headers_owner_a
        )
        assert r_create_a.status_code in [200, 201]

        r_create_b = await client.post(
            "/api/v1/restaurants",
            json={"id": rest_b_id, "name": "Restaurant Beta", "ownerUid": owner_b_uid},
            headers=headers_owner_b
        )
        assert r_create_b.status_code in [200, 201]

        # 2. Owner of Restaurant A creates real staff account
        unique_username = f"rahul_{uuid.uuid4().hex[:6]}"
        staff_payload = {
            "name": "Rahul Sharma",
            "username": unique_username,
            "password": "SecurePassword123!",
            "role": "WAITER",
            "terminal": "WAITER-01",
            "isActive": True
        }
        res_create_staff = await client.post(
            f"/api/v1/restaurants/{rest_a_id}/staff",
            json=staff_payload,
            headers=headers_owner_a
        )
        assert res_create_staff.status_code == 201
        staff_data = res_create_staff.json()
        assert staff_data["username"] == unique_username.lower()
        assert staff_data["role"] == "WAITER"
        assert staff_data["terminal"] == "WAITER-01"
        assert staff_data["isActive"] is True
        membership_id = staff_data["id"]

        # 3. Test duplicate username rejection (case-insensitive 409 Conflict)
        res_dup = await client.post(
            f"/api/v1/restaurants/{rest_b_id}/staff",
            json={
                "name": "Another Person",
                "username": unique_username.upper(),
                "password": "Password456!",
                "role": "WAITER"
            },
            headers=headers_owner_b
        )
        assert res_dup.status_code == 409

        # 4. Test Cross-Tenant Owner Attack: Owner B cannot create staff for Restaurant A
        res_cross_create = await client.post(
            f"/api/v1/restaurants/{rest_a_id}/staff",
            json={
                "name": "Intruder Staff",
                "username": f"intruder_{uuid.uuid4().hex[:6]}",
                "password": "Password456!",
                "role": "WAITER"
            },
            headers=headers_owner_b
        )
        assert res_cross_create.status_code in [403, 404]

        # 5. Staff Login with ONLY username and password
        res_login = await client.post(
            "/api/v1/staff/auth/login",
            json={
                "username": unique_username,
                "password": "SecurePassword123!"
            }
        )
        assert res_login.status_code == 200
        login_data = res_login.json()
        staff_token = login_data["access_token"]
        assert login_data["staff_user_id"] == staff_data["staffUserId"]
        assert login_data["restaurant_id"] == rest_a_id
        assert login_data["role"] == "WAITER"
        assert login_data["terminal_id"] == "WAITER-01"
        assert login_data["target_route"] == "/waiter"

        staff_headers = {"Authorization": f"Bearer {staff_token}"}

        # 6. Verify GET /api/v1/staff/auth/me returns complete safe staff context
        res_me = await client.get("/api/v1/staff/auth/me", headers=staff_headers)
        assert res_me.status_code == 200
        me_data = res_me.json()
        assert me_data["staff_user_id"] == staff_data["staffUserId"]
        assert me_data["username"] == unique_username.lower()
        assert me_data["name"] == "Rahul Sharma"
        assert me_data["restaurant_id"] == rest_a_id
        assert me_data["role"] == "WAITER"
        assert me_data["terminal_id"] == "WAITER-01"
        assert me_data["portal"] == "waiter"
        assert me_data["status"].upper() == "ACTIVE"
        assert "password_hash" not in me_data

        # 7. Test Negative: Wrong password rejected
        res_wrong_pw = await client.post(
            "/api/v1/staff/auth/login",
            json={
                "username": unique_username,
                "password": "WrongPassword999!"
            }
        )
        assert res_wrong_pw.status_code == 401

        # 8. Test Negative: Cross-Tenant Isolation (Waiter from A cannot access B)
        res_cross_orders = await client.get(
            f"/api/v1/orders/restaurant/{rest_b_id}",
            headers=staff_headers
        )
        assert res_cross_orders.status_code in [403, 404]

        # 9. Test Role Security: WAITER cannot access Owner-only Staff Management
        res_staff_mgmt = await client.get(
            f"/api/v1/restaurants/{rest_a_id}/staff",
            headers=staff_headers
        )
        assert res_staff_mgmt.status_code == 403

        # 10. Test Staff Deactivation by Owner
        res_deact = await client.put(
            f"/api/v1/restaurants/{rest_a_id}/staff/{membership_id}",
            json={"isActive": False},
            headers=headers_owner_a
        )
        assert res_deact.status_code == 200

        # Login while inactive rejected
        res_login_inactive = await client.post(
            "/api/v1/staff/auth/login",
            json={
                "username": unique_username,
                "password": "SecurePassword123!"
            }
        )
        assert res_login_inactive.status_code == 403
        assert "deactivated" in res_login_inactive.json().get("detail", "").lower()

        # Existing token of deactivated account rejected on protected endpoint
        res_me_inactive = await client.get("/api/v1/staff/auth/me", headers=staff_headers)
        assert res_me_inactive.status_code == 403

        # 11. Reactivate staff account and change terminal
        res_react = await client.put(
            f"/api/v1/restaurants/{rest_a_id}/staff/{membership_id}",
            json={"isActive": True, "terminal": "WAITER-02"},
            headers=headers_owner_a
        )
        assert res_react.status_code == 200

        # Login again succeeds and reflects updated terminal
        res_relogin = await client.post(
            "/api/v1/staff/auth/login",
            json={
                "username": unique_username,
                "password": "SecurePassword123!"
            }
        )
        assert res_relogin.status_code == 200
        assert res_relogin.json()["terminal_id"] == "WAITER-02"

        # 12. Test Logout
        res_logout = await client.post("/api/v1/staff/auth/logout", headers={"Authorization": f"Bearer {res_relogin.json()['access_token']}"})
        assert res_logout.status_code == 200

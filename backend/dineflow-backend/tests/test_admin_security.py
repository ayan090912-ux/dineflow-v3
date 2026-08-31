import json
import base64
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config.settings import get_settings

client = TestClient(app)
settings = get_settings()


def create_fake_jwt(claims: dict) -> str:
    """Helper to encode an un-signed base64 JSON payload for testing token decoding."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_signature"
    return f"{header}.{payload}.{signature}"


class TestPlatformAdminAuthorization:

    def test_1_unauthenticated_request_returns_401(self):
        response = client.get("/api/v1/admin/restaurants")
        assert response.status_code == 401
        assert "Authorization header" in response.json()["detail"]

    def test_2_invalid_token_returns_401(self):
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": "Bearer invalid_garbage_token"}
        )
        assert response.status_code == 401

    def test_3_restaurant_owner_token_returns_403(self):
        owner_claims = {
            "uid": "uid_owner_999",
            "email": "owner@restaurant.com",
            "role": "RESTAURANT_OWNER",
            "admin": False
        }
        token = create_fake_jwt(owner_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
        assert "Forbidden" in response.json()["detail"]

    def test_4_waiter_token_returns_403(self):
        waiter_claims = {
            "uid": "uid_waiter_123",
            "email": "waiter@restaurant.com",
            "role": "WAITER",
            "admin": False
        }
        token = create_fake_jwt(waiter_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403

    def test_5_kitchen_token_returns_403(self):
        kitchen_claims = {
            "uid": "uid_chef_456",
            "email": "chef@restaurant.com",
            "role": "CHEF",
            "admin": False
        }
        token = create_fake_jwt(kitchen_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403

    def test_6_bar_token_returns_403(self):
        bar_claims = {
            "uid": "uid_bar_789",
            "email": "bartender@restaurant.com",
            "role": "BARTENDER",
            "admin": False
        }
        token = create_fake_jwt(bar_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403

    def test_7_inventory_token_returns_403(self):
        inv_claims = {
            "uid": "uid_inv_111",
            "email": "inventory@restaurant.com",
            "role": "INVENTORY_MANAGER",
            "admin": False
        }
        token = create_fake_jwt(inv_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403

    def test_8_customer_token_returns_403(self):
        cust_claims = {
            "uid": "uid_cust_333",
            "email": "guest@gmail.com",
            "role": "CUSTOMER",
            "admin": False
        }
        token = create_fake_jwt(cust_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403

    def test_9_fake_role_payload_returns_403(self):
        fake_claims = {
            "uid": "uid_hacker_777",
            "email": "hacker@gmail.com",
            "role": "PLATFORM_ADMIN",
            "admin": False
        }
        token = create_fake_jwt(fake_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403

    def test_10_similar_email_bypass_attempts_rejected(self):
        bypass_emails = [
            "ayan090912+test@gmail.com",
            "ayan090912@googlemail.com",
            "ayan090912@dinely.food",
            "ayan.admin@gmail.com",
            "another@gmail.com",
        ]
        for email in bypass_emails:
            claims = {
                "uid": f"uid_{email}",
                "email": email,
                "admin": True,
                "role": "PLATFORM_ADMIN"
            }
            token = create_fake_jwt(claims)
            response = client.get(
                "/api/v1/admin/restaurants",
                headers={"Authorization": f"Bearer {token}"}
            )
            assert response.status_code == 403, f"Expected 403 for {email}, got {response.status_code}"

    def test_11_authorized_platform_admin_ayan_returns_200(self):
        admin_claims = {
            "uid": "uid_real_admin_001",
            "email": "ayan090912@gmail.com",
            "email_verified": True,
            "admin": True,
            "role": "PLATFORM_ADMIN"
        }
        token = create_fake_jwt(admin_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_12_platform_admin_verify_token_endpoint(self):
        admin_claims = {
            "uid": "uid_real_admin_001",
            "email": "ayan090912@gmail.com",
            "email_verified": True,
            "admin": True,
            "role": "PLATFORM_ADMIN"
        }
        token = create_fake_jwt(admin_claims)
        response = client.post(
            "/api/v1/admin/verify-token",
            headers={"Authorization": f"Bearer {token}"},
            json={"id_token": token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is True
        assert data["role"] == "PLATFORM_ADMIN"

    def test_13_non_admin_cannot_mutate_platform_data(self):
        owner_claims = {
            "uid": "uid_owner_999",
            "email": "owner@restaurant.com",
            "role": "RESTAURANT_OWNER"
        }
        token = create_fake_jwt(owner_claims)

        # 1. Approve restaurant
        res1 = client.post(
            "/api/v1/admin/restaurants/approve",
            headers={"Authorization": f"Bearer {token}"},
            json={"restaurant_id": "rest-001"}
        )
        assert res1.status_code == 403

        # 2. Suspend restaurant
        res2 = client.post(
            "/api/v1/admin/restaurants/suspend",
            headers={"Authorization": f"Bearer {token}"},
            json={"restaurant_id": "rest-001", "reason": "test"}
        )
        assert res2.status_code == 403

        # 3. Suspend user
        res3 = client.post(
            "/api/v1/admin/users/suspend",
            headers={"Authorization": f"Bearer {token}"},
            json={"user_id": "usr-001", "reason": "test"}
        )
        assert res3.status_code == 403

    def test_14_admin_audit_logs_endpoint(self):
        admin_claims = {
            "uid": "uid_real_admin_001",
            "email": "ayan090912@gmail.com",
            "admin": True,
            "role": "PLATFORM_ADMIN"
        }
        token = create_fake_jwt(admin_claims)
        response = client.get(
            "/api/v1/admin/audit-logs",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

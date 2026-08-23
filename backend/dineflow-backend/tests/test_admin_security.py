import json
import base64
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config.settings import get_settings

client = TestClient(app)
settings = get_settings()


def create_fake_jwt(claims: dict) -> str:
    """Helper to encode a un-signed base64 JSON payload for testing decoding handling."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_signature"
    return f"{header}.{payload}.{signature}"


class TestPlatformAdminAuthorization:

    def test_unauthenticated_request_returns_401(self):
        response = client.get("/api/v1/admin/restaurants")
        assert response.status_code == 401
        assert "Authorization header" in response.json()["detail"]

    def test_invalid_token_returns_401(self):
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": "Bearer invalid_garbage_token"}
        )
        assert response.status_code == 401

    def test_restaurant_owner_token_returns_403(self):
        # A token for a standard restaurant owner without admin claims or admin UID
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

    def test_waiter_token_returns_403(self):
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

    def test_kitchen_token_returns_403(self):
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

    def test_bar_token_returns_403(self):
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

    def test_inventory_token_returns_403(self):
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

    def test_fake_role_in_request_ignored(self):
        # A non-admin account claiming role=PLATFORM_ADMIN without authorized UID/email or server claim
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

    def test_wrong_firebase_uid_returns_403(self):
        wrong_uid_claims = {
            "uid": "completely_wrong_uid_99999",
            "email": "imposter@gmail.com",
            "admin": False
        }
        token = create_fake_jwt(wrong_uid_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403

    def test_authorized_platform_admin_bootstrap_returns_200(self):
        # Admin identity matching PLATFORM_ADMIN_EMAIL bootstrap
        admin_claims = {
            "uid": "uid_real_admin_001",
            "email": settings.PLATFORM_ADMIN_EMAIL or "ayan090912@gmail.com",
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

    def test_platform_admin_verify_token_endpoint(self):
        admin_claims = {
            "uid": "uid_real_admin_001",
            "email": settings.PLATFORM_ADMIN_EMAIL or "ayan090912@gmail.com",
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

    def test_admin_audit_logs_endpoint(self):
        admin_claims = {
            "uid": "uid_real_admin_001",
            "email": settings.PLATFORM_ADMIN_EMAIL or "ayan090912@gmail.com",
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

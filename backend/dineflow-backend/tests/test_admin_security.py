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
            "email_verified": True,
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

    def test_15_password_login_endpoint_is_disabled(self):
        # Enforce that Platform Admin cannot be accessed via password authentication
        response = client.post(
            "/api/v1/auth/platform/login",
            json={"email": "ayan090912@gmail.com", "password": "any_password_123"}
        )
        assert response.status_code == 403
        assert "Password authentication is disabled" in response.json()["detail"]

    def test_16_websocket_admin_channel_unauthorized_is_rejected(self):
        # Non-admin attempting to connect to admin channel without valid credentials
        from fastapi.testclient import TestClient
        from starlette.websockets import WebSocketDisconnect
        
        # Test 1: No token
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect("/api/v1/ws?restaurant_id=__platform_admin__&role=PLATFORM_ADMIN") as ws:
                pass
        assert exc_info.value.code == 1008

        # Test 2: Non-admin token
        attacker_token = create_fake_jwt({"uid": "uid_hacker", "email": "attacker@gmail.com", "role": "PLATFORM_ADMIN"})
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect(f"/api/v1/ws?restaurant_id=__platform_admin__&role=PLATFORM_ADMIN&token={attacker_token}") as ws:
                pass
        assert exc_info.value.code == 1008

    def test_17_admin_authorized_via_env_emails_list(self):
        # Configure secondary admin email via PLATFORM_ADMIN_EMAILS
        orig_emails = settings.PLATFORM_ADMIN_EMAILS
        try:
            settings.PLATFORM_ADMIN_EMAILS = "ops-lead@dinely.food, security@dinely.food"
            admin_claims = {
                "uid": "uid_ops_lead",
                "email": "ops-lead@dinely.food",
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
        finally:
            settings.PLATFORM_ADMIN_EMAILS = orig_emails

    @pytest.mark.asyncio
    async def test_18_admin_in_db_table_without_allowlist_is_rejected_403(self):
        # Even if an admin record exists in PlatformAdmin DB table, if their email is not allowlisted,
        # they MUST be rejected with 403 Forbidden.
        from app.core.database.connection import get_db_session
        from app.modules.auth.models import PlatformAdmin
        import uuid

        test_email = f"db-admin-{uuid.uuid4().hex[:6]}@dinely.food"
        async with get_db_session() as session:
            admin_record = PlatformAdmin(
                email=test_email,
                password_hash="argon2_hashed_placeholder",
                full_name="Database Unallowlisted Admin",
                is_active=True
            )
            session.add(admin_record)
            await session.commit()

        admin_claims = {
            "uid": "uid_db_admin",
            "email": test_email,
            "email_verified": True,
            "admin": True,
            "role": "PLATFORM_ADMIN"
        }
        token = create_fake_jwt(admin_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
        assert "not authorized for Platform Admin" in response.json()["detail"]

    def test_19_unverified_email_for_ayan_is_rejected_403(self):
        # Even for ayan090912@gmail.com, unverified Google email must be rejected with 403
        admin_claims = {
            "uid": "uid_ayan_unverified",
            "email": "ayan090912@gmail.com",
            "email_verified": False,
            "admin": True,
            "role": "PLATFORM_ADMIN"
        }
        token = create_fake_jwt(admin_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
        assert "must be verified" in response.json()["detail"]

    def test_20_case_insensitive_and_whitespace_ayan_is_authorized_200(self):
        # Normalization test: uppercase with surrounding whitespace
        admin_claims = {
            "uid": "uid_real_admin_001",
            "email": "  AYAN090912@GMAIL.COM  ",
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

    def test_21_missing_email_verified_claim_for_ayan_is_rejected_403(self):
        # Token has authorized email ayan090912@gmail.com but MISSING the email_verified claim completely.
        # Fail-closed rule MUST reject with HTTP 403 Forbidden.
        admin_claims = {
            "uid": "uid_ayan_missing_verified",
            "email": "ayan090912@gmail.com",
            # "email_verified" intentionally omitted
            "admin": True,
            "role": "PLATFORM_ADMIN"
        }
        token = create_fake_jwt(admin_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
        assert "must be verified" in response.json()["detail"]

    def test_22_explicitly_false_email_verified_claim_is_rejected_403(self):
        # Token has authorized email ayan090912@gmail.com but email_verified is explicitly False.
        # MUST reject with HTTP 403 Forbidden.
        admin_claims = {
            "uid": "uid_ayan_false_verified",
            "email": "ayan090912@gmail.com",
            "email_verified": False,
            "admin": True,
            "role": "PLATFORM_ADMIN"
        }
        token = create_fake_jwt(admin_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
        assert "must be verified" in response.json()["detail"]

    def test_23_untrusted_email_even_with_verified_email_claim_is_rejected_403(self):
        # Token has email_verified == True but belongs to an untrusted/unauthorized email address.
        # MUST reject with HTTP 403 Forbidden.
        attacker_claims = {
            "uid": "uid_untrusted_verified_user",
            "email": "untrusted.attacker@gmail.com",
            "email_verified": True,
            "admin": True,
            "role": "PLATFORM_ADMIN"
        }
        token = create_fake_jwt(attacker_claims)
        response = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
        assert "not authorized for Platform Admin" in response.json()["detail"]

    def test_24_valid_verified_authorized_account_is_granted_access_200(self):
        # Token satisfies ALL conditions:
        # 1. Valid token
        # 2. Email is exactly ayan090912@gmail.com
        # 3. email_verified is explicitly True
        admin_claims = {
            "uid": "uid_ayan_legit_admin",
            "email": "ayan090912@gmail.com",
            "email_verified": True,
            "admin": True,
            "role": "PLATFORM_ADMIN"
        }
        token = create_fake_jwt(admin_claims)

        # Endpoint 1: /api/v1/admin/restaurants
        r1 = client.get("/api/v1/admin/restaurants", headers={"Authorization": f"Bearer {token}"})
        assert r1.status_code == 200

        # Endpoint 2: /api/v1/admin/verify-token
        r2 = client.post("/api/v1/admin/verify-token", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        assert r2.json()["authenticated"] is True

        # Endpoint 3: /api/v1/admin/audit-logs
        r3 = client.get("/api/v1/admin/audit-logs", headers={"Authorization": f"Bearer {token}"})
        assert r3.status_code == 200

    def test_25_websocket_admin_channel_fail_closed_verification(self):
        from starlette.websockets import WebSocketDisconnect

        # 1. Missing email_verified claim
        missing_verified_token = create_fake_jwt({
            "uid": "uid_ayan",
            "email": "ayan090912@gmail.com",
            "role": "PLATFORM_ADMIN"
        })
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect(f"/api/v1/ws?restaurant_id=__platform_admin__&role=PLATFORM_ADMIN&token={missing_verified_token}"):
                pass
        assert exc_info.value.code == 1008

        # 2. email_verified is False
        false_verified_token = create_fake_jwt({
            "uid": "uid_ayan",
            "email": "ayan090912@gmail.com",
            "email_verified": False,
            "role": "PLATFORM_ADMIN"
        })
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect(f"/api/v1/ws?restaurant_id=__platform_admin__&role=PLATFORM_ADMIN&token={false_verified_token}"):
                pass
        assert exc_info.value.code == 1008

        # 3. Untrusted email even if verified True
        untrusted_token = create_fake_jwt({
            "uid": "uid_untrusted",
            "email": "untrusted@gmail.com",
            "email_verified": True,
            "role": "PLATFORM_ADMIN"
        })
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect(f"/api/v1/ws?restaurant_id=__platform_admin__&role=PLATFORM_ADMIN&token={untrusted_token}"):
                pass
        assert exc_info.value.code == 1008

        # 4. Valid authorized ayan090912@gmail.com with email_verified == True connects successfully
        legit_token = create_fake_jwt({
            "uid": "uid_ayan",
            "email": "ayan090912@gmail.com",
            "email_verified": True,
            "role": "PLATFORM_ADMIN"
        })
        with client.websocket_connect(f"/api/v1/ws?restaurant_id=__platform_admin__&role=PLATFORM_ADMIN&token={legit_token}") as ws:
            ws.send_text("ping")
            data = ws.receive_text()
            assert data == "pong"




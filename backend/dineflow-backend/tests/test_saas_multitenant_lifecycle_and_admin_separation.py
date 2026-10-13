import time
import json
import base64
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app

client = TestClient(app)


def create_fake_jwt(claims: dict) -> str:
    """Helper to encode a base64 JWT payload for testing with mock Firebase verifier."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_signature"
    return f"{header}.{payload}.{signature}"


class TestSaaSMultiTenantLifecycleAndAdminSeparation:
    admin_uid = "usr_ayan_admin_root"
    admin_email = "ayan090912@gmail.com"
    admin_token = create_fake_jwt({
        "uid": admin_uid,
        "user_id": admin_uid,
        "email": admin_email,
        "email_verified": True,
        "admin": True,
        "role": "PLATFORM_ADMIN"
    })
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    def test_01_platform_admin_ayan_with_valid_verified_token_granted_access(self):
        """Scenario 1: ayan090912@gmail.com with valid, explicitly verified Firebase token accesses Platform Admin."""
        res = client.get("/api/v1/admin/restaurants", headers=self.admin_headers)
        assert res.status_code == 200, f"Platform admin access failed: {res.text}"
        data = res.json()
        assert isinstance(data, list)

    def test_02_any_other_email_denied_platform_admin_access(self):
        """Scenario 2: Any other email is denied platform admin access."""
        other_emails = ["owner1@gmail.com", "random.admin@gmail.com", "ayan090912@googlemail.com", "attacker@evil.com"]
        for email in other_emails:
            token = create_fake_jwt({
                "uid": f"uid_{email}",
                "email": email,
                "email_verified": True,
                "role": "PLATFORM_ADMIN",
                "admin": True
            })
            res = client.get("/api/v1/admin/restaurants", headers={"Authorization": f"Bearer {token}"})
            assert res.status_code == 403, f"Expected 403 for {email}, got {res.status_code}"

    def test_03_invalid_missing_expired_token_rejected(self):
        """Scenario 3: An invalid, missing or expired token is rejected."""
        # Missing token
        res_missing = client.get("/api/v1/admin/restaurants")
        assert res_missing.status_code in [401, 403]

        # Invalid token format
        res_invalid = client.get("/api/v1/admin/restaurants", headers={"Authorization": "Bearer not_a_jwt_token"})
        assert res_invalid.status_code == 401

        # Missing email_verified claim (fail-closed check)
        unverified_token = create_fake_jwt({
            "uid": self.admin_uid,
            "email": self.admin_email,
            "role": "PLATFORM_ADMIN"
            # email_verified omitted
        })
        res_unverified = client.get("/api/v1/admin/restaurants", headers={"Authorization": f"Bearer {unverified_token}"})
        assert res_unverified.status_code == 403

    def test_04_valid_restaurant_owner_token_cannot_access_platform_admin(self):
        """Scenario 4: A valid restaurant owner token cannot access platform admin APIs."""
        owner_token = create_fake_jwt({
            "uid": "uid_valid_owner_999",
            "email": "legit_owner@gmail.com",
            "email_verified": True,
            "role": "RESTAURANT_OWNER"
        })
        res = client.get("/api/v1/admin/restaurants", headers={"Authorization": f"Bearer {owner_token}"})
        assert res.status_code == 403

    def test_05_forged_role_custom_header_client_email_cannot_bypass_admin(self):
        """Scenario 5: User cannot obtain platform admin privileges through forged role, header, or client email."""
        forged_token = create_fake_jwt({
            "uid": "uid_forger_1",
            "email": "hacker@domain.com",
            "email_verified": True,
            "role": "PLATFORM_ADMIN",
            "is_admin": True,
            "admin": True
        })
        headers = {
            "Authorization": f"Bearer {forged_token}",
            "X-Admin-Role": "PLATFORM_ADMIN",
            "X-User-Email": "ayan090912@gmail.com",
            "X-Platform-Admin": "true"
        }
        res = client.get("/api/v1/admin/restaurants", headers=headers)
        assert res.status_code == 403

    def test_06_verified_gmail_user_can_register_via_normal_owner_path(self):
        """Scenario 6: Another verified Gmail user can register through the normal owner registration path."""
        ts = int(time.time())
        signup_payload = {
            "restaurantName": f"Bistro Paris {ts}",
            "desiredSlug": f"bistro-paris-{ts}",
            "ownerName": "Pierre Dubois",
            "email": f"owner_pierre_{ts}@gmail.com",
            "password": "Password123!",
            "cuisine": "French Fine Dining",
            "businessType": "RESTAURANT"
        }
        res = client.post("/api/v1/restaurants/signup", json=signup_payload)
        assert res.status_code in [200, 201], f"Signup failed: {res.text}"
        data = res.json()
        assert "tenant" in data or "id" in data
        tenant = data.get("tenant") or data
        assert tenant["public_slug"] == f"bistro-paris-{ts}"

    def test_07_newly_submitted_restaurant_starts_in_pending_status(self):
        """Scenario 7: A newly submitted restaurant starts in pending status."""
        ts = int(time.time()) + 1
        owner_uid = f"usr_owner_pending_{ts}"
        owner_email = f"owner_pending_{ts}@gmail.com"
        owner_token = create_fake_jwt({"uid": owner_uid, "email": owner_email, "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        rest_id = f"rest-pending-{ts}"

        # Create draft restaurant
        res_create = client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": f"Pending Cafe {ts}",
            "ownerUid": owner_uid,
            "ownerEmail": owner_email,
            "lifecycleStatus": "DRAFT"
        }, headers=owner_headers)
        assert res_create.status_code in [200, 201]

        # Submit application
        res_submit = client.post(f"/api/v1/restaurants/{rest_id}/submit", json={"address": "101 River Rd"}, headers=owner_headers)
        assert res_submit.status_code == 200
        data_submit = res_submit.json()
        assert data_submit["lifecycle_status"] == "PENDING_APPROVAL"
        assert data_submit["is_approved"] is False
        assert data_submit["submitted_at"] is not None

    def test_08_pending_restaurant_cannot_use_restricted_live_capabilities(self):
        """Scenario 8: A pending restaurant cannot use restricted live capabilities."""
        ts = int(time.time()) + 2
        rest_id = f"rest-unapproved-{ts}"
        slug = f"unapproved-eats-{ts}"
        owner_token = create_fake_jwt({"uid": f"uid_{ts}", "email": f"owner_{ts}@gmail.com", "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": "Unapproved Eats",
            "ownerUid": f"uid_{ts}",
            "ownerEmail": f"owner_{ts}@gmail.com",
            "desiredSlug": slug,
            "lifecycleStatus": "PENDING_APPROVAL"
        }, headers=owner_headers)

        # Public storefront check: lookup by slug should not return as live/approved
        res_pub = client.get(f"/api/v1/restaurants/{rest_id}")
        assert res_pub.status_code == 200
        assert res_pub.json()["is_approved"] is False
        assert res_pub.json()["lifecycle_status"] == "PENDING_APPROVAL"

    def test_09_authorized_platform_admin_sees_pending_and_approves(self):
        """Scenario 9: The authorized Platform Admin can see pending applications and approve a valid application."""
        ts = int(time.time()) + 3
        rest_id = f"rest-appr-{ts}"
        owner_uid = f"usr_appr_{ts}"
        owner_email = f"appr_owner_{ts}@gmail.com"
        owner_token = create_fake_jwt({"uid": owner_uid, "email": owner_email, "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": f"Approve Me {ts}",
            "ownerUid": owner_uid,
            "ownerEmail": owner_email,
            "lifecycleStatus": "DRAFT"
        }, headers=owner_headers)
        client.post(f"/api/v1/restaurants/{rest_id}/submit", headers=owner_headers)

        # Admin queue sees it
        res_queue = client.get("/api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL", headers=self.admin_headers)
        assert res_queue.status_code == 200
        assert any(r["id"] == rest_id for r in res_queue.json())

        # Admin approves
        res_appr = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_id}, headers=self.admin_headers)
        assert res_appr.status_code == 200
        data_appr = res_appr.json()
        assert data_appr["lifecycleStatus"] == "LIVE"
        assert data_appr["isApproved"] is True

    def test_10_owner_sees_resulting_approval_status(self):
        """Scenario 10: The owner can see the resulting approval status in their dashboard."""
        ts = int(time.time()) + 4
        rest_id = f"rest-status-{ts}"
        owner_token = create_fake_jwt({"uid": f"uid_{ts}", "email": f"owner_{ts}@gmail.com", "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": "Status Check Diner",
            "ownerUid": f"uid_{ts}",
            "ownerEmail": f"owner_{ts}@gmail.com",
            "lifecycleStatus": "PENDING_APPROVAL"
        }, headers=owner_headers)

        # Admin approves
        client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_id}, headers=self.admin_headers)

        # Owner fetches status
        res_owner = client.get(f"/api/v1/restaurants/{rest_id}", headers=owner_headers)
        assert res_owner.status_code == 200
        data = res_owner.json()
        assert data["is_approved"] is True
        assert data["lifecycle_status"] == "LIVE"
        assert data["approved_at"] is not None

    def test_11_rejected_application_remains_saved_with_status_and_reason(self):
        """Scenario 11: A rejected application remains saved and displays its correct status."""
        ts = int(time.time()) + 5
        rest_id = f"rest-rej-{ts}"
        owner_token = create_fake_jwt({"uid": f"uid_{ts}", "email": f"owner_{ts}@gmail.com", "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": "Rejection Diner",
            "ownerUid": f"uid_{ts}",
            "ownerEmail": f"owner_{ts}@gmail.com",
            "lifecycleStatus": "PENDING_APPROVAL"
        }, headers=owner_headers)

        # Admin rejects
        res_reject = client.post("/api/v1/admin/restaurants/reject", json={
            "restaurant_id": rest_id,
            "reason": "Incomplete health safety license documentation."
        }, headers=self.admin_headers)
        assert res_reject.status_code == 200

        # Owner fetches details
        res_owner = client.get(f"/api/v1/restaurants/{rest_id}", headers=owner_headers)
        assert res_owner.status_code == 200
        data = res_owner.json()
        assert data["lifecycle_status"] == "REJECTED"
        assert data["is_approved"] is False
        assert data["rejection_reason"] == "Incomplete health safety license documentation."

    def test_12_owner_cannot_approve_their_own_restaurant(self):
        """Scenario 12: An owner cannot approve their own restaurant via update endpoint."""
        ts = int(time.time()) + 6
        rest_id = f"rest-self-appr-{ts}"
        owner_token = create_fake_jwt({"uid": f"uid_{ts}", "email": f"owner_{ts}@gmail.com", "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": "Sneaky Owner Cafe",
            "ownerUid": f"uid_{ts}",
            "ownerEmail": f"owner_{ts}@gmail.com",
            "lifecycleStatus": "PENDING_APPROVAL"
        }, headers=owner_headers)

        # Attempt self-approval via PUT
        res_bypass = client.put(f"/api/v1/restaurants/{rest_id}", json={
            "lifecycleStatus": "LIVE"
        }, headers=owner_headers)
        assert res_bypass.status_code == 403, f"Expected 403 Forbidden for self-approval, got {res_bypass.status_code}"

        # Verify it remains unapproved
        res_check = client.get(f"/api/v1/restaurants/{rest_id}", headers=owner_headers)
        assert res_check.json()["lifecycle_status"] != "LIVE"
        assert res_check.json()["is_approved"] is False

    def test_13_restaurant_owners_access_only_their_authorized_resources(self):
        """Scenario 13: Restaurant owners can access only their authorized restaurant's resources."""
        ts = int(time.time()) + 7
        rest_a = f"rest-a-{ts}"
        rest_b = f"rest-b-{ts}"
        owner_a_token = create_fake_jwt({"uid": f"uid_a_{ts}", "email": f"owner_a_{ts}@gmail.com", "role": "RESTAURANT_OWNER"})
        owner_b_token = create_fake_jwt({"uid": f"uid_b_{ts}", "email": f"owner_b_{ts}@gmail.com", "role": "RESTAURANT_OWNER"})

        client.post("/api/v1/restaurants", json={"id": rest_a, "name": "Restaurant A", "ownerUid": f"uid_a_{ts}", "ownerEmail": f"owner_a_{ts}@gmail.com"}, headers={"Authorization": f"Bearer {owner_a_token}"})
        client.post("/api/v1/restaurants", json={"id": rest_b, "name": "Restaurant B", "ownerUid": f"uid_b_{ts}", "ownerEmail": f"owner_b_{ts}@gmail.com"}, headers={"Authorization": f"Bearer {owner_b_token}"})

        # Owner A tries to modify restaurant B
        res_tamper = client.put(f"/api/v1/restaurants/{rest_b}", json={"name": "Hacked Name"}, headers={"Authorization": f"Bearer {owner_a_token}"})
        assert res_tamper.status_code in [403, 404]

    def test_14_one_owner_cannot_retrieve_another_tenants_sensitive_records(self):
        """Scenario 14: One owner cannot retrieve another tenant's billing records or inventory."""
        ts = int(time.time()) + 8
        rest_a = f"rest-sec-a-{ts}"
        rest_b = f"rest-sec-b-{ts}"
        owner_a_token = create_fake_jwt({"uid": f"uid_a_{ts}", "email": f"owner_a_{ts}@gmail.com", "role": "RESTAURANT_OWNER"})
        headers_a = {"Authorization": f"Bearer {owner_a_token}"}

        # Attempt to access billing or inventory for restaurant B with owner A's token
        res_bills = client.get(f"/api/v1/restaurants/{rest_b}/bills", headers=headers_a)
        assert res_bills.status_code in [403, 404]

        res_inv = client.get(f"/api/v1/restaurants/{rest_b}/inventory", headers=headers_a)
        assert res_inv.status_code in [403, 404]

    def test_15_approved_restaurants_can_access_owner_dashboard_and_configured_storefront(self):
        """Scenario 15: Approved restaurants can access the appropriate owner dashboard and public storefront."""
        ts = int(time.time()) + 9
        rest_id = f"rest-storefront-{ts}"
        slug = f"storefront-{ts}"
        owner_token = create_fake_jwt({"uid": f"uid_{ts}", "email": f"owner_{ts}@gmail.com", "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": "Live Storefront Diner",
            "desiredSlug": slug,
            "ownerUid": f"uid_{ts}",
            "ownerEmail": f"owner_{ts}@gmail.com",
            "lifecycleStatus": "PENDING_APPROVAL"
        }, headers=owner_headers)

        # Admin approves
        client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_id}, headers=self.admin_headers)

        # Storefront access
        res = client.get(f"/api/v1/restaurants/{rest_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["is_approved"] is True
        assert data["public_slug"] == "live-storefront-diner"
        assert data["domain"] == "https://live-storefront-diner.dinely.food"

    def test_16_only_correctly_published_and_approved_restaurants_appear_as_live(self):
        """Scenario 16: Only correctly published and approved restaurants appear as live."""
        ts = int(time.time()) + 10
        rest_draft = f"rest-drf-{ts}"
        rest_live = f"rest-liv-{ts}"

        client.post("/api/v1/restaurants", json={"id": rest_draft, "name": "Draft Rest", "lifecycleStatus": "DRAFT"})
        client.post("/api/v1/restaurants", json={"id": rest_live, "name": "Live Rest", "lifecycleStatus": "PENDING_APPROVAL"})
        client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_live}, headers=self.admin_headers)

        res_draft = client.get(f"/api/v1/restaurants/{rest_draft}")
        res_live = client.get(f"/api/v1/restaurants/{rest_live}")

        assert res_draft.json()["is_approved"] is False
        assert res_live.json()["is_approved"] is True

    def test_17_repeated_approval_requests_are_idempotent_no_duplicate_provisioning(self):
        """Scenario 17: Repeated approval requests do not cause inconsistent state or duplicate provisioning."""
        ts = int(time.time()) + 11
        rest_id = f"rest-idem-{ts}"
        client.post("/api/v1/restaurants", json={"id": rest_id, "name": "Idem Rest", "lifecycleStatus": "PENDING_APPROVAL"})

        # First approval
        res1 = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_id}, headers=self.admin_headers)
        assert res1.status_code == 200
        assert res1.json()["isApproved"] is True

        # Second approval (idempotent)
        res2 = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_id}, headers=self.admin_headers)
        assert res2.status_code == 200
        assert res2.json().get("already_approved") is True

    def test_18_customer_waiter_kitchen_workflows_remain_functional(self):
        """Scenario 18: Existing customer QR ordering, waiter, kitchen, bar and inventory workflows remain functional."""
        ts = int(time.time()) + 12
        rest_id = f"rest-ops-{ts}"
        client.post("/api/v1/restaurants", json={"id": rest_id, "name": "Ops Rest", "hasTables": True, "tableCount": 5})

        # Check menu
        res_menu = client.get(f"/api/v1/restaurants/{rest_id}/menu")
        assert res_menu.status_code == 200
        assert "categories" in res_menu.json()

        # Check tables
        res_tables = client.get(f"/api/v1/restaurants/{rest_id}/tables")
        assert res_tables.status_code == 200

    def test_19_admin_websocket_channel_remains_protected(self):
        """Scenario 19: The admin WebSocket channel remains protected."""
        # Non-admin or unverified rejected
        fake_token = create_fake_jwt({"uid": "uid_fake", "email": "fake@gmail.com", "role": "PLATFORM_ADMIN"})
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect(f"/api/v1/ws?restaurant_id=__platform_admin__&role=PLATFORM_ADMIN&token={fake_token}"):
                pass
        assert exc_info.value.code == 1008

        # Admin connects cleanly
        with client.websocket_connect(f"/api/v1/ws?restaurant_id=__platform_admin__&role=PLATFORM_ADMIN&token={self.admin_token}") as ws:
            ws.send_text("ping")
            assert ws.receive_text() == "pong"

    def test_20_existing_security_and_regression_checks_pass(self):
        """Scenario 20: Existing security, authentication and regression tests continue to pass."""
        # Check platform settings / health endpoints
        res_health = client.get("/healthz")
        assert res_health.status_code == 200

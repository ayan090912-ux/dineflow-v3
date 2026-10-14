import time
import uuid
import json
import base64
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config.settings import get_settings

client = TestClient(app)
settings = get_settings()

def create_fake_jwt(claims: dict) -> str:
    """Helper to encode a base64 JSON payload mimicking Firebase ID token."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_signature"
    return f"{header}.{payload}.{signature}"


class TestOwnerSignupAndApprovalWorkflowE2E:
    @classmethod
    def setup_class(cls):
        cls.admin_email = "ayan090912@gmail.com"
        cls.admin_token = create_fake_jwt({
            "uid": "admin-ayan-uid",
            "email": cls.admin_email,
            "role": "PLATFORM_ADMIN",
            "email_verified": True,
            "admin": True
        })
        cls.admin_headers = {"Authorization": f"Bearer {cls.admin_token}"}

    def test_step_1_only_authorized_admin_accesses_platform_admin(self):
        """1. ayan090912@gmail.com is the ONLY account permitted to access the main Platform Admin portal."""
        # Authorized account succeeds
        res_ok = client.post(
            "/api/v1/admin/verify-token",
            headers=self.admin_headers,
            json={"id_token": self.admin_token}
        )
        assert res_ok.status_code == 200
        assert res_ok.json()["authenticated"] is True
        assert res_ok.json()["role"] == "PLATFORM_ADMIN"

        # Authorized account can view restaurants
        res_admin_list = client.get("/api/v1/admin/restaurants", headers=self.admin_headers)
        assert res_admin_list.status_code == 200
        assert isinstance(res_admin_list.json(), list)

        # Other accounts are strictly denied 403 Forbidden
        for unauthorized_email in [
            "otherowner@gmail.com",
            "admin@dinely.food",
            "hacker@gmail.com",
            "ayan090912@yahoo.com",
            "ayan090912@fake.gmail.com"
        ]:
            token = create_fake_jwt({
                "uid": f"unauth-{uuid.uuid4().hex[:6]}",
                "email": unauthorized_email,
                "role": "PLATFORM_ADMIN",
                "email_verified": True
            })
            res_deny = client.get("/api/v1/admin/restaurants", headers={"Authorization": f"Bearer {token}"})
            assert res_deny.status_code == 403, f"Expected 403 for {unauthorized_email}, got {res_deny.status_code}"

    def test_step_2_to_7_complete_owner_signup_approval_and_isolation_lifecycle(self):
        """2-7. Full lifecycle: signup -> submission -> admin queue -> approval -> dashboard access -> isolation."""
        ts = int(time.time())
        owner_email = f"bistro_owner_{ts}@gmail.com"
        owner_uid = f"owner-uid-{ts}"
        owner_token = create_fake_jwt({
            "uid": owner_uid,
            "email": owner_email,
            "role": "RESTAURANT_OWNER",
            "email_verified": True
        })
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        # 2. Other people can register using their own verified Gmail accounts
        # Owner cannot access admin portal
        res_owner_admin = client.get("/api/v1/admin/restaurants", headers=owner_headers)
        assert res_owner_admin.status_code == 403

        # 3. Each new owner can create their own restaurant and submit it for approval
        rest_id = f"rest-{ts}-{uuid.uuid4().hex[:6]}"
        slug = f"bistro-deluxe-{ts}"
        res_create = client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": f"Bistro Deluxe {ts}",
            "desiredSlug": slug,
            "ownerUid": owner_uid,
            "ownerEmail": owner_email,
            "address": "45 Promenade St",
            "hasTables": True,
            "hasKitchen": True,
            "lifecycleStatus": "DRAFT"
        }, headers=owner_headers)
        assert res_create.status_code in (200, 201)

        # Submit application for approval
        res_submit = client.post(f"/api/v1/restaurants/{rest_id}/submit", json={
            "address": "45 Promenade St",
            "totalTablesCount": 8
        }, headers=owner_headers)
        assert res_submit.status_code == 200
        assert res_submit.json()["lifecycle_status"] == "PENDING_APPROVAL"
        assert res_submit.json()["is_approved"] is False

        # 4. The application appears in Platform Admin approval queue
        res_queue = client.get("/api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL", headers=self.admin_headers)
        assert res_queue.status_code == 200
        queue_items = res_queue.json()
        assert any(r["id"] == rest_id for r in queue_items), f"Restaurant {rest_id} not found in admin queue"

        # 5. Only authorized Platform Admin account can approve or reject it
        # Attempt 5a: Owner attempts admin approve endpoint -> 403 Forbidden
        res_self_appr = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_id}, headers=owner_headers)
        assert res_self_appr.status_code == 403

        # Attempt 5b: Owner attempts PUT to change status to LIVE -> 403 Forbidden
        res_self_patch = client.put(f"/api/v1/restaurants/{rest_id}", json={"lifecycleStatus": "LIVE"}, headers=owner_headers)
        assert res_self_patch.status_code == 403

        # Authorized Admin approves the restaurant
        res_approve = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_id}, headers=self.admin_headers)
        assert res_approve.status_code == 200
        appr_data = res_approve.json()
        assert appr_data["isApproved"] is True
        assert appr_data["lifecycleStatus"] == "LIVE"

        # 6. After approval, the restaurant owner can access their restaurant dashboard
        res_owner_get = client.get(f"/api/v1/restaurants/{rest_id}", headers=owner_headers)
        assert res_owner_get.status_code == 200
        rest_data = res_owner_get.json()
        assert rest_data["is_approved"] is True
        assert rest_data["lifecycle_status"] == "LIVE"

        # Owner can configure modules and branding
        res_modules = client.patch(f"/api/v1/restaurants/{rest_id}/workspace-modules", json={
            "enabledModules": ["kitchen", "tables", "billing"]
        }, headers=owner_headers)
        assert res_modules.status_code == 200

        # 7. Each owner can manage ONLY their own restaurant (tenant isolation)
        owner2_uid = f"owner2-uid-{ts}"
        owner2_email = f"intruder_{ts}@gmail.com"
        owner2_token = create_fake_jwt({
            "uid": owner2_uid,
            "email": owner2_email,
            "role": "RESTAURANT_OWNER",
            "email_verified": True
        })
        owner2_headers = {"Authorization": f"Bearer {owner2_token}"}

        # Owner 2 cannot mutate Owner 1's restaurant modules
        res_tamper = client.patch(f"/api/v1/restaurants/{rest_id}/workspace-modules", json={
            "enabledModules": ["bar"]
        }, headers=owner2_headers)
        assert res_tamper.status_code == 403

        # Owner 2 cannot view Owner 1's staff records
        res_staff_leak = client.get(f"/api/v1/restaurants/{rest_id}/staff", headers=owner2_headers)
        assert res_staff_leak.status_code == 403

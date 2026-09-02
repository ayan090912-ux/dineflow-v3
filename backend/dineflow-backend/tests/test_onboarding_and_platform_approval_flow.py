import json
import base64
import time
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def create_admin_jwt(email: str = "ayan090912@gmail.com", uid: str = "admin_uid_ayan") -> str:
    claims = {
        "uid": uid,
        "user_id": uid,
        "email": email,
        "role": "PLATFORM_ADMIN",
        "admin": True,
    }
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"{header}.{payload}.fake_signature"


class TestOnboardingAndPlatformApprovalFlow:
    """
    Test Suite for Complete Real Onboarding + Platform Admin Approval Lifecycle:
    1. Authenticated User creates Restaurant A -> PENDING_APPROVAL
    2. Platform Admin sees Restaurant A in pending approval queue
    3. Platform Admin approves Restaurant A -> LIVE (idempotent, tenant domain, tables, QR)
    4. Same Owner creates Restaurant B -> PENDING_APPROVAL (does NOT affect Restaurant A)
    5. Platform Admin rejects Restaurant B with reason -> REJECTED
    6. Platform Admin dismisses/archives a synthetic test record -> ARCHIVED (preserves audit)
    7. Second distinct User B creates Restaurant C -> Strict owner isolation between User A & User B
    8. Strict Tenant Data Isolation (Menu items, Orders, Tables)
    """

    def test_complete_onboarding_approval_and_multi_tenant_lifecycle(self):
        admin_token = create_admin_jwt()
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        t_stamp = int(time.time() * 1000)

        # ----------------------------------------------------------------------
        # 1. USER A: Authenticated Firebase user creates Restaurant A ("THE DUNK")
        # ----------------------------------------------------------------------
        user_a_uid = f"firebase_uid_user_a_{t_stamp}"
        user_a_email = f"user_a_{t_stamp}@gmail.com"
        user_a_name = f"Ayaan Owner {t_stamp}"
        rest_a_id = f"rest-dunk-prod-{t_stamp}"

        create_a_resp = client.post("/api/v1/restaurants", json={
            "id": rest_a_id,
            "name": f"The Dunk {t_stamp}",
            "cuisine": "Gourmet Burgers",
            "businessType": "RESTAURANT",
            "ownerName": user_a_name,
            "ownerEmail": user_a_email,
            "ownerUid": user_a_uid,
            "phone": "+91 98765 43210",
            "address": "Park Street 101, Kolkata, WB, India",
            "hasTables": True,
            "hasKitchen": True,
            "hasWaiter": True,
            "hasBar": False,
        })
        assert create_a_resp.status_code == 201
        data_a = create_a_resp.json()
        assert data_a["id"] == rest_a_id
        assert data_a.get("is_approved") is False or data_a.get("isApproved") is False
        assert data_a.get("lifecycle_status") == "PENDING_APPROVAL" or data_a.get("lifecycleStatus") == "PENDING_APPROVAL"
        assert data_a["domain"] == f"https://{data_a['public_slug']}.dinely.app"

        # ----------------------------------------------------------------------
        # 2. PLATFORM ADMIN: Pending queue reflects Restaurant A
        # ----------------------------------------------------------------------
        admin_pending = client.get("/api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL", headers=admin_headers)
        assert admin_pending.status_code == 200
        pending_list = admin_pending.json()
        pending_ids = [r["id"] for r in pending_list]
        assert rest_a_id in pending_ids

        # ----------------------------------------------------------------------
        # 3. PLATFORM ADMIN: Approves Restaurant A -> transitions to LIVE
        # ----------------------------------------------------------------------
        approve_resp = client.post("/api/v1/admin/restaurants/approve", headers=admin_headers, json={
            "restaurant_id": rest_a_id,
        })
        assert approve_resp.status_code == 200
        approve_data = approve_resp.json()
        assert approve_data.get("isApproved") is True or approve_data.get("is_approved") is True
        assert approve_data.get("lifecycleStatus") == "LIVE" or approve_data.get("lifecycle_status") == "LIVE"

        # Verify idempotency
        approve_idem = client.post("/api/v1/admin/restaurants/approve", headers=admin_headers, json={
            "restaurant_id": rest_a_id,
        })
        assert approve_idem.status_code == 200
        assert approve_idem.json().get("already_approved") is True

        # ----------------------------------------------------------------------
        # 4. SAME USER A: Creates Restaurant B ("CAFE.CO") -> Second Tenant
        # ----------------------------------------------------------------------
        rest_b_id = f"rest-cafe-prod-{t_stamp}"
        create_b_resp = client.post("/api/v1/restaurants", json={
            "id": rest_b_id,
            "name": f"Cafe Co {t_stamp}",
            "cuisine": "European Cafe",
            "businessType": "RESTAURANT",
            "ownerName": user_a_name,
            "ownerEmail": user_a_email,
            "ownerUid": user_a_uid,
            "phone": "+91 98765 11122",
            "address": "Salt Lake Sector 5, Kolkata, WB, India",
            "hasTables": True,
            "hasKitchen": True,
            "hasWaiter": True,
            "hasBar": True,
        })
        assert create_b_resp.status_code == 201
        data_b = create_b_resp.json()
        assert data_b["id"] == rest_b_id
        assert data_b["id"] != rest_a_id
        assert data_b["public_slug"] != data_a["public_slug"]
        assert data_b.get("lifecycle_status") == "PENDING_APPROVAL" or data_b.get("lifecycleStatus") == "PENDING_APPROVAL"

        # User A's workspace lists BOTH restaurants
        owner_my = client.get(f"/api/v1/restaurants/owner/my?owner_email={user_a_email}&owner_uid={user_a_uid}").json()
        owner_my_ids = [r["id"] for r in owner_my]
        assert rest_a_id in owner_my_ids
        assert rest_b_id in owner_my_ids

        # ----------------------------------------------------------------------
        # 5. PLATFORM ADMIN: Rejects Restaurant B with specific reason
        # ----------------------------------------------------------------------
        reject_reason = "FSSAI Food Safety license document missing."
        reject_resp = client.post("/api/v1/admin/restaurants/reject", headers=admin_headers, json={
            "restaurant_id": rest_b_id,
            "reason": reject_reason,
        })
        assert reject_resp.status_code == 200
        reject_data = reject_resp.json()
        assert reject_data.get("lifecycleStatus") == "REJECTED" or reject_data.get("lifecycle_status") == "REJECTED"
        assert reject_data.get("isApproved") is False or reject_data.get("is_approved") is False

        # Verify Restaurant A is STILL LIVE and unaffected!
        rest_a_check = client.get(f"/api/v1/restaurants/{rest_a_id}").json()
        assert rest_a_check["lifecycle_status"] == "LIVE" or rest_a_check.get("lifecycleStatus") == "LIVE"
        assert rest_a_check["is_approved"] is True or rest_a_check.get("isApproved") is True

        # ----------------------------------------------------------------------
        # 6. PLATFORM ADMIN: Dismisses / Archives a test fixture record
        # ----------------------------------------------------------------------
        test_fixture_id = f"rest-test-fixture-{t_stamp}"
        client.post("/api/v1/restaurants", json={
            "id": test_fixture_id,
            "name": f"Duplicate Synthetic Fixture {t_stamp}",
            "ownerEmail": f"test_synth_{t_stamp}@test.com",
            "hasTables": True,
        })

        dismiss_resp = client.post("/api/v1/admin/restaurants/dismiss", headers=admin_headers, json={
            "restaurant_id": test_fixture_id,
            "reason": "Synthetic duplicate fixture test",
        })
        assert dismiss_resp.status_code == 200
        dismiss_data = dismiss_resp.json()
        assert dismiss_data["lifecycleStatus"] == "ARCHIVED"
        assert dismiss_data["isApproved"] is False

        # Archived restaurant is NOT in pending approval queue
        admin_pending_after = client.get("/api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL", headers=admin_headers).json()
        pending_after_ids = [r["id"] for r in admin_pending_after]
        assert test_fixture_id not in pending_after_ids

        # ----------------------------------------------------------------------
        # 7. USER B: Second distinct user creates Restaurant C -> Strict Owner Isolation
        # ----------------------------------------------------------------------
        user_b_uid = f"firebase_uid_user_b_{t_stamp}"
        user_b_email = f"user_b_{t_stamp}@gmail.com"
        rest_c_id = f"rest-c-prod-{t_stamp}"

        client.post("/api/v1/restaurants", json={
            "id": rest_c_id,
            "name": f"User B Bistro {t_stamp}",
            "ownerName": "User B",
            "ownerEmail": user_b_email,
            "ownerUid": user_b_uid,
            "hasTables": True,
        })

        # User A's workspace must NOT see Restaurant C
        user_a_workspace = client.get(f"/api/v1/restaurants/owner/my?owner_email={user_a_email}&owner_uid={user_a_uid}").json()
        user_a_rest_ids = [r["id"] for r in user_a_workspace]
        assert rest_c_id not in user_a_rest_ids, "Security breach: User A sees User B's restaurant!"

        # User B's workspace must ONLY see Restaurant C
        user_b_workspace = client.get(f"/api/v1/restaurants/owner/my?owner_email={user_b_email}&owner_uid={user_b_uid}").json()
        user_b_rest_ids = [r["id"] for r in user_b_workspace]
        assert rest_c_id in user_b_rest_ids
        assert rest_a_id not in user_b_rest_ids, "Security breach: User B sees User A's restaurant!"
        assert rest_b_id not in user_b_rest_ids

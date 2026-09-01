import json
import base64
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config.settings import get_settings

client = TestClient(app)
settings = get_settings()


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


class TestMultiTenantApprovalLifecycleSync:
    """
    Comprehensive End-to-End Test for the Restaurant Approval Lifecycle:
    OWNER CREATION -> POSTGRES DB -> ADMIN PENDING QUEUE -> APPROVAL -> DB LIVE -> OWNER STATUS
    """

    def test_complete_multitenant_approval_lifecycle(self):
        admin_token = create_admin_jwt()
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        rest_a_id = f"test-rest-sync-a-{int(pytest.importorskip('time').time() * 1000)}"
        rest_b_id = f"test-rest-sync-b-{int(pytest.importorskip('time').time() * 1000)}"

        # Step 1: Owner A creates Restaurant A
        owner_a_email = "owner_a_sync@test.com"
        owner_a_uid = "uid_owner_a_sync"
        payload_a = {
            "id": rest_a_id,
            "name": "Sync Bistro A",
            "cuisine": "French",
            "businessType": "RESTAURANT",
            "hasKitchen": True,
            "hasWaiter": True,
            "hasBar": False,
            "hasTables": True,
            "ownerName": "Alice Owner",
            "ownerEmail": owner_a_email,
            "ownerUid": owner_a_uid,
            "phone": "+1 555-0101",
            "email": "contact@bistro-a.test",
            "address": "101 Alpha Blvd",
        }
        resp_a = client.post("/api/v1/restaurants", json=payload_a)
        assert resp_a.status_code == 201, f"Failed creating restaurant A: {resp_a.text}"
        data_a = resp_a.json()
        assert data_a["id"] == rest_a_id
        assert data_a["is_approved"] is False
        assert data_a["lifecycle_status"] == "PENDING_APPROVAL"
        assert data_a["owner_email"] == owner_a_email
        assert data_a["owner_uid"] == owner_a_uid

        # Step 2: Owner B creates Restaurant B
        owner_b_email = "owner_b_sync@test.com"
        owner_b_uid = "uid_owner_b_sync"
        payload_b = {
            "id": rest_b_id,
            "name": "Sync Pizzeria B",
            "cuisine": "Italian",
            "businessType": "RESTAURANT",
            "hasKitchen": True,
            "hasWaiter": False,
            "hasBar": True,
            "hasTables": True,
            "ownerName": "Bob Owner",
            "ownerEmail": owner_b_email,
            "ownerUid": owner_b_uid,
            "phone": "+1 555-0202",
            "email": "contact@pizzeria-b.test",
            "address": "202 Beta Ave",
        }
        resp_b = client.post("/api/v1/restaurants", json=payload_b)
        assert resp_b.status_code == 201, f"Failed creating restaurant B: {resp_b.text}"
        data_b = resp_b.json()
        assert data_b["id"] == rest_b_id
        assert data_b["is_approved"] is False
        assert data_b["lifecycle_status"] == "PENDING_APPROVAL"
        assert data_b["owner_email"] == owner_b_email
        assert data_b["owner_uid"] == owner_b_uid

        # Step 3: Owner Isolation Verification
        # Owner A queries their owned restaurants
        resp_owner_a = client.get(f"/api/v1/restaurants/owner/my?owner_email={owner_a_email}&owner_uid={owner_a_uid}")
        assert resp_owner_a.status_code == 200
        owned_a = resp_owner_a.json()
        owned_a_ids = [r["id"] for r in owned_a]
        assert rest_a_id in owned_a_ids
        assert rest_b_id not in owned_a_ids, "Cross-tenant data leak: Owner A should not see Restaurant B!"

        # Owner B queries their owned restaurants
        resp_owner_b = client.get(f"/api/v1/restaurants/owner/my?owner_email={owner_b_email}&owner_uid={owner_b_uid}")
        assert resp_owner_b.status_code == 200
        owned_b = resp_owner_b.json()
        owned_b_ids = [r["id"] for r in owned_b]
        assert rest_b_id in owned_b_ids
        assert rest_a_id not in owned_b_ids, "Cross-tenant data leak: Owner B should not see Restaurant A!"

        # Step 4: Platform Admin queries pending queue
        resp_admin_rests = client.get("/api/v1/admin/restaurants", headers=admin_headers)
        assert resp_admin_rests.status_code == 200, f"Admin fetch failed: {resp_admin_rests.text}"
        all_admin_rests = resp_admin_rests.json()
        admin_rest_ids = [r["id"] for r in all_admin_rests]
        assert rest_a_id in admin_rest_ids, "Restaurant A missing from Admin query!"
        assert rest_b_id in admin_rest_ids, "Restaurant B missing from Admin query!"

        # Verify Pending Approvals stats
        resp_stats = client.get("/api/v1/admin/stats", headers=admin_headers)
        assert resp_stats.status_code == 200
        stats = resp_stats.json()
        assert stats["pendingApprovals"] >= 2

        # Step 5: Admin Approves Restaurant A ONLY
        approve_resp_a = client.post(
            "/api/v1/admin/restaurants/approve",
            json={"restaurant_id": rest_a_id},
            headers=admin_headers
        )
        assert approve_resp_a.status_code == 200, f"Approval of A failed: {approve_resp_a.text}"
        assert approve_resp_a.json()["lifecycleStatus"] == "LIVE"

        # Step 6: Verify Database Lifecycle State after A is approved
        # Restaurant A must be LIVE & is_approved=True
        get_a = client.get(f"/api/v1/restaurants/{rest_a_id}")
        assert get_a.status_code == 200
        rest_a_state = get_a.json()
        assert rest_a_state["is_approved"] is True
        assert rest_a_state["lifecycle_status"] == "LIVE"
        assert rest_a_state["status"] == "OPEN"

        # Restaurant B MUST REMAIN PENDING & is_approved=False
        get_b = client.get(f"/api/v1/restaurants/{rest_b_id}")
        assert get_b.status_code == 200
        rest_b_state = get_b.json()
        assert rest_b_state["is_approved"] is False
        assert rest_b_state["lifecycle_status"] == "PENDING_APPROVAL"

        # Step 7: Admin Approves Restaurant B
        approve_resp_b = client.post(
            "/api/v1/admin/restaurants/approve",
            json={"restaurant_id": rest_b_id},
            headers=admin_headers
        )
        assert approve_resp_b.status_code == 200
        assert approve_resp_b.json()["lifecycleStatus"] == "LIVE"

        # Both are now LIVE
        get_b_live = client.get(f"/api/v1/restaurants/{rest_b_id}")
        assert get_b_live.status_code == 200
        assert get_b_live.json()["is_approved"] is True
        assert get_b_live.json()["lifecycle_status"] == "LIVE"

    def test_rejection_flow_and_idempotency(self):
        admin_token = create_admin_jwt()
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        rest_c_id = f"test-rest-sync-c-{int(pytest.importorskip('time').time() * 1000)}"

        # Step 1: Create Restaurant C
        payload_c = {
            "id": rest_c_id,
            "name": "Sync Cantina C",
            "cuisine": "Mexican",
            "businessType": "RESTAURANT",
            "ownerName": "Charlie Owner",
            "ownerEmail": "charlie_c@test.com",
            "ownerUid": "uid_owner_c",
            "phone": "+1 555-0303",
            "email": "contact@cantina-c.test",
        }
        resp_c = client.post("/api/v1/restaurants", json=payload_c)
        assert resp_c.status_code == 201

        # Step 2: Reject Restaurant C
        rejection_reason = "Missing valid business registration documents."
        reject_resp = client.post(
            "/api/v1/admin/restaurants/reject",
            json={"restaurant_id": rest_c_id, "reason": rejection_reason},
            headers=admin_headers
        )
        assert reject_resp.status_code == 200
        assert reject_resp.json()["lifecycleStatus"] == "REJECTED"
        assert reject_resp.json()["isApproved"] is False

        # Step 3: Verify Database State
        get_c = client.get(f"/api/v1/restaurants/{rest_c_id}")
        assert get_c.status_code == 200
        data = get_c.json()
        assert data["lifecycle_status"] == "REJECTED"
        assert data["is_approved"] is False
        assert data["rejection_reason"] == rejection_reason

        # Step 4: Duplicate Reject is Idempotent
        dup_reject_resp = client.post(
            "/api/v1/admin/restaurants/reject",
            json={"restaurant_id": rest_c_id, "reason": rejection_reason},
            headers=admin_headers
        )
        assert dup_reject_resp.status_code == 200
        assert dup_reject_resp.json()["lifecycleStatus"] == "REJECTED"
        assert dup_reject_resp.json().get("already_rejected") is True

    def test_duplicate_approval_is_idempotent(self):
        admin_token = create_admin_jwt()
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        rest_d_id = f"test-rest-sync-d-{int(pytest.importorskip('time').time() * 1000)}"
        client.post("/api/v1/restaurants", json={
            "id": rest_d_id,
            "name": "Sync Diner D",
            "cuisine": "American",
            "ownerName": "Dave Owner",
            "ownerEmail": "dave@test.com",
            "ownerUid": "uid_dave",
        })

        # 1st approval
        appr1 = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_d_id}, headers=admin_headers)
        assert appr1.status_code == 200
        assert appr1.json()["lifecycleStatus"] == "LIVE"

        # 2nd approval (Duplicate)
        appr2 = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_d_id}, headers=admin_headers)
        assert appr2.status_code == 200
        assert appr2.json()["lifecycleStatus"] == "LIVE"
        assert appr2.json().get("already_approved") is True

    def test_unauthorized_approve_and_reject_actions(self):
        # 1. Missing auth header returns 401
        res_401_appr = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": "any_id"})
        assert res_401_appr.status_code == 401

        res_401_rej = client.post("/api/v1/admin/restaurants/reject", json={"restaurant_id": "any_id"})
        assert res_401_rej.status_code == 401

        # 2. Non-admin owner token returns 403
        owner_claims = {"uid": "uid_non_admin", "email": "regular_owner@test.com", "role": "RESTAURANT_OWNER"}
        header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256"}).encode()).decode().rstrip("=")
        payload = base64.urlsafe_b64encode(json.dumps(owner_claims).encode()).decode().rstrip("=")
        owner_token = f"{header}.{payload}.sig"
        owner_headers = {"Authorization": f"Bearer {owner_token}"}

        res_403_appr = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": "any_id"}, headers=owner_headers)
        assert res_403_appr.status_code == 403

        res_403_rej = client.post("/api/v1/admin/restaurants/reject", json={"restaurant_id": "any_id"}, headers=owner_headers)
        assert res_403_rej.status_code == 403

    def test_invalid_restaurant_id_returns_404(self):
        admin_token = create_admin_jwt()
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        res_404_appr = client.post(
            "/api/v1/admin/restaurants/approve",
            json={"restaurant_id": "non_existent_restaurant_999999"},
            headers=admin_headers
        )
        assert res_404_appr.status_code == 404
        assert "not found" in res_404_appr.json()["detail"].lower()

        res_404_rej = client.post(
            "/api/v1/admin/restaurants/reject",
            json={"restaurant_id": "non_existent_restaurant_999999", "reason": "test"},
            headers=admin_headers
        )
        assert res_404_rej.status_code == 404
        assert "not found" in res_404_rej.json()["detail"].lower()

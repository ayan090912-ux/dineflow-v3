import time
import json
import base64
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def create_fake_jwt(claims: dict) -> str:
    """Helper to encode a base64 JWT payload for testing with mock Firebase verifier."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_signature"
    return f"{header}.{payload}.{signature}"


class TestRestaurantLifecycleE2E:
    # Dedicated Platform Admin credentials (authorized email ayan090912@gmail.com)
    admin_uid = "usr_admin_global_root"
    admin_email = "ayan090912@gmail.com"
    admin_token = create_fake_jwt({
        "uid": admin_uid,
        "user_id": admin_uid,
        "email": admin_email,
        "admin": True,
        "role": "PLATFORM_ADMIN"
    })
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    def test_01_full_owner_creation_submission_admin_approval_lifecycle(self):
        """
        LIFECYCLE TEST 1:
        Owner registers -> creates 'THE DUNK' -> DRAFT -> submit -> PENDING_APPROVAL ->
        Admin receives in real-time -> Admin approves -> LIVE -> idempotent approval.
        """
        ts = int(time.time())
        owner_uid = f"usr_owner1_{ts}"
        owner_email = f"owner1_{ts}@dinely.test"
        owner_token = create_fake_jwt({"uid": owner_uid, "user_id": owner_uid, "email": owner_email, "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        rest_id = f"rest-dunk-{ts}"

        # 1. OWNER FLOW: Create Restaurant
        create_payload = {
            "id": rest_id,
            "name": "THE DUNK",
            "ownerUid": owner_uid,
            "ownerEmail": owner_email,
            "ownerName": "Dunk Owner",
            "cuisine": "American Gourmet",
            "hasTables": True,
            "tableCount": 8,
            "lifecycleStatus": "DRAFT"
        }
        res_create = client.post("/api/v1/restaurants", json=create_payload, headers=owner_headers)
        assert res_create.status_code in [200, 201], f"Creation failed: {res_create.text}"
        data_create = res_create.json()

        assert data_create["id"] == rest_id
        assert data_create["name"] == "THE DUNK"
        assert data_create["public_slug"] == "the-dunk"
        assert data_create["domain"] == "https://the-dunk.dinely.food"
        assert data_create["lifecycle_status"] == "DRAFT"
        assert data_create["is_approved"] is False
        assert data_create["submitted_at"] is None

        # Verify not yet in Platform Admin PENDING_APPROVAL applications queue while in DRAFT
        admin_pending_0 = client.get("/api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL", headers=self.admin_headers)
        assert admin_pending_0.status_code == 200
        assert rest_id not in [r["id"] for r in admin_pending_0.json()]

        # 2. OWNER FLOW: Submit Application
        submit_payload = {
            "address": "42 High Street, Downtown",
            "phone": "+1 555-0199",
            "city": "Metropolis"
        }
        res_submit = client.post(f"/api/v1/restaurants/{rest_id}/submit", json=submit_payload, headers=owner_headers)
        assert res_submit.status_code == 200, f"Submit failed: {res_submit.text}"
        data_submit = res_submit.json()

        assert data_submit["id"] == rest_id
        assert data_submit["lifecycle_status"] == "PENDING_APPROVAL"
        assert data_submit["is_approved"] is False
        assert data_submit["submitted_at"] is not None
        assert data_submit["address"] == "42 High Street, Downtown"

        # 3. ADMIN QUEUE: Admin receives the submission from PostgreSQL
        admin_pending_1 = client.get("/api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL", headers=self.admin_headers)
        assert admin_pending_1.status_code == 200
        matching = [r for r in admin_pending_1.json() if r["id"] == rest_id]
        assert len(matching) == 1
        assert matching[0]["publicSlug"] == "the-dunk"
        assert matching[0]["domain"] == "https://the-dunk.dinely.food"

        # 4. ADMIN APPROVAL: PENDING_APPROVAL -> LIVE
        approve_payload = {
            "restaurant_id": rest_id,
            "reason": "Verified business license and menu"
        }
        res_approve = client.post("/api/v1/admin/restaurants/approve", json=approve_payload, headers=self.admin_headers)
        assert res_approve.status_code == 200, f"Approve failed: {res_approve.text}"
        data_approve = res_approve.json()
        assert data_approve["is_approved"] is True
        assert data_approve["lifecycleStatus"] == "LIVE"

        # Verify restaurant record directly
        res_check = client.get(f"/api/v1/restaurants/{rest_id}", headers=owner_headers)
        assert res_check.status_code == 200
        data_check = res_check.json()
        assert data_check["lifecycle_status"] == "LIVE"
        assert data_check["is_approved"] is True
        assert data_check["approved_by"] == self.admin_email
        assert data_check["approved_at"] is not None

        # 5. IDEMPOTENT APPROVAL: Subsequent approval calls succeed cleanly
        res_idempotent = client.post("/api/v1/admin/restaurants/approve", json=approve_payload, headers=self.admin_headers)
        assert res_idempotent.status_code == 200
        assert res_idempotent.json().get("already_approved") is True

    def test_02_rejection_and_resubmission_lifecycle(self):
        """
        LIFECYCLE TEST 2:
        Owner creates 'THE BURGER SHACK' -> DRAFT -> submit -> PENDING_APPROVAL ->
        Admin rejects (stores reason, timestamp, admin) -> REJECTED ->
        Owner updates & resubmits -> PENDING_APPROVAL (clears reason) -> Admin sees again.
        """
        ts = int(time.time()) + 10
        owner_uid = f"usr_owner2_{ts}"
        owner_email = f"owner2_{ts}@dinely.test"
        owner_token = create_fake_jwt({"uid": owner_uid, "user_id": owner_uid, "email": owner_email, "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        rest_id = f"rest-burger-{ts}"

        # 1. Create -> DRAFT
        client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": "THE BURGER SHACK",
            "ownerUid": owner_uid,
            "ownerEmail": owner_email,
            "ownerName": "Burger Owner",
            "cuisine": "Burgers & Shakes",
            "hasTables": True,
            "tableCount": 6,
            "lifecycleStatus": "DRAFT"
        }, headers=owner_headers)

        # 2. Submit -> PENDING_APPROVAL
        res_submit = client.post(f"/api/v1/restaurants/{rest_id}/submit", json={"address": "88 Ocean Drive"}, headers=owner_headers)
        assert res_submit.status_code == 200
        assert res_submit.json()["lifecycle_status"] == "PENDING_APPROVAL"

        # 3. Admin Rejection: PENDING_APPROVAL -> REJECTED
        reject_payload = {
            "restaurant_id": rest_id,
            "reason": "Menu prices and tax details are missing."
        }
        res_reject = client.post("/api/v1/admin/restaurants/reject", json=reject_payload, headers=self.admin_headers)
        assert res_reject.status_code == 200
        data_reject = res_reject.json()
        assert data_reject["lifecycleStatus"] == "REJECTED"
        assert data_reject["isApproved"] is False

        # Verify restaurant state
        res_check = client.get(f"/api/v1/restaurants/{rest_id}", headers=owner_headers)
        assert res_check.status_code == 200
        data_check = res_check.json()
        assert data_check["lifecycle_status"] == "REJECTED"
        assert data_check["is_approved"] is False
        assert data_check["rejection_reason"] == "Menu prices and tax details are missing."

        # Idempotent rejection check
        res_idempotent_rej = client.post("/api/v1/admin/restaurants/reject", json=reject_payload, headers=self.admin_headers)
        assert res_idempotent_rej.status_code == 200
        assert res_idempotent_rej.json().get("already_rejected") is True

        # 4. RESUBMIT: Owner fixes details and resubmits
        res_resubmit = client.post(f"/api/v1/restaurants/{rest_id}/submit", json={"phone": "+1 555-9988"}, headers=owner_headers)
        assert res_resubmit.status_code == 200
        data_resubmit = res_resubmit.json()
        assert data_resubmit["lifecycle_status"] == "PENDING_APPROVAL"
        assert data_resubmit["rejection_reason"] is None
        assert data_resubmit["submitted_at"] is not None

        # Verify Admin sees it back in PENDING_APPROVAL queue
        admin_pending = client.get("/api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL", headers=self.admin_headers)
        assert admin_pending.status_code == 200
        assert rest_id in [r["id"] for r in admin_pending.json()]

    def test_03_separate_archive_lifecycle(self):
        """
        LIFECYCLE TEST 3:
        Owner creates 'ARCHIVE DUPLICATE' -> submit -> PENDING_APPROVAL ->
        Admin archives -> ARCHIVED.
        Distinct from REJECTED:
        - lifecycle_status == 'ARCHIVED'
        - stores dismissed_by, dismissed_at, dismiss_reason
        - not in PENDING_APPROVAL queue
        - visible in ARCHIVED queue
        - idempotent archive
        """
        ts = int(time.time()) + 20
        owner_uid = f"usr_owner3_{ts}"
        owner_email = f"owner3_{ts}@dinely.test"
        owner_token = create_fake_jwt({"uid": owner_uid, "user_id": owner_uid, "email": owner_email, "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        rest_id = f"rest-archive-{ts}"

        # 1. Create & submit
        client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": "ARCHIVE DUPLICATE",
            "ownerUid": owner_uid,
            "ownerEmail": owner_email,
            "cuisine": "Test Cuisine",
        }, headers=owner_headers)

        client.post(f"/api/v1/restaurants/{rest_id}/submit", headers=owner_headers)

        # 2. Archive application
        archive_payload = {
            "restaurant_id": rest_id,
            "reason": "Duplicate test account created in error"
        }
        res_archive = client.post("/api/v1/admin/restaurants/archive", json=archive_payload, headers=self.admin_headers)
        assert res_archive.status_code == 200
        assert res_archive.json()["lifecycleStatus"] == "ARCHIVED"

        # Verify state in DB
        res_check = client.get(f"/api/v1/restaurants/{rest_id}", headers=owner_headers)
        assert res_check.status_code == 200
        data_check = res_check.json()
        assert data_check["lifecycle_status"] == "ARCHIVED"
        assert data_check["lifecycle_status"] != "REJECTED"
        assert data_check["dismiss_reason"] == "Duplicate test account created in error"
        assert data_check["dismissed_by"] == self.admin_email
        assert data_check["dismissed_at"] is not None

        # Admin queue does not contain it under PENDING_APPROVAL
        admin_pending = client.get("/api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL", headers=self.admin_headers)
        assert rest_id not in [r["id"] for r in admin_pending.json()]

        # But it IS listed under ARCHIVED
        admin_archived = client.get("/api/v1/admin/restaurants?lifecycle_status=ARCHIVED", headers=self.admin_headers)
        assert rest_id in [r["id"] for r in admin_archived.json()]

        # Idempotent archive check
        res_idempotent = client.post("/api/v1/admin/restaurants/archive", json=archive_payload, headers=self.admin_headers)
        assert res_idempotent.status_code == 200
        assert res_idempotent.json().get("already_archived") is True

    def test_04_multi_tenant_security_and_authorization_guards(self):
        """
        SECURITY ENFORCEMENT:
        1. Owner 1 cannot submit Owner 2's restaurant (HTTP 403).
        2. Non-admin cannot approve/reject/archive (HTTP 403).
        3. Unauthenticated requests fail (HTTP 401).
        4. Cannot submit an already LIVE restaurant (HTTP 400).
        """
        ts = int(time.time()) + 30
        owner1_uid = f"usr_sec1_{ts}"
        owner1_email = f"sec1_{ts}@dinely.test"
        owner1_token = create_fake_jwt({"uid": owner1_uid, "user_id": owner1_uid, "email": owner1_email, "role": "RESTAURANT_OWNER"})
        owner1_headers = {"Authorization": f"Bearer {owner1_token}"}
        rest1_id = f"rest-sec1-{ts}"

        owner2_uid = f"usr_sec2_{ts}"
        owner2_email = f"sec2_{ts}@dinely.test"
        owner2_token = create_fake_jwt({"uid": owner2_uid, "user_id": owner2_uid, "email": owner2_email, "role": "RESTAURANT_OWNER"})
        owner2_headers = {"Authorization": f"Bearer {owner2_token}"}
        rest2_id = f"rest-sec2-{ts}"

        # Create Restaurant 1 (Owner 1) and Restaurant 2 (Owner 2)
        client.post("/api/v1/restaurants", json={"id": rest1_id, "name": "Secure Rest 1", "ownerUid": owner1_uid, "ownerEmail": owner1_email}, headers=owner1_headers)
        client.post("/api/v1/restaurants", json={"id": rest2_id, "name": "Secure Rest 2", "ownerUid": owner2_uid, "ownerEmail": owner2_email}, headers=owner2_headers)

        # 1. Owner 1 attempts to submit Owner 2's restaurant -> 403 Forbidden
        cross_submit = client.post(f"/api/v1/restaurants/{rest2_id}/submit", headers=owner1_headers)
        assert cross_submit.status_code == 403

        # 2. Owner 1 attempts to approve restaurant (only Platform Admin allowed) -> 403 Forbidden
        owner_approve = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest1_id}, headers=owner1_headers)
        assert owner_approve.status_code == 403

        # 3. Unauthenticated submit attempt -> 401 Unauthorized
        anon_submit = client.post(f"/api/v1/restaurants/{rest1_id}/submit")
        assert anon_submit.status_code == 401

        # 4. Submit Restaurant 1 properly -> then approve it to LIVE
        submit_res = client.post(f"/api/v1/restaurants/{rest1_id}/submit", headers=owner1_headers)
        assert submit_res.status_code == 200
        approve_res = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest1_id}, headers=self.admin_headers)
        assert approve_res.status_code == 200

        # Attempt to submit already LIVE restaurant -> 400 Bad Request
        live_submit = client.post(f"/api/v1/restaurants/{rest1_id}/submit", headers=owner1_headers)
        assert live_submit.status_code == 400
        assert "already approved and LIVE" in live_submit.json()["detail"]

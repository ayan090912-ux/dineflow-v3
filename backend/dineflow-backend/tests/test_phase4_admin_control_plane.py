import json
import base64
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.config.settings import get_settings

client = TestClient(app)
settings = get_settings()


def create_fake_jwt(claims: dict) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_signature"
    return f"{header}.{payload}.{signature}"


class TestPhase4AdminControlPlane:
    """
    Authoritative test suite for DINELY PHASE 4 - PLATFORM ADMIN CONTROL PLANE:
    - Real owner: create restaurant -> submit
    - Admin: receives application
    - Admin: approve
    - Verify: PENDING_APPROVAL -> LIVE in PostgreSQL
    - Security: Only authorized Platform Admin can access admin APIs & WebSocket
    - Error Rule: 401/403/500/timeout/network error never converted to empty list
    """

    @pytest.fixture(autouse=True)
    def setup_identities(self):
        self.owner_email = f"owner-{uuid.uuid4().hex[:6]}@example.com"
        self.owner_uid = f"uid_owner_{uuid.uuid4().hex[:8]}"
        self.owner_token = create_fake_jwt({
            "uid": self.owner_uid,
            "email": self.owner_email,
            "role": "RESTAURANT_OWNER"
        })

        self.admin_email = "ayan090912@gmail.com"
        self.admin_uid = "uid_platform_admin_001"
        self.admin_token = create_fake_jwt({
            "uid": self.admin_uid,
            "email": self.admin_email,
            "email_verified": True,
            "admin": True,
            "role": "PLATFORM_ADMIN"
        })

        self.attacker_email = "attacker@gmail.com"
        self.attacker_token = create_fake_jwt({
            "uid": "uid_attacker_999",
            "email": self.attacker_email,
            "role": "CUSTOMER"
        })

    def test_phase4_end_to_end_owner_submit_admin_approve_flow(self):
        # =========================================================================
        # STEP 1: Real owner creates restaurant
        # =========================================================================
        print("\n>>> [TEST] STEP 1: Creating restaurant via POST /api/v1/restaurants...", flush=True)
        unique_slug = f"phase4-rest-{uuid.uuid4().hex[:6]}"
        rest_name = f"Phase 4 Bistro {uuid.uuid4().hex[:4].upper()}"

        create_payload = {
            "name": rest_name,
            "slug": unique_slug,
            "public_slug": unique_slug,
            "cuisine": "Contemporary Fusion",
            "businessType": "RESTAURANT",
            "ownerName": "Alex Rivera",
            "ownerEmail": self.owner_email,
            "ownerUid": self.owner_uid,
            "phone": "+91 9876543210",
            "email": self.owner_email,
            "address": "45 Cloud Boulevard, Silicon Plaza",
            "hasKitchen": True,
            "hasWaiter": True,
            "hasBar": False,
            "hasTables": True,
            "tableCount": 8,
            "initialStatus": "DRAFT",
            "lifecycleStatus": "DRAFT"
        }

        create_res = client.post(
            "/api/v1/restaurants",
            headers={"Authorization": f"Bearer {self.owner_token}"},
            json=create_payload
        )
        assert create_res.status_code == 201, f"Create restaurant failed: {create_res.text}"
        rest_data = create_res.json()
        rest_id = rest_data["id"]
        assert rest_data["lifecycle_status"] == "DRAFT"
        assert rest_data["is_approved"] is False
        print(f">>> [TEST] STEP 1 OK: Created restaurant {rest_id}", flush=True)

        # =========================================================================
        # STEP 2: Owner submits application
        # Transition: DRAFT -> PENDING_APPROVAL
        # =========================================================================
        print(f">>> [TEST] STEP 2: Submitting restaurant {rest_id} via POST /api/v1/restaurants/{rest_id}/submit...", flush=True)
        submit_payload = {
            "name": rest_name,
            "restaurantName": rest_name,
            "cuisine": "Contemporary Fusion",
            "businessType": "RESTAURANT",
            "address": "45 Cloud Boulevard, Silicon Plaza",
            "phone": "+91 9876543210",
            "email": self.owner_email,
            "totalTablesCount": 8
        }

        submit_res = client.post(
            f"/api/v1/restaurants/{rest_id}/submit",
            headers={"Authorization": f"Bearer {self.owner_token}"},
            json=submit_payload
        )
        assert submit_res.status_code == 200, f"Submit restaurant failed: {submit_res.text}"
        submitted_data = submit_res.json()
        assert submitted_data["lifecycle_status"] == "PENDING_APPROVAL"
        assert submitted_data["is_approved"] is False
        assert submitted_data["submitted_at"] is not None
        print(f">>> [TEST] STEP 2 OK: Submitted status is {submitted_data['lifecycle_status']}", flush=True)

        # =========================================================================
        # STEP 3: Platform Admin API receives application
        # Admin verifies pending application is in the queue
        # =========================================================================
        print(">>> [TEST] STEP 3: Admin querying /api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL...", flush=True)
        admin_pending_res = client.get(
            "/api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert admin_pending_res.status_code == 200, f"Admin get restaurants failed: {admin_pending_res.text}"
        pending_list = admin_pending_res.json()
        assert isinstance(pending_list, list)

        # Confirm the submitted restaurant is present in the admin pending queue
        matching_rest = next((r for r in pending_list if r["id"] == rest_id), None)
        assert matching_rest is not None, f"Restaurant {rest_id} not found in admin pending list"
        assert matching_rest["lifecycleStatus"] == "PENDING_APPROVAL"
        assert matching_rest["isApproved"] is False
        assert matching_rest["ownerEmail"] == self.owner_email
        print(f">>> [TEST] STEP 3 OK: Admin found pending restaurant {rest_id}", flush=True)

        # =========================================================================
        # STEP 4: Admin approves the application
        # =========================================================================
        print(f">>> [TEST] STEP 4: Admin approving restaurant {rest_id} via POST /api/v1/admin/restaurants/approve...", flush=True)
        approve_res = client.post(
            "/api/v1/admin/restaurants/approve",
            headers={"Authorization": f"Bearer {self.admin_token}"},
            json={"restaurant_id": rest_id, "reason": "Verified all compliance credentials"}
        )
        assert approve_res.status_code == 200, f"Admin approve failed: {approve_res.text}"
        approve_data = approve_res.json()
        assert approve_data["isApproved"] is True or approve_data.get("is_approved") is True
        assert approve_data["lifecycleStatus"] == "LIVE"
        print(f">>> [TEST] STEP 4 OK: Approved status is {approve_data['lifecycleStatus']}", flush=True)

        # =========================================================================
        # STEP 5: Verify PENDING_APPROVAL -> LIVE in PostgreSQL
        # =========================================================================
        print(f">>> [TEST] STEP 5: Verifying LIVE status in PostgreSQL via GET /api/v1/restaurants/{rest_id}...", flush=True)
        # Check details endpoint
        verify_res = client.get(f"/api/v1/restaurants/{rest_id}")
        assert verify_res.status_code == 200
        verified_data = verify_res.json()
        assert verified_data["lifecycle_status"] == "LIVE"
        assert verified_data["is_approved"] is True
        assert verified_data["status"] == "OPEN"

        # Verify restaurant is no longer in PENDING_APPROVAL queue
        post_pending_res = client.get(
            "/api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert post_pending_res.status_code == 200
        post_pending_list = post_pending_res.json()
        assert not any(r["id"] == rest_id for r in post_pending_list)

        # Verify restaurant IS in LIVE list
        live_res = client.get(
            "/api/v1/admin/restaurants?lifecycle_status=LIVE",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert live_res.status_code == 200
        live_list = live_res.json()
        assert any(r["id"] == rest_id for r in live_list)

    def test_phase4_admin_auth_security_boundary(self):
        # 1. Unauthenticated request to /admin/restaurants is 401
        res_unauth = client.get("/api/v1/admin/restaurants")
        assert res_unauth.status_code == 401

        # 2. Non-admin attacker cannot access admin API (403 Forbidden)
        res_attacker = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {self.attacker_token}"}
        )
        assert res_attacker.status_code == 403

        # 3. Owner token cannot access admin API (403 Forbidden)
        res_owner = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {self.owner_token}"}
        )
        assert res_owner.status_code == 403

        # 4. Non-admin cannot approve restaurants (403 Forbidden)
        res_fake_approve = client.post(
            "/api/v1/admin/restaurants/approve",
            headers={"Authorization": f"Bearer {self.owner_token}"},
            json={"restaurant_id": "any_id"}
        )
        assert res_fake_approve.status_code == 403

        # 5. Non-admin WebSocket connection to admin channel is rejected with 1008
        from starlette.websockets import WebSocketDisconnect
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect(f"/api/v1/ws?restaurant_id=global&role=PLATFORM_ADMIN&token={self.attacker_token}") as ws:
                pass
        assert exc_info.value.code == 1008

    def test_phase4_error_rule_non_200_never_produces_empty_state(self):
        # 401 Unauthorized returns an error detail, NEVER HTTP 200 []
        res_401 = client.get("/api/v1/admin/restaurants")
        assert res_401.status_code == 401
        body_401 = res_401.json()
        assert "detail" in body_401
        assert body_401 != []

        # 403 Forbidden returns an error detail, NEVER HTTP 200 []
        res_403 = client.get(
            "/api/v1/admin/restaurants",
            headers={"Authorization": f"Bearer {self.attacker_token}"}
        )
        assert res_403.status_code == 403
        body_403 = res_403.json()
        assert "detail" in body_403
        assert body_403 != []

import time
import json
import base64
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from app.main import app
from app.core.security.rbac import require_platform_admin

def create_fake_jwt(claims: dict) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"{header}.{payload}.fake_signature"

client = TestClient(app)

class TestPhase2TenantFoundation:
    """
    Phase 2: Database & Tenant Foundation Tests:
    1. Firebase User -> Membership -> Restaurant model
    2. One user can own multiple restaurants
    3. Hostname -> restaurant_domains -> restaurant_id canonical resolution
    4. Strict 404 for unknown tenant hostname
    5. User A -> Restaurant B = 403 Forbidden
    6. User B -> Restaurant A = 403 Forbidden
    """

    @pytest.fixture(autouse=True)
    def setup_admin(self):
        app.dependency_overrides[require_platform_admin] = lambda: {
            "uid": "admin_root",
            "email": "ayan090912@gmail.com",
            "role": "PLATFORM_ADMIN",
            "admin": True,
        }
        yield
        app.dependency_overrides.pop(require_platform_admin, None)

    def test_tenant_foundation_and_isolation(self):
        ts = int(time.time() * 1000)

        # -------------------------------------------------------------
        # User A setup
        # -------------------------------------------------------------
        uid_a = f"usr_owner_a_{ts}"
        email_a = f"owner_a_{ts}@dinely.test"
        token_a = create_fake_jwt({"uid": uid_a, "user_id": uid_a, "email": email_a, "role": "RESTAURANT_OWNER"})
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # -------------------------------------------------------------
        # User B setup
        # -------------------------------------------------------------
        uid_b = f"usr_owner_b_{ts}"
        email_b = f"owner_b_{ts}@dinely.test"
        token_b = create_fake_jwt({"uid": uid_b, "user_id": uid_b, "email": email_b, "role": "RESTAURANT_OWNER"})
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 1. User A creates Restaurant A
        res_a = client.post("/api/v1/restaurants", json={
            "name": f"Restaurant Alpha {ts}",
            "cuisine": "Italian",
            "ownerName": "Owner Alpha",
            "ownerEmail": email_a,
            "ownerUid": uid_a,
            "hasTables": True,
        }, headers=headers_a)
        assert res_a.status_code in [200, 201], f"Create A failed: {res_a.text}"
        data_a = res_a.json()
        rest_id_a = data_a["id"]
        slug_a = data_a.get("public_slug") or data_a.get("slug")
        hostname_a = f"{slug_a}.dinely.food"

        # Approve Restaurant A so it is LIVE
        appr_a = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_id_a})
        assert appr_a.status_code == 200

        # 2. User B creates Restaurant B
        res_b = client.post("/api/v1/restaurants", json={
            "name": f"Restaurant Beta {ts}",
            "cuisine": "Mexican",
            "ownerName": "Owner Beta",
            "ownerEmail": email_b,
            "ownerUid": uid_b,
            "hasTables": True,
        }, headers=headers_b)
        assert res_b.status_code in [200, 201], f"Create B failed: {res_b.text}"
        data_b = res_b.json()
        rest_id_b = data_b["id"]
        slug_b = data_b.get("public_slug") or data_b.get("slug")
        hostname_b = f"{slug_b}.dinely.food"

        # Approve Restaurant B so it is LIVE
        appr_b = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_id_b})
        assert appr_b.status_code == 200

        # -------------------------------------------------------------
        # TEST CRITERION 1: A -> A
        # -------------------------------------------------------------
        resolve_a = client.get(f"/api/v1/restaurants/public/resolve?hostname={hostname_a}")
        assert resolve_a.status_code == 200
        assert resolve_a.json()["id"] == rest_id_a
        assert resolve_a.json()["public_slug"] == slug_a

        # -------------------------------------------------------------
        # TEST CRITERION 2: B -> B
        # -------------------------------------------------------------
        resolve_b = client.get(f"/api/v1/restaurants/public/resolve?hostname={hostname_b}")
        assert resolve_b.status_code == 200
        assert resolve_b.json()["id"] == rest_id_b
        assert resolve_b.json()["public_slug"] == slug_b

        # -------------------------------------------------------------
        # TEST CRITERION 3: Unknown -> 404 (Never fall back)
        # -------------------------------------------------------------
        resolve_unknown = client.get("/api/v1/restaurants/public/resolve?hostname=does-not-exist-999.dinely.food")
        assert resolve_unknown.status_code == 404
        assert "not found" in resolve_unknown.json()["detail"].lower()

        # -------------------------------------------------------------
        # TEST CRITERION 4: User A -> Restaurant A = 200 OK
        # -------------------------------------------------------------
        access_a_by_a = client.get(f"/api/v1/restaurants/{rest_id_a}/owner-context", headers=headers_a)
        assert access_a_by_a.status_code == 200
        assert access_a_by_a.json()["restaurant_id"] == rest_id_a

        # -------------------------------------------------------------
        # TEST CRITERION 5: User B -> Restaurant B = 200 OK
        # -------------------------------------------------------------
        access_b_by_b = client.get(f"/api/v1/restaurants/{rest_id_b}/owner-context", headers=headers_b)
        assert access_b_by_b.status_code == 200
        assert access_b_by_b.json()["restaurant_id"] == rest_id_b

        # -------------------------------------------------------------
        # TEST CRITERION 6: User A -> Restaurant B = 403 Forbidden
        # -------------------------------------------------------------
        access_b_by_a = client.get(f"/api/v1/restaurants/{rest_id_b}/owner-context", headers=headers_a)
        assert access_b_by_a.status_code == 403, f"Expected 403, got {access_b_by_a.status_code}: {access_b_by_a.text}"

        # -------------------------------------------------------------
        # TEST CRITERION 7: User B -> Restaurant A = 403 Forbidden
        # -------------------------------------------------------------
        access_a_by_b = client.get(f"/api/v1/restaurants/{rest_id_a}/owner-context", headers=headers_b)
        assert access_a_by_b.status_code == 403, f"Expected 403, got {access_a_by_b.status_code}: {access_a_by_b.text}"

        # -------------------------------------------------------------
        # TEST CRITERION 8: One User -> Multiple Restaurants (User A owns A and A2)
        # -------------------------------------------------------------
        res_a2 = client.post("/api/v1/restaurants", json={
            "name": f"Restaurant Alpha Two {ts}",
            "cuisine": "French",
            "ownerName": "Owner Alpha",
            "ownerEmail": email_a,
            "ownerUid": uid_a,
            "hasTables": True,
        }, headers=headers_a)
        assert res_a2.status_code in [200, 201]
        rest_id_a2 = res_a2.json()["id"]

        # User A has access to both A and A2
        access_a2_by_a = client.get(f"/api/v1/restaurants/{rest_id_a2}/owner-context", headers=headers_a)
        assert access_a2_by_a.status_code == 200
        assert access_a2_by_a.json()["restaurant_id"] == rest_id_a2

        # User B still receives 403 on A2
        access_a2_by_b = client.get(f"/api/v1/restaurants/{rest_id_a2}/owner-context", headers=headers_b)
        assert access_a2_by_b.status_code == 403

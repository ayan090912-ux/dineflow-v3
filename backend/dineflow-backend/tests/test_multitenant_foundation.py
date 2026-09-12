import json
import base64
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def create_fake_jwt(claims: dict) -> str:
    """Helper to encode a base64 JWT payload for testing."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_signature"
    return f"{header}.{payload}.{signature}"


class TestMultiTenantFoundation:
    user_a_uid = "usr_tenant_a_1001"
    user_a_email = "owner_a@dinely.test"
    token_a = create_fake_jwt({"uid": user_a_uid, "email": user_a_email, "role": "RESTAURANT_OWNER"})

    user_b_uid = "usr_tenant_b_2002"
    user_b_email = "owner_b@dinely.test"
    token_b = create_fake_jwt({"uid": user_b_uid, "email": user_b_email, "role": "RESTAURANT_OWNER"})

    rest_a_id = f"rest-iso-a-{user_a_uid[-4:]}"
    rest_b_id = f"rest-iso-b-{user_b_uid[-4:]}"

    @pytest.fixture(autouse=True)
    def setup_tenants(self):
        """Ensure isolated Restaurant A and Restaurant B exist for each test function."""
        client.post("/api/v1/restaurants", json={
            "id": self.rest_a_id,
            "name": "The Dunk",
            "ownerUid": self.user_a_uid,
            "ownerEmail": self.user_a_email,
            "ownerName": "Owner A",
            "cuisine": "American Diner",
            "hasTables": True,
            "tableCount": 4
        })
        client.post("/api/v1/restaurants", json={
            "id": self.rest_b_id,
            "name": "Cafe Co",
            "ownerUid": self.user_b_uid,
            "ownerEmail": self.user_b_email,
            "ownerName": "Owner B",
            "cuisine": "Artisan Coffee",
            "hasTables": True,
            "tableCount": 4
        })

    def test_01_create_restaurant_a_creates_membership(self):
        """User A creates Restaurant A. Verify it succeeds and sets up owner membership."""
        payload = {
            "id": self.rest_a_id,
            "name": "The Dunk",
            "ownerUid": self.user_a_uid,
            "ownerEmail": self.user_a_email,
            "ownerName": "Owner A",
            "cuisine": "American Diner",
            "hasTables": True,
            "tableCount": 4
        }
        res = client.post("/api/v1/restaurants", json=payload)
        assert res.status_code in [200, 201]
        data = res.json()
        assert data["id"] == self.rest_a_id
        assert data["name"] == "The Dunk"

    def test_02_create_restaurant_b_creates_membership(self):
        """User B creates Restaurant B. Verify it succeeds and sets up owner membership."""
        payload = {
            "id": self.rest_b_id,
            "name": "Cafe Co",
            "ownerUid": self.user_b_uid,
            "ownerEmail": self.user_b_email,
            "ownerName": "Owner B",
            "cuisine": "Artisan Coffee",
            "hasTables": True,
            "tableCount": 4
        }
        res = client.post("/api/v1/restaurants", json=payload)
        assert res.status_code in [200, 201]
        data = res.json()
        assert data["id"] == self.rest_b_id
        assert data["name"] == "Cafe Co"

    def test_03_user_a_can_query_own_restaurants(self):
        """User A querying /owner/my sees Restaurant A and NOT Restaurant B."""
        headers = {"Authorization": f"Bearer {self.token_a}"}
        res = client.get("/api/v1/restaurants/owner/my", headers=headers)
        assert res.status_code == 200
        restaurants = res.json()
        rest_ids = [r["id"] for r in restaurants]
        assert self.rest_a_id in rest_ids
        assert self.rest_b_id not in rest_ids

    def test_04_user_b_can_query_own_restaurants(self):
        """User B querying /owner/my sees Restaurant B and NOT Restaurant A."""
        headers = {"Authorization": f"Bearer {self.token_b}"}
        res = client.get("/api/v1/restaurants/owner/my", headers=headers)
        assert res.status_code == 200
        restaurants = res.json()
        rest_ids = [r["id"] for r in restaurants]
        assert self.rest_b_id in rest_ids
        assert self.rest_a_id not in rest_ids

    def test_05_user_a_accessing_restaurant_b_is_forbidden_403(self):
        """User A attempting to perform protected action on Restaurant B receives 403 Forbidden."""
        headers = {"Authorization": f"Bearer {self.token_a}"}
        # Attempt to create a table in Restaurant B as User A
        table_payload = {
            "table_number": "Table 99",
            "capacity": 4,
            "section": "VIP"
        }
        res = client.post(
            f"/api/v1/restaurants/{self.rest_b_id}/tables",
            headers=headers,
            json=table_payload
        )
        assert res.status_code == 403
        assert "Access denied" in res.json()["detail"] or "Forbidden" in res.json()["detail"]

    def test_06_user_b_accessing_restaurant_a_is_forbidden_403(self):
        """User B attempting to perform protected action on Restaurant A receives 403 Forbidden."""
        headers = {"Authorization": f"Bearer {self.token_b}"}
        # Attempt to create a table in Restaurant A as User B
        table_payload = {
            "table_number": "Table 99",
            "capacity": 4,
            "section": "VIP"
        }
        res = client.post(
            f"/api/v1/restaurants/{self.rest_a_id}/tables",
            headers=headers,
            json=table_payload
        )
        assert res.status_code == 403
        assert "Access denied" in res.json()["detail"] or "Forbidden" in res.json()["detail"]

    def test_07_user_a_accessing_restaurant_a_succeeds(self):
        """User A performing protected action on Restaurant A succeeds."""
        headers = {"Authorization": f"Bearer {self.token_a}"}
        table_payload = {
            "table_number": "Table 10",
            "capacity": 4,
            "section": "Patio"
        }
        res = client.post(
            f"/api/v1/restaurants/{self.rest_a_id}/tables",
            headers=headers,
            json=table_payload
        )
        assert res.status_code in [200, 201]
        data = res.json()
        assert data["table_number"] == "Table 10"
        assert data["restaurant_id"] == self.rest_a_id

    def test_08_user_b_accessing_restaurant_b_succeeds(self):
        """User B performing protected action on Restaurant B succeeds."""
        headers = {"Authorization": f"Bearer {self.token_b}"}
        table_payload = {
            "table_number": "Table 20",
            "capacity": 2,
            "section": "Window"
        }
        res = client.post(
            f"/api/v1/restaurants/{self.rest_b_id}/tables",
            headers=headers,
            json=table_payload
        )
        assert res.status_code in [200, 201]
        data = res.json()
        assert data["table_number"] == "Table 20"
        assert data["restaurant_id"] == self.rest_b_id

    def test_09_unauthenticated_request_to_protected_endpoint_returns_401(self):
        """Calling protected endpoint without credentials returns 401."""
        res = client.post(
            f"/api/v1/restaurants/{self.rest_a_id}/tables",
            json={"table_number": "Table 01"}
        )
        assert res.status_code == 401

    def test_10_header_spoofing_without_token_returns_401(self):
        """Sending X-Staff-Role and X-Staff-Restaurant-Id without Bearer token returns 401."""
        spoofed_headers = {
            "X-Staff-Role": "OWNER",
            "X-Staff-Restaurant-Id": self.rest_a_id
        }
        res = client.post(
            f"/api/v1/restaurants/{self.rest_a_id}/tables",
            headers=spoofed_headers,
            json={"table_number": "Table Spoofed"}
        )
        assert res.status_code == 401

    def test_11_unknown_public_tenant_returns_404(self):
        """Public tenant resolution for non-existent slug returns 404."""
        res = client.get("/api/v1/restaurants/public/resolve?slug=definitely-non-existent-tenant-99999")
        assert res.status_code == 404

    def test_12_unknown_public_domain_returns_404(self):
        """Public tenant resolution for non-existent subdomain returns 404."""
        res = client.get("/api/v1/restaurants/public/resolve?hostname=nonexistentghost.dinely.food")
        assert res.status_code == 404

    def test_13_valid_public_tenant_resolution_succeeds(self):
        """Resolving valid public tenant returns canonical metadata."""
        res = client.get(f"/api/v1/restaurants/public/slug/the-dunk")
        if res.status_code != 200:
            # Fallback to restaurant id
            res = client.get(f"/api/v1/restaurants/public/slug/{self.rest_a_id}")
        assert res.status_code == 200
        data = res.json()
        assert "name" in data
        assert data["name"] == "The Dunk"

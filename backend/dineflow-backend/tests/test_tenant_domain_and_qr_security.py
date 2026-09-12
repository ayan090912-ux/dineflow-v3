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


class TestTenantDomainAndQRSecurity:
    """
    Automated verification of:
    1. Canonical tenant domain resolution: the-dunk.dinely.food -> THE DUNK restaurant details
    2. Unknown tenant subdomain: unknown.dinely.food -> 404 Venue Not Found (never fallback)
    3. QR code URL generation: clean 2-digit table format: https://the-dunk.dinely.food/customer?table=01
    4. Cross-tenant QR security: table.restaurant_id == hostname.restaurant_id
       - Matching table -> 200 OK
       - Cross-tenant table (table from Rest B queried under Rest A) -> 403 Forbidden
       - Non-existent table -> 404 Not Found (Zero auto-creation of tables)
    """

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

    def test_01_tenant_domain_resolution_and_unknown_tenant_404(self):
        """
        Test tenant domain resolution:
        - LIVE restaurant resolves cleanly via hostname parameter or Host header
        - Unknown tenant returns 404
        """
        ts = int(time.time())
        owner_uid = f"usr_owner_dunk_{ts}"
        owner_email = f"owner_dunk_{ts}@dinely.test"
        owner_token = create_fake_jwt({"uid": owner_uid, "user_id": owner_uid, "email": owner_email, "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        rest_id = f"rest-dunk-{ts}"

        # 1. Create and approve "THE DUNK"
        create_res = client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": f"The Dunk {ts}",
            "ownerUid": owner_uid,
            "ownerEmail": owner_email,
            "ownerName": "Dunk Owner",
            "hasTables": True,
            "tableCount": 8
        }, headers=owner_headers)
        assert create_res.status_code in [200, 201]
        data = create_res.json()
        public_slug = data.get("public_slug") or data.get("slug")
        canonical_hostname = f"{public_slug}.dinely.food"

        # Submit and approve so restaurant is LIVE
        client.post(f"/api/v1/restaurants/{rest_id}/submit", headers=owner_headers)
        res_appr = client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_id}, headers=self.admin_headers)
        assert res_appr.status_code == 200, f"Approval failed: {res_appr.text}"

        # 2. Hostname resolver lookup for LIVE tenant
        res_resolve = client.get(f"/api/v1/restaurants/public/resolve?hostname={canonical_hostname}")
        assert res_resolve.status_code == 200, f"Domain resolve failed: {res_resolve.text}"
        resolve_data = res_resolve.json()
        assert resolve_data["id"] == rest_id
        assert resolve_data["public_slug"] == public_slug

        # 3. Unknown tenant resolution: MUST return 404 Venue Not Found, NEVER fallback to another restaurant
        res_unknown = client.get("/api/v1/restaurants/public/resolve?hostname=unknown-nonexistent-tenant.dinely.food")
        assert res_unknown.status_code == 404, f"Expected 404 for unknown tenant, got {res_unknown.status_code}"
        assert "not found" in res_unknown.text.lower() or "unrecognized" in res_unknown.text.lower()

    def test_02_qr_code_generation_format(self):
        """
        QR must be generated from restaurant_id + table_id:
        Expected format: https://<slug>.dinely.food/customer?table=01
        Must have clean 2-digit format, no spaces, no tableId query param.
        """
        ts = int(time.time())
        owner_uid = f"usr_owner_qr_{ts}"
        owner_email = f"owner_qr_{ts}@dinely.test"
        owner_token = create_fake_jwt({"uid": owner_uid, "user_id": owner_uid, "email": owner_email, "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        rest_id = f"rest-qr-{ts}"

        create_res = client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": f"QR Venue {ts}",
            "ownerUid": owner_uid,
            "ownerEmail": owner_email,
            "ownerName": "QR Owner",
            "hasTables": True,
            "tableCount": 4
        }, headers=owner_headers)
        assert create_res.status_code in [200, 201]
        data = create_res.json()
        public_slug = data.get("public_slug") or data.get("slug")

        # Fetch tables for this restaurant
        res_tables = client.get(f"/api/v1/restaurants/{rest_id}/tables")
        assert res_tables.status_code == 200
        tables = res_tables.json()
        assert len(tables) >= 1

        for tbl in tables:
            qr_url = tbl.get("qr_code_url")
            assert qr_url is not None, f"Table {tbl.get('id')} has no qr_code_url"
            # Must start with https://<slug>.dinely.food/customer?table=
            expected_prefix = f"https://{public_slug}.dinely.food/customer?table="
            assert qr_url.startswith(expected_prefix), f"QR URL '{qr_url}' does not start with '{expected_prefix}'"
            # Verify clean table number (e.g. 01, 02) with no spaces and canonical tableId
            table_param = qr_url.split("?table=")[1].split("&")[0]
            assert " " not in qr_url, f"QR URL '{qr_url}' contains spaces"
            assert "&tableId=" in qr_url, f"QR URL '{qr_url}' missing canonical tableId"
            assert len(table_param) >= 2, f"Table param '{table_param}' should be padded to at least 2 chars"

    def test_03_qr_cross_tenant_security_verification(self):
        """
        QR SECURITY TEST:
        Hostname identifies restaurant. Table identifies table.
        Verify: table.restaurant_id == hostname.restaurant_id
        - Table in Rest A queried under Rest A -> 200/201 (Valid Session)
        - Table in Rest B queried under Rest A -> 403 Forbidden
        - Non-existent table queried under Rest A -> 404 Not Found (Zero auto-creation)
        """
        ts = int(time.time())
        
        # 1. Create Restaurant A (The Dunk)
        rest_a_id = f"rest-a-dunk-{ts}"
        owner_a_token = create_fake_jwt({"uid": f"usr_a_{ts}", "user_id": f"usr_a_{ts}", "email": f"a_{ts}@d.com", "role": "RESTAURANT_OWNER"})
        res_a = client.post("/api/v1/restaurants", json={
            "id": rest_a_id,
            "name": f"Dunk A {ts}",
            "ownerUid": f"usr_a_{ts}",
            "hasTables": True,
            "tableCount": 4
        }, headers={"Authorization": f"Bearer {owner_a_token}"})
        assert res_a.status_code in [200, 201]

        # 2. Create Restaurant B (Cafe Co)
        rest_b_id = f"rest-b-cafeco-{ts}"
        owner_b_token = create_fake_jwt({"uid": f"usr_b_{ts}", "user_id": f"usr_b_{ts}", "email": f"b_{ts}@d.com", "role": "RESTAURANT_OWNER"})
        res_b = client.post("/api/v1/restaurants", json={
            "id": rest_b_id,
            "name": f"Cafe B {ts}",
            "ownerUid": f"usr_b_{ts}",
            "hasTables": True,
            "tableCount": 4
        }, headers={"Authorization": f"Bearer {owner_b_token}"})
        assert res_b.status_code in [200, 201]

        # Retrieve tables for both
        tables_a = client.get(f"/api/v1/restaurants/{rest_a_id}/tables").json()
        tables_b = client.get(f"/api/v1/restaurants/{rest_b_id}/tables").json()
        assert len(tables_a) > 0 and len(tables_b) > 0

        tbl_a_id = tables_a[0]["id"]
        tbl_b_id = tables_b[0]["id"]

        # 3. Legitimate scan: Table A under Restaurant A -> Creates/claims session successfully (HTTP 201)
        res_legit = client.post(f"/api/v1/restaurants/{rest_a_id}/tables/{tbl_a_id}/session")
        assert res_legit.status_code == 201, f"Legitimate session failed: {res_legit.text}"
        session_data = res_legit.json()
        assert session_data["status"] == "ACTIVE"
        assert session_data["restaurant_id"] == rest_a_id

        # 4. Cross-tenant attack: Table B scanned/injected under Restaurant A
        # MUST trigger HTTP 403 Forbidden!
        res_cross = client.post(f"/api/v1/restaurants/{rest_a_id}/tables/{tbl_b_id}/session")
        assert res_cross.status_code == 403, f"Cross-tenant injection did not return 403, got {res_cross.status_code}: {res_cross.text}"
        assert "not belong" in res_cross.text.lower()

        # Cross-tenant GET session lookup must also trigger HTTP 403 Forbidden!
        res_cross_get = client.get(f"/api/v1/restaurants/{rest_a_id}/tables/{tbl_b_id}/session")
        assert res_cross_get.status_code == 403, f"Cross-tenant GET did not return 403, got {res_cross_get.status_code}: {res_cross_get.text}"

        # 5. Non-existent table under Restaurant A: MUST return HTTP 404 Not Found (NO auto-creation!)
        fake_table_id = f"tbl-totally-fake-{ts}"
        res_nonexistent = client.post(f"/api/v1/restaurants/{rest_a_id}/tables/{fake_table_id}/session")
        assert res_nonexistent.status_code == 404, f"Non-existent table did not return 404, got {res_nonexistent.status_code}: {res_nonexistent.text}"

        # Verify that fake table was NOT inserted into the database!
        tables_a_after = client.get(f"/api/v1/restaurants/{rest_a_id}/tables").json()
        table_ids_after = [t["id"] for t in tables_a_after]
        assert fake_table_id not in table_ids_after, f"Security violation: fake table '{fake_table_id}' was auto-created in database!"

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


class TestDinelyTenantDomainArchitecture:
    """
    Comprehensive Test Suite for Dinely Multi-Tenant URL Architecture:
    1. Primary platform domain (dinely.food) vs Tenant public domain (<slug>.dinely.app)
    2. Canonical public_slug generation & collision handling
    3. Hostname/subdomain tenant resolution with zero fallbacks
    4. 404 on unknown subdomains/slugs
    5. Tenant-specific QR codes pointing to https://<slug>.dinely.app
    6. Multi-tenant data & order isolation between THE DUNK and CAFE.CO
    """

    def test_public_slug_generation_and_uniqueness(self):
        t_stamp = int(time.time() * 1000)
        rest_dunk_id = f"rest-dunk-{t_stamp}"
        rest_dunk2_id = f"rest-dunk2-{t_stamp}"
        rest_cafe_id = f"rest-cafe-{t_stamp}"

        # 1. Create Restaurant A: "THE DUNK"
        resp_a = client.post("/api/v1/restaurants", json={
            "id": rest_dunk_id,
            "name": f"The Dunk {t_stamp}",
            "cuisine": "American Gourmet",
            "ownerName": "Dunk Owner",
            "ownerEmail": f"dunk_{t_stamp}@test.com",
            "hasTables": True,
        })
        assert resp_a.status_code == 201
        data_a = resp_a.json()
        slug_a = data_a["public_slug"] or data_a["slug"]
        assert slug_a.startswith(f"the-dunk-{t_stamp}")
        assert data_a["domain"] == f"https://{slug_a}.dinely.app"

        # 2. Create Restaurant B with SAME NAME to test collision safety
        resp_b = client.post("/api/v1/restaurants", json={
            "id": rest_dunk2_id,
            "name": f"The Dunk {t_stamp}",
            "cuisine": "American Gourmet",
            "ownerName": "Dunk Owner 2",
            "ownerEmail": f"dunk2_{t_stamp}@test.com",
            "hasTables": True,
        })
        assert resp_b.status_code == 201
        data_b = resp_b.json()
        slug_b = data_b["public_slug"] or data_b["slug"]
        assert slug_b != slug_a, "Duplicate slug generated! Must be unique & collision safe."
        assert slug_b.startswith(f"the-dunk-{t_stamp}-")
        assert data_b["domain"] == f"https://{slug_b}.dinely.app"

        # 3. Create Restaurant C: "CAFE.CO"
        resp_c = client.post("/api/v1/restaurants", json={
            "id": rest_cafe_id,
            "name": f"Cafe Co {t_stamp}",
            "cuisine": "European Cafe",
            "ownerName": "Cafe Owner",
            "ownerEmail": f"cafe_{t_stamp}@test.com",
            "hasTables": True,
        })
        assert resp_c.status_code == 201
        data_c = resp_c.json()
        slug_c = data_c["public_slug"] or data_c["slug"]
        assert slug_c.startswith(f"cafe-co-{t_stamp}")
        assert data_c["domain"] == f"https://{slug_c}.dinely.app"

    def test_hostname_and_slug_public_tenant_resolution(self):
        t_stamp = int(time.time() * 1000)
        rest_id = f"rest-resolve-{t_stamp}"

        create_res = client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": f"Resolution Bistro {t_stamp}",
            "cuisine": "Fusion",
            "ownerEmail": f"owner_{t_stamp}@test.com",
            "hasTables": True,
        })
        assert create_res.status_code == 201
        created = create_res.json()
        slug = created["public_slug"] or created["slug"]

        # 1. Resolve by slug directly
        res_slug = client.get(f"/api/v1/restaurants/public/slug/{slug}")
        assert res_slug.status_code == 200
        data_slug = res_slug.json()
        assert data_slug["id"] == rest_id
        assert data_slug["publicSlug"] == slug
        assert data_slug["domain"] == f"https://{slug}.dinely.app"

        # 2. Resolve by production hostname: <slug>.dinely.app
        res_host = client.get(f"/api/v1/restaurants/public/resolve?hostname={slug}.dinely.app")
        assert res_host.status_code == 200
        data_host = res_host.json()
        assert data_host["id"] == rest_id
        assert data_host["publicSlug"] == slug

        # 3. Resolve by local development hostname: <slug>.localhost:5173
        res_local = client.get(f"/api/v1/restaurants/public/resolve?hostname={slug}.localhost:5173")
        assert res_local.status_code == 200
        data_local = res_local.json()
        assert data_local["id"] == rest_id

    def test_unknown_subdomain_returns_404_strict_no_fallback(self):
        # 1. Querying unknown slug must return 404
        res_404_slug = client.get("/api/v1/restaurants/public/slug/totally-unknown-slug-xyz-999")
        assert res_404_slug.status_code == 404
        assert "not found" in res_404_slug.json()["detail"].lower()

        # 2. Querying unknown subdomain must return 404, NEVER fall back to another restaurant!
        res_404_host = client.get("/api/v1/restaurants/public/resolve?hostname=nonexistent-restaurant.dinely.app")
        assert res_404_host.status_code == 404
        assert "not found" in res_404_host.json()["detail"].lower()

    def test_customer_qr_codes_point_to_tenant_public_subdomain(self):
        t_stamp = int(time.time() * 1000)
        rest_id = f"rest-qr-tenant-{t_stamp}"

        create_res = client.post("/api/v1/restaurants", json={
            "id": rest_id,
            "name": f"QR Bistro {t_stamp}",
            "cuisine": "Italian",
            "ownerEmail": f"qr_owner_{t_stamp}@test.com",
            "hasTables": True,
        })
        assert create_res.status_code == 201
        created = create_res.json()
        slug = created["public_slug"] or created["slug"]

        # Fetch pre-created tables
        tbls_res = client.get(f"/api/v1/restaurants/{rest_id}/tables")
        assert tbls_res.status_code == 200
        tbls = tbls_res.json()
        assert len(tbls) >= 1

        for tbl in tbls:
            expected_prefix = f"https://{slug}.dinely.app/customer?table="
            assert tbl["qr_code_url"].startswith(expected_prefix), (
                f"QR Code URL '{tbl['qr_code_url']}' does not point to tenant subdomain '{expected_prefix}'!"
            )

        # Create new table and verify QR
        new_tbl_res = client.post(f"/api/v1/restaurants/{rest_id}/tables", json={
            "tableNumber": "Table 99",
            "section": "VIP Lounge",
            "capacity": 6,
        })
        assert new_tbl_res.status_code == 201
        new_tbl = new_tbl_res.json()
        assert new_tbl["qr_code_url"] == f"https://{slug}.dinely.app/customer?table=Table 99"

    def test_two_restaurants_simultaneous_isolation(self):
        t_stamp = int(time.time() * 1000)
        owner_email = f"multi_owner_{t_stamp}@test.com"
        owner_uid = f"uid_multi_{t_stamp}"

        # Create THE DUNK
        dunk_id = f"rest-dunk-iso-{t_stamp}"
        client.post("/api/v1/restaurants", json={
            "id": dunk_id,
            "name": f"The Dunk {t_stamp}",
            "cuisine": "American",
            "ownerEmail": owner_email,
            "ownerUid": owner_uid,
            "hasTables": True,
        })

        # Create CAFE.CO
        cafe_id = f"rest-cafe-iso-{t_stamp}"
        client.post("/api/v1/restaurants", json={
            "id": cafe_id,
            "name": f"Cafe Co {t_stamp}",
            "cuisine": "European",
            "ownerEmail": owner_email,
            "ownerUid": owner_uid,
            "hasTables": True,
        })

        # Create Menu item on THE DUNK
        item_dunk_res = client.post(f"/api/v1/restaurants/{dunk_id}/menu", json={
            "name": "Smoked Bacon Burger",
            "price": 450.0,
            "categoryId": "Main Course",
            "isAvailable": True,
        })
        assert item_dunk_res.status_code == 201

        # Create Menu item on CAFE.CO
        item_cafe_res = client.post(f"/api/v1/restaurants/{cafe_id}/menu", json={
            "name": "Artisan Almond Croissant",
            "price": 220.0,
            "categoryId": "Bakery",
            "isAvailable": True,
        })
        assert item_cafe_res.status_code == 201

        # Verify Menu isolation:
        # THE DUNK must only have Smoked Bacon Burger
        dunk_menu = client.get(f"/api/v1/restaurants/{dunk_id}/menu").json()["items"]
        dunk_names = [i["name"] for i in dunk_menu]
        assert "Smoked Bacon Burger" in dunk_names
        assert "Artisan Almond Croissant" not in dunk_names, "Cross-tenant menu leak!"

        # CAFE.CO must only have Artisan Almond Croissant
        cafe_menu = client.get(f"/api/v1/restaurants/{cafe_id}/menu").json()["items"]
        cafe_names = [i["name"] for i in cafe_menu]
        assert "Artisan Almond Croissant" in cafe_names
        assert "Smoked Bacon Burger" not in cafe_names, "Cross-tenant menu leak!"

        # Verify Multi-tenant Owner Workspace query lists both
        owner_rests = client.get(f"/api/v1/restaurants/owner/my?owner_email={owner_email}&owner_uid={owner_uid}").json()
        owner_ids = [r["id"] for r in owner_rests]
        assert dunk_id in owner_ids
        assert cafe_id in owner_ids

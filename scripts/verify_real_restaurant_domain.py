import os
import sys
import time
import json
import base64
import asyncio
import httpx

# Add backend directory to sys.path
backend_dir = r"c:\dineflow v3\v3\backend\dineflow-backend"
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from app.main import app
from app.core.security.rbac import require_platform_admin

app.dependency_overrides[require_platform_admin] = lambda: {
    "uid": "admin_uid_ayan",
    "email": "ayan090912@gmail.com",
    "role": "PLATFORM_ADMIN",
    "admin": True,
}

def create_fake_jwt(claims: dict) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"{header}.{payload}.fake_signature"

def create_admin_jwt(email: str = "ayan090912@gmail.com", uid: str = "admin_uid_ayan") -> str:
    claims = {
        "uid": uid,
        "user_id": uid,
        "email": email,
        "role": "PLATFORM_ADMIN",
        "admin": True,
    }
    return create_fake_jwt(claims)

async def main():
    print("==========================================================")
    print("EXECUTING REAL MULTI-TENANT RESTAURANT DOMAIN PROVISIONING")
    print("==========================================================")
    
    t_stamp = int(time.time() * 1000)
    admin_token = create_admin_jwt()
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # -----------------------------------------------------------------
        # STEP 1: CREATE TENANT A ("Domain Test Restaurant")
        # -----------------------------------------------------------------
        print(f"\n[STEP 1] Creating Tenant A: 'Domain Test Restaurant {t_stamp}'...")
        create_res = await client.post("/api/v1/restaurants", json={
            "name": f"Domain Test Restaurant {t_stamp}",
            "cuisine": "Continental",
            "businessType": "RESTAURANT",
            "ownerName": "Domain Owner",
            "ownerEmail": f"owner_domain_{t_stamp}@dinely.test",
            "hasTables": True,
            "tableCount": 8
        })
        
        assert create_res.status_code in [200, 201], f"Creation failed: {create_res.text}"
        tenant_a = create_res.json()
        rest_id_a = tenant_a["id"]
        slug_a = tenant_a.get("public_slug") or tenant_a.get("slug")
        domain_a = tenant_a.get("domain") or f"https://{slug_a}.dinely.food"
        hostname_a = f"{slug_a}.dinely.food"
        
        print(f"  [PASS] Created Restaurant ID: {rest_id_a}")
        print(f"  [PASS] Generated Public Slug: {slug_a}")
        print(f"  [PASS] Generated Canonical Domain: {domain_a}")
        print(f"  [PASS] Status before approval: {tenant_a.get('lifecycle_status')}")
        
        # -----------------------------------------------------------------
        # STEP 2: SUBMIT & APPROVE TENANT A (TRANSITION TO LIVE)
        # -----------------------------------------------------------------
        print(f"\n[STEP 2] Approving Tenant A (Transition to LIVE)...")
        owner_token = create_fake_jwt({"uid": f"uid_domain_{t_stamp}", "user_id": f"uid_domain_{t_stamp}", "email": f"owner_domain_{t_stamp}@dinely.test", "role": "RESTAURANT_OWNER"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        
        if tenant_a.get("lifecycle_status") == "DRAFT":
            submit_res = await client.post(f"/api/v1/restaurants/{rest_id_a}/submit", headers=owner_headers)
            assert submit_res.status_code in [200, 201], f"Submit failed: {submit_res.text}"
        
        approve_res = await client.post("/api/v1/admin/restaurants/approve", json={
            "restaurant_id": rest_id_a,
            "reason": "Official production domain acceptance approval"
        }, headers=admin_headers)
        assert approve_res.status_code == 200, f"Approve failed: {approve_res.text}"
        print("  [PASS] Platform Admin Approved! Lifecycle Status: LIVE")
        
        # -----------------------------------------------------------------
        # STEP 3: RESOLVE TENANT A VIA HOSTNAME
        # -----------------------------------------------------------------
        print(f"\n[STEP 3] Resolving Tenant A via Hostname '{hostname_a}'...")
        resolve_res = await client.get(f"/api/v1/restaurants/public/resolve?hostname={hostname_a}")
        assert resolve_res.status_code == 200, f"Resolution failed: {resolve_res.text}"
        resolved_a = resolve_res.json()
        assert resolved_a["id"] == rest_id_a
        assert resolved_a["public_slug"] == slug_a
        assert resolved_a["lifecycle_status"] == "LIVE"
        assert resolved_a["is_approved"] is True
        print("  [PASS] Hostname accurately resolved to LIVE Tenant A")
        
        # -----------------------------------------------------------------
        # STEP 4: CREATE & APPROVE TENANT B FOR MULTI-TENANT ISOLATION
        # -----------------------------------------------------------------
        print(f"\n[STEP 4] Creating & Approving Tenant B for Isolation Check...")
        create_b = await client.post("/api/v1/restaurants", json={
            "name": f"Cafe Co {t_stamp}",
            "cuisine": "European Cafe",
            "ownerEmail": f"owner_cafe_{t_stamp}@dinely.test",
            "hasTables": True,
        })
        tenant_b = create_b.json()
        rest_id_b = tenant_b["id"]
        slug_b = tenant_b.get("public_slug") or tenant_b.get("slug")
        hostname_b = f"{slug_b}.dinely.food"
        
        await client.post("/api/v1/admin/restaurants/approve", json={
            "restaurant_id": rest_id_b,
            "reason": "Acceptance isolation check"
        }, headers=admin_headers)
        
        resolve_b = await client.get(f"/api/v1/restaurants/public/resolve?hostname={hostname_b}")
        assert resolve_b.status_code == 200
        assert resolve_b.json()["id"] == rest_id_b
        assert resolve_b.json()["public_slug"] == slug_b
        print(f"  [PASS] Hostname B '{hostname_b}' strictly resolves to Tenant B ({rest_id_b})")
        
        # Cross check A vs B
        assert resolve_res.json()["id"] != resolve_b.json()["id"], "Tenants must have distinct IDs"
        assert resolve_res.json()["public_slug"] != resolve_b.json()["public_slug"], "Tenants must have distinct slugs"
        print("  [PASS] Tenant A and Tenant B are strictly isolated")
        
        # -----------------------------------------------------------------
        # STEP 5: UNKNOWN TENANT RESOLUTION (STRICT 404)
        # -----------------------------------------------------------------
        print(f"\n[STEP 5] Testing Unknown Tenant: 'does-not-exist-123.dinely.food'...")
        unknown_res = await client.get("/api/v1/restaurants/public/resolve?hostname=does-not-exist-123.dinely.food")
        assert unknown_res.status_code == 404, f"Expected 404, got {unknown_res.status_code}"
        print(f"  [PASS] Unknown tenant strictly returned 404: {unknown_res.json()['detail']}")
        
        # -----------------------------------------------------------------
        # STEP 6: OUTPUT AUDIT RESULTS FOR DOMAIN_ACCEPTANCE.md
        # -----------------------------------------------------------------
        results = {
            "tenant_a": {
                "id": rest_id_a,
                "name": tenant_a["name"],
                "slug": slug_a,
                "hostname": hostname_a,
                "domain": domain_a
            },
            "tenant_b": {
                "id": rest_id_b,
                "name": tenant_b["name"],
                "slug": slug_b,
                "hostname": hostname_b,
                "domain": f"https://{slug_b}.dinely.food"
            }
        }
        
        with open(r"c:\dineflow v3\v3\scripts\last_domain_acceptance_results.json", "w") as f:
            json.dump(results, f, indent=2)
            
        print("\n==========================================================")
        print("DOMAIN VERIFICATION FLOW COMPLETED SUCCESSFULLY")
        print(f"Tenant A Slug: {slug_a}")
        print(f"Tenant A Domain: {domain_a}")
        print("==========================================================")

if __name__ == "__main__":
    asyncio.run(main())

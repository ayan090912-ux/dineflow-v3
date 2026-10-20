import json
import uuid
import httpx
from datetime import datetime, timezone
from jose import jwt

# Load settings from backend config
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "dineflow-backend")))
from app.core.config.settings import get_settings

settings = get_settings()
PROD_URL = "https://dinely.food"
REST_ID = "rest-1792151659078-4f1d79" # local-vender
EVENT_ID = "evt-ba5c26e140"
OTHER_REST_ID = "rest-tenant-other-999"

PROD_JWT_KEY = "1c0ac721f76710ccb0d0da23a1c5d81d6ebecb652fe4fffe57a64e6e2f47ace4"

def create_jwt(payload: dict) -> str:
    claims = {
        "exp": int(datetime.now(timezone.utc).timestamp()) + 3600,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        **payload,
    }
    return jwt.encode(claims, PROD_JWT_KEY, algorithm="HS256")

def main():
    print("=" * 70)
    print("  LIVE PRODUCTION API VERIFICATION: BAR, HOOKAH & TABLE ASSISTANCE")
    print(f"  Target: {PROD_URL}")
    print(f"  Tenant: {REST_ID} (local vender)")
    print(f"  Event:  {EVENT_ID}")
    print("=" * 70)

    # 1. Generate authorized tokens
    owner_token = create_jwt({
        "uid": "W45wtagVNccn438qLzKFpr047t63",
        "email": "ayanamity77@gmail.com",
        "role": "OWNER",
        "scope": "OWNER",
        "restaurant_id": REST_ID
    })

    bar_token = create_jwt({
        "uid": "staff_bar_live_01",
        "email": "bartender@staff.dinely.internal",
        "role": "BAR",
        "scope": "STAFF",
        "restaurant_id": REST_ID
    })

    hookah_token = create_jwt({
        "uid": "staff_hookah_live_01",
        "email": "hookah@staff.dinely.internal",
        "role": "HOOKAH",
        "scope": "STAFF",
        "restaurant_id": REST_ID
    })

    waiter_token = create_jwt({
        "uid": "staff_waiter_live_01",
        "email": "waiter@staff.dinely.internal",
        "role": "WAITER",
        "scope": "STAFF",
        "restaurant_id": REST_ID
    })

    other_bar_token = create_jwt({
        "uid": "staff_other_live_01",
        "email": "other_bar@staff.dinely.internal",
        "role": "BAR",
        "scope": "STAFF",
        "restaurant_id": OTHER_REST_ID
    })

    with httpx.Client(base_url=PROD_URL, timeout=15.0) as client:
        # TEST 1: Health & Readiness Check
        print("\n[TEST 1] Probing /healthz and /readyz...")
        res_health = client.get("/healthz")
        assert res_health.status_code == 200, f"Health check failed: {res_health.status_code}"
        h_data = res_health.json()
        print(f"  ✓ /healthz HTTP 200 | Commit: {h_data.get('commit')} | Version: {h_data.get('version')}")

        res_ready = client.get("/readyz")
        assert res_ready.status_code == 200, f"Readiness check failed: {res_ready.status_code}"
        r_data = res_ready.json()
        print(f"  ✓ /readyz HTTP 200 | Database: {r_data.get('database')}")

        # TEST 2: Unauthenticated Access Rejection
        print("\n[TEST 2] Verifying unauthenticated requests are rejected (401)...")
        r_unauth_bar = client.get(f"/api/v1/orders/restaurant/{REST_ID}?station=BAR")
        assert r_unauth_bar.status_code == 401, f"Expected 401, got {r_unauth_bar.status_code}"
        print(f"  ✓ Unauthenticated BAR query rejected: HTTP {r_unauth_bar.status_code}")

        r_unauth_ast = client.get(f"/api/v1/restaurants/{REST_ID}/events/{EVENT_ID}/assistance")
        assert r_unauth_ast.status_code == 401, f"Expected 401, got {r_unauth_ast.status_code}"
        print(f"  ✓ Unauthenticated Table Assistance query rejected: HTTP {r_unauth_ast.status_code}")

        # TEST 3: Cross-Tenant Isolation
        print("\n[TEST 3] Verifying cross-tenant access is rejected (403)...")
        r_cross_bar = client.get(
            f"/api/v1/orders/restaurant/{REST_ID}?station=BAR",
            headers={"Authorization": f"Bearer {other_bar_token}"}
        )
        assert r_cross_bar.status_code == 403, f"Expected 403, got {r_cross_bar.status_code}: {r_cross_bar.text}"
        print(f"  ✓ Cross-tenant BAR query rejected: HTTP {r_cross_bar.status_code}")

        r_cross_ast = client.get(
            f"/api/v1/restaurants/{REST_ID}/events/{EVENT_ID}/assistance",
            headers={"Authorization": f"Bearer {other_bar_token}"}
        )
        assert r_cross_ast.status_code == 403, f"Expected 403, got {r_cross_ast.status_code}"
        print(f"  ✓ Cross-tenant Table Assistance query rejected: HTTP {r_cross_ast.status_code}")

        # TEST 4: Authorized Bar Terminal Query
        print("\n[TEST 4] Querying live Bar Terminal queue...")
        r_bar = client.get(
            f"/api/v1/orders/restaurant/{REST_ID}?station=BAR&active_only=true",
            headers={"Authorization": f"Bearer {bar_token}"}
        )
        assert r_bar.status_code == 200, f"Bar query failed: {r_bar.status_code} {r_bar.text}"
        bar_orders = r_bar.json()
        print(f"  ✓ Bar Terminal HTTP 200 | Active orders returned: {len(bar_orders)}")
        for o in bar_orders[:3]:
            items_str = ", ".join(f"{it.get('quantity')}x {it.get('name')}" for it in o.get("items", []))
            print(f"    - Order {o.get('orderNumber') or o.get('id')} | Table: {o.get('tableNumber')} | BarStatus: {o.get('barStatus')} | Items: [{items_str}]")

        # TEST 5: Authorized Hookah Terminal Query
        print("\n[TEST 5] Querying live Hookah Terminal queue...")
        r_hookah = client.get(
            f"/api/v1/orders/restaurant/{REST_ID}?station=HOOKAH&active_only=true",
            headers={"Authorization": f"Bearer {hookah_token}"}
        )
        assert r_hookah.status_code == 200, f"Hookah query failed: {r_hookah.status_code} {r_hookah.text}"
        hookah_orders = r_hookah.json()
        print(f"  ✓ Hookah Terminal HTTP 200 | Active orders returned: {len(hookah_orders)}")
        for o in hookah_orders[:3]:
            items_str = ", ".join(f"{it.get('quantity')}x {it.get('name')}" for it in o.get("items", []))
            print(f"    - Order {o.get('orderNumber') or o.get('id')} | Table: {o.get('tableNumber')} | HookahStatus: {o.get('hookahStatus')} | Items: [{items_str}]")

        # TEST 6: Authorized Table Assistance Terminal Query
        print("\n[TEST 6] Querying live Table Assistance Terminal...")
        r_ast = client.get(
            f"/api/v1/restaurants/{REST_ID}/events/{EVENT_ID}/assistance",
            headers={"Authorization": f"Bearer {waiter_token}"}
        )
        assert r_ast.status_code == 200, f"Assistance query failed: {r_ast.status_code} {r_ast.text}"
        ast_data = r_ast.json()
        requests_list = ast_data.get("requests", [])
        summary = ast_data.get("summary", {})
        print(f"  ✓ Table Assistance HTTP 200 | Requests count: {len(requests_list)} | Summary: {summary}")
        for req in requests_list[:5]:
            req_items = req.get("items", [])
            labels = [it.get("label") or str(it) for it in req_items]
            print(f"    - Request ID: {req.get('id')} | Table: {req.get('tableNumber')} | Status: {req.get('status')} | Items: {labels}")

    print("\n" + "=" * 70)
    print("  🎉 ALL LIVE PRODUCTION API CHECKS PASSED WITH 100% SUCCESS")
    print("=" * 70)

if __name__ == "__main__":
    main()

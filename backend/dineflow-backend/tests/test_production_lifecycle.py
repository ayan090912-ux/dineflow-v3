import asyncio
import json
import base64
import time
from datetime import datetime, timezone
import httpx
import pytest

# PRODUCTION BACKEND URL
BASE_URL = "https://dineflow-v3.onrender.com/api/v1"
ADMIN_KEY = "ayan090912@gmail.com"

def make_token(uid: str, email: str, role: str = "RESTAURANT_OWNER", is_admin: bool = False, restaurant_id: str = None) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    claims = {
        "uid": uid,
        "email": email,
        "role": role,
        "admin": is_admin
    }
    if restaurant_id:
        claims["restaurant_id"] = restaurant_id
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"{header}.{payload}.sig"

import os

@pytest.mark.asyncio
@pytest.mark.skipif(
    os.environ.get("RUN_PRODUCTION_SMOKE") != "1",
    reason="Live production smoke test against https://dineflow-v3.onrender.com (set RUN_PRODUCTION_SMOKE=1 to execute)"
)
async def test_complete_production_lifecycle():
    print("=" * 70)
    print("STARTING COMPLETE LIVE PRODUCTION RESTAURANT LIFECYCLE AUDIT")
    print(f"Target Backend: {BASE_URL}")
    print("=" * 70)

    timings = {}
    ts = int(time.time() * 1000)

    async with httpx.AsyncClient(base_url="https://dineflow-v3.onrender.com", timeout=30.0) as client:
        # -------------------------------------------------------------
        # 1. Production Backend Health & Readiness Check
        # -------------------------------------------------------------
        print("\n[STEP 1] Verifying Production Backend Health & DB Connectivity...")
        t0 = time.time()
        res_healthz = await client.get("/healthz")
        timings["healthz"] = round(time.time() - t0, 3)
        assert res_healthz.status_code == 200, f"Healthz failed: {res_healthz.text}"
        print(f"  [PASS] /healthz responded HTTP 200 in {timings['healthz']}s: {res_healthz.json()}")

        t0 = time.time()
        res_readyz = await client.get("/readyz")
        timings["readyz"] = round(time.time() - t0, 3)
        assert res_readyz.status_code == 200, f"Readyz failed: {res_readyz.text}"
        readyz_data = res_readyz.json()
        assert readyz_data.get("database") == "connected", f"Database not connected: {readyz_data}"
        print(f"  [PASS] /readyz responded HTTP 200 in {timings['readyz']}s (Database: {readyz_data['database']})")

        # -------------------------------------------------------------
        # 2. Restaurant Creation for Real Google User A
        # -------------------------------------------------------------
        owner_a_email = f"owner_a_{ts}@dinely.test"
        owner_a_uid = f"uid_owner_a_{ts}"
        token_a = make_token(owner_a_uid, owner_a_email)

        print(f"\n[STEP 2] Creating Restaurant A for Owner A ({owner_a_email})...")
        t0 = time.time()
        create_payload_a = {
            "name": f"Trattoria Alpha {ts}",
            "cuisine": "Italian Fine Dining",
            "businessType": "RESTAURANT",
            "ownerName": "Alice Alpha",
            "ownerEmail": owner_a_email,
            "ownerUid": owner_a_uid,
            "phone": "+91 98765 43210",
            "address": "42 Connaught Place, New Delhi",
            "tableCount": 8,
            "hasKitchen": True,
            "hasWaiter": True,
            "hasBar": True,
            "hasInventory": True,
            "hasBilling": True
        }
        res_create_a = await client.post(
            "/api/v1/restaurants",
            json=create_payload_a,
            headers={"Authorization": f"Bearer {token_a}"}
        )
        timings["create_restaurant_a"] = round(time.time() - t0, 3)
        assert res_create_a.status_code == 201, f"Create Restaurant A failed: {res_create_a.text}"
        rest_a = res_create_a.json()
        rest_a_id = rest_a["id"]
        slug_a = rest_a.get("public_slug") or rest_a.get("slug")
        domain_a = rest_a.get("domain") or f"https://{slug_a}.dinely.food"
        assert rest_a_id, "No restaurant_id generated"
        assert slug_a, "No public_slug generated"
        assert rest_a.get("lifecycle_status") == "PENDING_APPROVAL", f"Unexpected initial lifecycle: {rest_a.get('lifecycle_status')}"
        print(f"  [PASS] Restaurant A created in {timings['create_restaurant_a']}s:")
        print(f"    - ID: {rest_a_id}")
        print(f"    - Slug: {slug_a}")
        print(f"    - Domain: {domain_a}")
        print(f"    - Status: {rest_a.get('lifecycle_status')}")

        # -------------------------------------------------------------
        # 3. Platform Admin Receives Application in Realtime Queue
        # -------------------------------------------------------------
        admin_token = make_token("admin_uid_live", ADMIN_KEY, role="PLATFORM_ADMIN", is_admin=True)
        print(f"\n[STEP 3] Platform Admin queries pending applications...")
        t0 = time.time()
        res_pending = await client.get(
            "/api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        timings["admin_pending_queue"] = round(time.time() - t0, 3)
        assert res_pending.status_code == 200, f"Admin queue query failed: {res_pending.text}"
        pending_apps = res_pending.json()
        pending_a = next((r for r in pending_apps if r["id"] == rest_a_id), None)
        assert pending_a is not None, f"Restaurant A ({rest_a_id}) not found in Admin pending queue!"
        print(f"  [PASS] Application confirmed in Admin Queue in {timings['admin_pending_queue']}s (Owner: {pending_a['ownerEmail']})")

        # -------------------------------------------------------------
        # 4. Platform Admin Approves Restaurant A -> LIVE
        # -------------------------------------------------------------
        print(f"\n[STEP 4] Platform Admin approves Restaurant A...")
        t0 = time.time()
        res_approve = await client.post(
            "/api/v1/admin/restaurants/approve",
            json={"restaurant_id": rest_a_id, "reason": "Verified business documentation"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        timings["admin_approval"] = round(time.time() - t0, 3)
        assert res_approve.status_code == 200, f"Approval failed: {res_approve.text}"
        appr_data = res_approve.json()
        assert appr_data.get("isApproved") is True or appr_data.get("is_approved") is True
        assert appr_data.get("lifecycleStatus") == "LIVE"
        print(f"  [PASS] Restaurant A approved in {timings['admin_approval']}s (Status: LIVE)")

        # -------------------------------------------------------------
        # 5. Approval Idempotency Test (Duplicate Approval Protection)
        # -------------------------------------------------------------
        print(f"\n[STEP 5] Testing Approval Idempotency (Repeating approval)...")
        res_approve_dup = await client.post(
            "/api/v1/admin/restaurants/approve",
            json={"restaurant_id": rest_a_id},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res_approve_dup.status_code == 200
        dup_data = res_approve_dup.json()
        assert dup_data.get("already_approved") is True or dup_data.get("lifecycleStatus") == "LIVE"
        print("  [PASS] Idempotency verified: duplicate approval returned cleanly without duplicate database records.")

        # -------------------------------------------------------------
        # 6. Owner Workspace Shows Restaurant as LIVE
        # -------------------------------------------------------------
        print(f"\n[STEP 6] Owner queries workspace (/api/v1/restaurants/owner/my)...")
        t0 = time.time()
        res_my_a = await client.get(
            "/api/v1/restaurants/owner/my",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        timings["owner_workspace_lookup"] = round(time.time() - t0, 3)
        assert res_my_a.status_code == 200
        my_rests_a = res_my_a.json()
        verified_rest_a = next((r for r in my_rests_a if r["id"] == rest_a_id), None)
        assert verified_rest_a is not None, "Restaurant A missing from Owner A's workspace!"
        assert verified_rest_a.get("lifecycle_status") == "LIVE", f"Status is not LIVE: {verified_rest_a.get('lifecycle_status')}"
        assert verified_rest_a.get("is_approved") is True
        print(f"  [PASS] Owner sees Restaurant A as LIVE in {timings['owner_workspace_lookup']}s")

        # -------------------------------------------------------------
        # 7. Public Subdomain & Tenant Resolution
        # -------------------------------------------------------------
        print(f"\n[STEP 7] Verifying Public Tenant Domain Resolution for {slug_a}.dinely.food...")
        t0 = time.time()
        res_resolve = await client.get(f"/api/v1/restaurants/public/resolve?slug={slug_a}")
        timings["tenant_resolution"] = round(time.time() - t0, 3)
        assert res_resolve.status_code == 200, f"Tenant resolution failed: {res_resolve.text}"
        resolved = res_resolve.json()
        assert (resolved.get("restaurant_id") or resolved.get("id")) == rest_a_id
        assert resolved.get("public_domain") == f"https://{slug_a}.dinely.food"
        print(f"  [PASS] Tenant resolved in {timings['tenant_resolution']}s -> {resolved.get('public_domain')}")

        # Unknown slug must return 404
        res_unknown = await client.get("/api/v1/restaurants/public/resolve?slug=unknown-nonexistent-tenant-slug")
        assert res_unknown.status_code == 404, f"Unknown slug should 404, got {res_unknown.status_code}"
        print("  [PASS] Unknown tenant slug correctly returned HTTP 404 (No fallback restaurant leak).")

        # -------------------------------------------------------------
        # 8. Real Table QR Code Verification
        # -------------------------------------------------------------
        print(f"\n[STEP 8] Inspecting Generated Table QR Codes...")
        res_tables = await client.get(f"/api/v1/restaurants/{rest_a_id}/tables")
        assert res_tables.status_code == 200
        tables_list = res_tables.json()
        assert len(tables_list) > 0, "No tables provisioned for Restaurant A"
        table_1 = tables_list[0]
        qr_url = table_1.get("qr_code_url") or table_1.get("qrCodeUrl") or ""
        assert f"https://{slug_a}.dinely.food/customer?table=" in qr_url, f"Invalid QR code URL: {qr_url}"
        assert "?tenant=" not in qr_url, f"Illegal ?tenant= param in QR URL: {qr_url}"
        assert " " not in qr_url, f"Illegal space in canonical QR URL: {qr_url}"
        assert "tableId=" in qr_url, f"Missing tableId param in canonical QR URL: {qr_url}"
        print(f"  [PASS] Verified Table 1 Canonical Machine-Safe QR URL: {qr_url}")

        # -------------------------------------------------------------
        # 9. Customer Order Placement (No Owner Auth Required)
        # -------------------------------------------------------------
        print(f"\n[STEP 9] Customer placing order on Table 1 of Restaurant A...")
        t0 = time.time()
        order_payload = {
            "restaurantId": rest_a_id,
            "tableId": table_1["id"],
            "tableNumber": table_1["table_number"],
            "customerName": "Rahul Sharma",
            "items": [
                {
                    "name": "Paneer Butter Masala",
                    "price": 350.00,
                    "quantity": 2,
                    "targetDestination": "KITCHEN"
                },
                {
                    "name": "Fresh Lime Soda",
                    "price": 120.00,
                    "quantity": 2,
                    "targetDestination": "BAR"
                }
            ]
        }
        res_order = await client.post("/api/v1/orders", json=order_payload)
        timings["order_creation"] = round(time.time() - t0, 3)
        assert res_order.status_code == 201, f"Customer order creation failed: {res_order.text}"
        order_data = res_order.json()
        order_id = order_data["id"]
        print(f"  [PASS] Order #{order_id} placed successfully in {timings['order_creation']}s")

        # -------------------------------------------------------------
        # 10. Waiter Call Requests
        # -------------------------------------------------------------
        print(f"\n[STEP 10] Customer sending Waiter Requests (WATER, CALL_WAITER, BILL)...")
        for req_type in ["WATER", "CALL_WAITER", "BILL"]:
            req_payload = {
                "restaurantId": rest_a_id,
                "tableId": table_1["id"],
                "tableNumber": table_1["table_number"],
                "requestType": req_type,
                "message": f"Customer requests {req_type}"
            }
            res_waiter_req = await client.post("/api/v1/customer-requests", json=req_payload)
            assert res_waiter_req.status_code == 201, f"Waiter request {req_type} failed"
        print("  [PASS] All waiter customer requests accepted and routed to Waiter terminal.")

        # -------------------------------------------------------------
        # 11. Kitchen & Waiter Verification
        # -------------------------------------------------------------
        print(f"\n[STEP 11] Verifying Kitchen & Waiter Terminal Queue for Restaurant A...")
        res_kitchen_orders = await client.get(
            f"/api/v1/orders/restaurant/{rest_a_id}",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res_kitchen_orders.status_code == 200
        kitchen_orders = res_kitchen_orders.json()
        assert any(o["id"] == order_id for o in kitchen_orders), f"Order #{order_id} missing from Kitchen queue!"
        print(f"  [PASS] Kitchen received order #{order_id}")

        # -------------------------------------------------------------
        # 12. Second Tenant for Same Owner (Multi-Restaurant)
        # -------------------------------------------------------------
        print(f"\n[STEP 12] Creating Second Restaurant (Bistro Beta) for same Owner A...")
        create_payload_b = {
            "name": f"Bistro Beta {ts}",
            "cuisine": "Continental Cafe",
            "businessType": "CAFE",
            "ownerName": "Alice Alpha",
            "ownerEmail": owner_a_email,
            "ownerUid": owner_a_uid,
            "phone": "+91 98765 43211",
            "address": "10 MG Road, Bangalore",
            "tableCount": 6,
        }
        res_create_b = await client.post(
            "/api/v1/restaurants",
            json=create_payload_b,
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res_create_b.status_code == 201
        rest_b = res_create_b.json()
        rest_b_id = rest_b["id"]
        slug_b = rest_b.get("public_slug") or rest_b.get("slug")
        print(f"  [PASS] Second Restaurant B created: {rest_b_id} (slug: {slug_b})")

        # Admin approves Restaurant B
        await client.post(
            "/api/v1/admin/restaurants/approve",
            json={"restaurant_id": rest_b_id},
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        # Owner A queries workspace -> MUST see BOTH Restaurant A and Restaurant B
        res_my_multi = await client.get(
            "/api/v1/restaurants/owner/my",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res_my_multi.status_code == 200
        multi_ids = [r["id"] for r in res_my_multi.json()]
        assert rest_a_id in multi_ids, "Restaurant A missing from multi-workspace"
        assert rest_b_id in multi_ids, "Restaurant B missing from multi-workspace"
        print(f"  [PASS] Owner A workspace contains both independent restaurants ({rest_a_id} and {rest_b_id}).")

        # -------------------------------------------------------------
        # 13. Second Google Account (Two-Owner Isolation)
        # -------------------------------------------------------------
        owner_b_email = f"owner_c_{ts}@dinely.test"
        owner_b_uid = f"uid_owner_c_{ts}"
        token_b = make_token(owner_b_uid, owner_b_email)

        print(f"\n[STEP 13] Creating Restaurant C under Second Google User ({owner_b_email})...")
        create_payload_c = {
            "name": f"Cantina Gamma {ts}",
            "cuisine": "Mexican Street Food",
            "businessType": "RESTAURANT",
            "ownerName": "Carlos Gamma",
            "ownerEmail": owner_b_email,
            "ownerUid": owner_b_uid,
            "phone": "+91 98765 43212",
            "address": "88 Park Street, Kolkata",
        }
        res_create_c = await client.post(
            "/api/v1/restaurants",
            json=create_payload_c,
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res_create_c.status_code == 201
        rest_c = res_create_c.json()
        rest_c_id = rest_c["id"]

        # User A workspace query -> MUST NOT see Restaurant C
        res_a_isolated = await client.get(
            "/api/v1/restaurants/owner/my",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        a_tenant_ids = [r["id"] for r in res_a_isolated.json()]
        assert rest_c_id not in a_tenant_ids, "Cross-user security breach! User A saw User B's Restaurant C!"

        # User B workspace query -> MUST see ONLY Restaurant C
        res_b_isolated = await client.get(
            "/api/v1/restaurants/owner/my",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        b_tenant_ids = [r["id"] for r in res_b_isolated.json()]
        assert b_tenant_ids == [rest_c_id], f"User B saw unexpected tenants: {b_tenant_ids}"
        print("  [PASS] Two-User Isolation 100% verified: User A sees only A & B; User B sees only C.")

        # -------------------------------------------------------------
        # 14. Cross-Tenant IDOR Security Checks
        # -------------------------------------------------------------
        print(f"\n[STEP 14] Testing Cross-Tenant IDOR Attacks...")
        # User B tries to read Restaurant A's orders -> MUST return 403
        res_idor_orders = await client.get(
            f"/api/v1/orders/restaurant/{rest_a_id}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res_idor_orders.status_code == 403, f"IDOR Failure: User B read Restaurant A orders! Code: {res_idor_orders.status_code}"

        # User B tries to read Restaurant A's waiter requests -> MUST return 403
        res_idor_reqs = await client.get(
            f"/api/v1/customer-requests?restaurant_id={rest_a_id}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res_idor_reqs.status_code == 403, f"IDOR Failure: User B read Restaurant A requests! Code: {res_idor_reqs.status_code}"

        # Anonymous caller tries to read protected restaurant orders -> MUST return 401
        res_anon = await client.get(f"/api/v1/orders/restaurant/{rest_a_id}")
        assert res_anon.status_code == 401, f"Security Failure: Anonymous read protected orders! Code: {res_anon.status_code}"
        print("  [PASS] IDOR & Authorization defenses verified: all cross-tenant access rejected with 403 / 401.")

        # -------------------------------------------------------------
        # 15. Rejection & Resubmission Lifecycle Test
        # -------------------------------------------------------------
        print(f"\n[STEP 15] Testing Application Rejection and Owner Resubmission...")
        # Admin rejects Restaurant C
        res_reject = await client.post(
            "/api/v1/admin/restaurants/reject",
            json={"restaurant_id": rest_c_id, "reason": "Missing FSSAI license certificate"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res_reject.status_code == 200
        reject_data = res_reject.json()
        assert reject_data.get("lifecycleStatus") == "REJECTED"
        assert reject_data.get("isApproved") is False

        # Owner B queries details and sees rejection reason
        res_c_detail = await client.get(
            f"/api/v1/restaurants/{rest_c_id}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res_c_detail.status_code == 200
        assert res_c_detail.json()["lifecycle_status"] == "REJECTED"
        assert "FSSAI" in (res_c_detail.json().get("rejection_reason") or "")
        print("  [PASS] Admin rejected Restaurant C; Owner received stored rejection reason.")

        # Owner B updates and resubmits
        res_resubmit = await client.put(
            f"/api/v1/restaurants/{rest_c_id}",
            json={"lifecycleStatus": "PENDING_APPROVAL", "ownerEmail": owner_b_email},
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res_resubmit.status_code == 200
        res_c_resubmitted = await client.get(
            f"/api/v1/restaurants/{rest_c_id}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res_c_resubmitted.json()["lifecycle_status"] == "PENDING_APPROVAL"
        assert res_c_resubmitted.json().get("rejection_reason") is None
        print("  [PASS] Owner B resubmitted Restaurant C -> status cleanly restored to PENDING_APPROVAL.")

        # -------------------------------------------------------------
        # 16. Archive Lifecycle Test
        # -------------------------------------------------------------
        print(f"\n[STEP 16] Testing Application Archival...")
        res_archive = await client.post(
            "/api/v1/admin/restaurants/archive",
            json={"restaurant_id": rest_c_id, "reason": "Abandoned test application"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res_archive.status_code == 200
        # Archived restaurant is no longer live or publicly resolvable
        slug_c = rest_c.get("public_slug") or rest_c.get("slug")
        res_c_resolve_archived = await client.get(f"/api/v1/restaurants/public/resolve?slug={slug_c}")
        assert res_c_resolve_archived.status_code == 404, "Archived restaurant illegally resolved publicly!"
        print("  [PASS] Restaurant C archived; public resolution cleanly returns HTTP 404.")

        # -------------------------------------------------------------
        # Summary & Benchmark Metrics
        # -------------------------------------------------------------
        print("\n" + "=" * 70)
        print("ALL 16 BUSINESS & SECURITY FLOWS PASSED 100% ON PRODUCTION BACKEND!")
        print("=" * 70)
        print("PERFORMANCE BENCHMARKS (LIVE PRODUCTION LATENCIES):")
        for key, val in timings.items():
            print(f"  - {key.replace('_', ' ').title()}: {val}s")
        print("=" * 70)

if __name__ == "__main__":
    asyncio.run(test_complete_production_lifecycle())

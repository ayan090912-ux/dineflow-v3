import json
import base64
import httpx
import pytest
import asyncio
from datetime import datetime, timezone

BASE_URL = "http://127.0.0.1:8000/api/v1"

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

@pytest.mark.asyncio
async def test_full_production_lifecycle_e2e():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=15.0) as client:
        ts = int(datetime.now(timezone.utc).timestamp() * 1000)

        # -------------------------------------------------------------
        # 1. Authenticated User A creates Restaurant A
        # -------------------------------------------------------------
        owner_a_email = f"owner_a_{ts}@example.com"
        owner_a_uid = f"uid_owner_a_{ts}"
        token_a = make_token(owner_a_uid, owner_a_email)

        create_payload_a = {
            "name": f"Trattoria Alpha {ts}",
            "cuisine": "Italian",
            "ownerName": "Alice Alpha",
            "ownerEmail": owner_a_email,
            "ownerUid": owner_a_uid,
            "phone": "+1-555-0199",
            "address": "123 Pasta Lane, NY"
        }
        res_create_a = await client.post(
            "/restaurants",
            json=create_payload_a,
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res_create_a.status_code == 201, f"Failed to create Restaurant A: {res_create_a.text}"
        rest_a = res_create_a.json()
        rest_a_id = rest_a["id"]
        slug_a = rest_a.get("public_slug") or rest_a.get("slug")
        assert rest_a_id, "Restaurant A has no id"
        assert slug_a, "Restaurant A has no slug"

        # -------------------------------------------------------------
        # 2. Authenticated User B creates Restaurant B (Separate Tenant)
        # -------------------------------------------------------------
        owner_b_email = f"owner_b_{ts}@example.com"
        owner_b_uid = f"uid_owner_b_{ts}"
        token_b = make_token(owner_b_uid, owner_b_email)

        create_payload_b = {
            "name": f"Bistro Beta {ts}",
            "cuisine": "French",
            "ownerName": "Bob Beta",
            "ownerEmail": owner_b_email,
            "ownerUid": owner_b_uid,
            "phone": "+1-555-0299",
            "address": "456 Croissant Blvd, Paris"
        }
        res_create_b = await client.post(
            "/restaurants",
            json=create_payload_b,
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res_create_b.status_code == 201, f"Failed to create Restaurant B: {res_create_b.text}"
        rest_b = res_create_b.json()
        rest_b_id = rest_b["id"]
        slug_b = rest_b.get("public_slug") or rest_b.get("slug")

        # -------------------------------------------------------------
        # 3. Two-User Isolation: User A cannot see User B's restaurants
        # -------------------------------------------------------------
        res_list_a = await client.get(
            "/restaurants/owner/my",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res_list_a.status_code == 200
        owned_by_a = [r["id"] for r in res_list_a.json()]
        assert rest_a_id in owned_by_a
        assert rest_b_id not in owned_by_a, "User A unexpectedly sees User B's restaurant!"

        # User A attempting to query User B's restaurants via owner/my query param -> MUST return 403
        res_list_b_by_a = await client.get(
            f"/restaurants/owner/my?owner_email={owner_b_email}",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res_list_b_by_a.status_code == 403, "User A should get 403 when querying User B's email!"

        # -------------------------------------------------------------
        # 4. Admin Control Plane: Platform Admin views pending & approves
        # -------------------------------------------------------------
        admin_token = make_token("admin_uid_001", "ayan090912@gmail.com", role="PLATFORM_ADMIN", is_admin=True)

        res_pending = await client.get(
            "/admin/restaurants?lifecycle_status=PENDING_APPROVAL",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res_pending.status_code == 200
        pending_ids = [r["id"] for r in res_pending.json()]
        assert rest_a_id in pending_ids, "Restaurant A not found in Admin pending queue"

        # Approve Restaurant A
        res_approve = await client.post(
            "/admin/restaurants/approve",
            json={"restaurant_id": rest_a_id},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res_approve.status_code == 200, f"Approval failed: {res_approve.text}"

        # Approve Restaurant B
        res_approve_b = await client.post(
            "/admin/restaurants/approve",
            json={"restaurant_id": rest_b_id},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res_approve_b.status_code == 200

        # Verify Restaurant A status transitioned to LIVE
        res_detail_a = await client.get(
            f"/restaurants/{rest_a_id}",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res_detail_a.status_code == 200
        assert res_detail_a.json()["lifecycle_status"] == "LIVE"

        # -------------------------------------------------------------
        # 5. Public Tenant Domain Resolution
        # -------------------------------------------------------------
        # Slug resolution for Restaurant A
        res_resolve_a = await client.get(f"/restaurants/public/resolve?slug={slug_a}")
        assert res_resolve_a.status_code == 200
        resolved_a = res_resolve_a.json()
        assert resolved_a["restaurant_id"] == rest_a_id
        assert resolved_a["public_domain"] == f"https://{slug_a}.dinely.food"

        # Unknown slug returns 404
        res_resolve_unknown = await client.get("/restaurants/public/resolve?slug=unknown-nonexistent-restaurant-slug")
        assert res_resolve_unknown.status_code == 404

        # -------------------------------------------------------------
        # 6. Table & Canonical QR Code Generation
        # -------------------------------------------------------------
        res_table_a = await client.post(
            f"/restaurants/{rest_a_id}/tables",
            json={
                "table_number": "10",
                "tableNumber": "10",
                "capacity": 4,
                "section": "Main Hall"
            },
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res_table_a.status_code in [200, 201]
        table_a = res_table_a.json()
        table_a_id = table_a["id"]
        qr_url = table_a.get("qr_code_url") or table_a.get("qrCodeUrl") or ""

        # Verify QR URL contains the tenant subdomain format
        assert f"{slug_a}.dinely.food/customer" in qr_url, f"Invalid QR URL format: {qr_url}"
        assert "?tenant=" not in qr_url, f"QR URL illegally contains ?tenant=: {qr_url}"

        # -------------------------------------------------------------
        # 7. Customer Operational Flow: QR -> Order -> Waiter Call
        # -------------------------------------------------------------
        # Customer places Order on Table 10 of Restaurant A
        order_payload = {
            "restaurantId": rest_a_id,
            "tableId": table_a_id,
            "tableNumber": "10",
            "customerName": "John Doe",
            "items": [
                {
                    "name": "Margherita Pizza",
                    "price": 14.50,
                    "quantity": 2,
                    "targetDestination": "KITCHEN"
                },
                {
                    "name": "House Chianti",
                    "price": 8.00,
                    "quantity": 1,
                    "targetDestination": "BAR"
                }
            ]
        }
        res_order = await client.post("/orders", json=order_payload)
        assert res_order.status_code == 201, f"Customer order failed: {res_order.text}"
        order_data = res_order.json()
        order_id = order_data["id"]

        # Customer sends Waiter Request (Water)
        waiter_call_payload = {
            "restaurantId": rest_a_id,
            "tableId": table_a_id,
            "tableNumber": "10",
            "requestType": "WATER",
            "message": "Sparkling water please"
        }
        res_req = await client.post("/customer-requests", json=waiter_call_payload)
        assert res_req.status_code == 201, f"Customer request failed: {res_req.text}"

        # -------------------------------------------------------------
        # 8. Staff / Terminal Queries & Verification
        # -------------------------------------------------------------
        # Restaurant A Kitchen/Owner retrieves orders
        res_orders_a = await client.get(
            f"/orders/restaurant/{rest_a_id}",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res_orders_a.status_code == 200
        orders_a_list = res_orders_a.json()
        assert any(o["id"] == order_id for o in orders_a_list), "Created order missing from Restaurant A orders"

        # Restaurant A Waiter retrieves service requests
        res_reqs_a = await client.get(
            f"/customer-requests?restaurant_id={rest_a_id}",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert res_reqs_a.status_code == 200

        # -------------------------------------------------------------
        # 9. Cross-Tenant IDOR Attack Verification
        # -------------------------------------------------------------
        # Owner B tries to read Restaurant A's orders -> MUST 403
        res_idor_orders = await client.get(
            f"/orders/restaurant/{rest_a_id}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res_idor_orders.status_code == 403, f"IDOR Vulnerability! Status: {res_idor_orders.status_code}"

        # Owner B tries to read Restaurant A's service requests -> MUST 403
        res_idor_reqs = await client.get(
            f"/customer-requests?restaurant_id={rest_a_id}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res_idor_reqs.status_code == 403, f"IDOR Vulnerability! Status: {res_idor_reqs.status_code}"

        # Owner B tries to read Restaurant A's billing bills -> MUST 403
        res_idor_billing = await client.get(
            f"/restaurants/{rest_a_id}/billing/bills",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert res_idor_billing.status_code == 403, f"IDOR Vulnerability! Status: {res_idor_billing.status_code}"

        # -------------------------------------------------------------
        # 10. Admin Rejection & Archive Lifecycle Test
        # -------------------------------------------------------------
        # Admin archives Restaurant B
        res_archive_b = await client.post(
            "/admin/restaurants/archive",
            json={"restaurant_id": rest_b_id, "reason": "Test archive"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res_archive_b.status_code == 200
        # Archived restaurant is no longer live
        res_resolve_archived = await client.get(f"/restaurants/public/resolve?slug={slug_b}")
        assert res_resolve_archived.status_code == 404, "Archived restaurant should not resolve publicly"

        print("\n[SUCCESS] Entire end-to-end multi-tenant lifecycle passed with 100% isolation!")

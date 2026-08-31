import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from httpx import AsyncClient, ASGITransport
from app.main import app as fastapi_app
from app.core.security.rbac import require_platform_admin, get_current_firebase_admin

MOCK_ADMIN_CLAIMS = {
    "uid": "admin-ayan-production",
    "email": "ayan090912@gmail.com",
    "admin": True,
    "role": "PLATFORM_ADMIN"
}

fastapi_app.dependency_overrides[require_platform_admin] = lambda: MOCK_ADMIN_CLAIMS
fastapi_app.dependency_overrides[get_current_firebase_admin] = lambda: MOCK_ADMIN_CLAIMS

from app.core.database.connection import engine, Base
import app.modules.restaurants.models
import app.modules.tables.models
import app.modules.menu.models
import app.modules.orders.models
import app.modules.customer_requests.models
import app.modules.taxes.models

async def run_audit():
    print("=" * 80)
    print("STARTING COMPLETE MULTI-TENANT PRODUCTION END-TO-END AUDIT")
    print("=" * 80)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # -------------------------------------------------------------
        # STEP 1: ONBOARD TENANT 1 (Coastal Spice Retreat)
        # -------------------------------------------------------------
        print("\n[STEP 1] Creating Tenant 1: Coastal Spice Retreat (Owner: Rajesh)...")
        payload_1 = {
            "name": "Coastal Spice Retreat",
            "cuisine": "South Indian Seafood",
            "businessType": "RESTAURANT",
            "hasBar": True,
            "hasTables": True,
            "hasKitchen": True,
            "hasWaiter": True,
            "hasInventory": True,
            "hasBilling": True,
            "ownerName": "Rajesh Nair",
            "ownerEmail": "rajesh.nair@coastalspice.food",
            "ownerUid": "uid-firebase-rajesh-777",
            "phone": "+91 98450 11223",
            "address": "12 Fisherman Wharf, Calangute, Goa",
            "currency": "INR (₹)",
            "taxPercentage": 5.0
        }
        res1 = await client.post("/api/v1/restaurants", json=payload_1)
        assert res1.status_code == 201, f"Tenant 1 creation failed: {res1.text}"
        tenant_1 = res1.json()
        t1_id = tenant_1["id"]
        print(f" -> Tenant 1 Created: ID={t1_id}, Status={tenant_1['lifecycle_status']}, Approved={tenant_1['is_approved']}")
        assert tenant_1["lifecycle_status"] == "PENDING_APPROVAL"
        assert tenant_1["is_approved"] is False
        assert tenant_1["name"] == "Coastal Spice Retreat"

        # -------------------------------------------------------------
        # STEP 2: ONBOARD TENANT 2 (Neon Sakura Lounge)
        # -------------------------------------------------------------
        print("\n[STEP 2] Creating Tenant 2: Neon Sakura Lounge (Owner: Kenji)...")
        payload_2 = {
            "name": "Neon Sakura Lounge",
            "cuisine": "Japanese Izakaya & Bar",
            "businessType": "BAR",
            "hasBar": True,
            "hasTables": True,
            "hasKitchen": True,
            "hasWaiter": True,
            "hasInventory": True,
            "hasBilling": True,
            "ownerName": "Kenji Sato",
            "ownerEmail": "kenji.sato@neonsakura.tokyo",
            "ownerUid": "uid-firebase-kenji-888",
            "phone": "+81 3 5555 0199",
            "address": "4-1-8 Roppongi, Minato-ku, Tokyo",
            "currency": "INR (₹)",
            "taxPercentage": 10.0
        }
        res2 = await client.post("/api/v1/restaurants", json=payload_2)
        assert res2.status_code == 201, f"Tenant 2 creation failed: {res2.text}"
        tenant_2 = res2.json()
        t2_id = tenant_2["id"]
        print(f" -> Tenant 2 Created: ID={t2_id}, Status={tenant_2['lifecycle_status']}, Approved={tenant_2['is_approved']}")
        assert tenant_2["lifecycle_status"] == "PENDING_APPROVAL"
        assert tenant_2["is_approved"] is False
        assert tenant_2["name"] == "Neon Sakura Lounge"
        assert t1_id != t2_id, "Tenant IDs MUST be unique!"

        # -------------------------------------------------------------
        # STEP 3: PLATFORM ADMIN SEES BOTH PENDING TENANTS
        # -------------------------------------------------------------
        print("\n[STEP 3] Platform Admin queries all pending approval requests...")
        admin_res = await client.get("/api/v1/admin/restaurants")
        assert admin_res.status_code == 200
        all_admin_rests = admin_res.json()
        p1 = next((r for r in all_admin_rests if r["id"] == t1_id), None)
        p2 = next((r for r in all_admin_rests if r["id"] == t2_id), None)
        assert p1 is not None, "Tenant 1 must be present in Platform Admin review list"
        assert p2 is not None, "Tenant 2 must be present in Platform Admin review list"
        assert p1["lifecycleStatus"] == "PENDING_APPROVAL"
        assert p2["lifecycleStatus"] == "PENDING_APPROVAL"
        print(f" -> Platform Admin confirmed pending status for both {p1['name']} and {p2['name']}")

        # -------------------------------------------------------------
        # STEP 4: PLATFORM ADMIN APPROVES BOTH TENANTS
        # -------------------------------------------------------------
        print("\n[STEP 4] Platform Admin approves Tenant 1 and Tenant 2...")
        appr_1 = await client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": t1_id})
        assert appr_1.status_code == 200 and appr_1.json()["lifecycleStatus"] == "LIVE"

        appr_2 = await client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": t2_id})
        assert appr_2.status_code == 200 and appr_2.json()["lifecycleStatus"] == "LIVE"
        print(" -> Both tenants successfully transitioned to LIVE status with initial auto-provisioned tables & categories")

        # -------------------------------------------------------------
        # STEP 5: VERIFY OWNER IDENTITY RESOLUTION (ZERO MIXING)
        # -------------------------------------------------------------
        print("\n[STEP 5] Verifying Owner Identity Resolution & Workspace access...")
        # Owner 1 queries my-restaurants
        my1 = await client.get(f"/api/v1/restaurants/owner/my?owner_email=rajesh.nair@coastalspice.food")
        assert my1.status_code == 200
        my1_rests = my1.json()
        assert len(my1_rests) == 1
        assert my1_rests[0]["id"] == t1_id
        assert my1_rests[0]["name"] == "Coastal Spice Retreat"

        # Owner 2 queries my-restaurants
        my2 = await client.get(f"/api/v1/restaurants/owner/my?owner_email=kenji.sato@neonsakura.tokyo")
        assert my2.status_code == 200
        my2_rests = my2.json()
        assert len(my2_rests) == 1
        assert my2_rests[0]["id"] == t2_id
        assert my2_rests[0]["name"] == "Neon Sakura Lounge"
        print(" -> Owner identity isolation verified: Owner 1 sees ONLY Tenant 1; Owner 2 sees ONLY Tenant 2.")

        # -------------------------------------------------------------
        # STEP 6: TABLES & QR CONFIGURATION ISOLATION
        # -------------------------------------------------------------
        print("\n[STEP 6] Verifying Table & QR Code isolation...")
        t1_tables = (await client.get(f"/api/v1/restaurants/{t1_id}/tables")).json()
        t2_tables = (await client.get(f"/api/v1/restaurants/{t2_id}/tables")).json()

        assert len(t1_tables) > 0 and len(t2_tables) > 0
        assert all(t["restaurant_id"] == t1_id for t in t1_tables)
        assert all(t["restaurant_id"] == t2_id for t in t2_tables)
        assert all(t1_id in t["qr_code_url"] for t in t1_tables)
        assert all(t2_id in t["qr_code_url"] for t in t2_tables)
        assert not any(t2_id in t["qr_code_url"] for t in t1_tables)
        print(f" -> Tables verified: Tenant 1 has {len(t1_tables)} tables; Tenant 2 has {len(t2_tables)} tables. Zero ID leakage.")

        # -------------------------------------------------------------
        # STEP 7: MENU CATEGORIES & ITEMS ISOLATION
        # -------------------------------------------------------------
        print("\n[STEP 7] Creating custom distinct menu items for Tenant 1 and Tenant 2...")
        # Tenant 1 Categories & Items
        cat1_res = await client.post(f"/api/v1/restaurants/{t1_id}/categories", json={"name": "Goan Curries", "sortOrder": 1})
        cat1_id = cat1_res.json()["id"]
        await client.post(f"/api/v1/restaurants/{t1_id}/menu", json={
            "categoryId": cat1_id,
            "name": "Kingfish Prawn Curry",
            "price": 420.00,
            "isVegetarian": False,
            "targetDestination": "KITCHEN"
        })

        # Tenant 2 Categories & Items
        cat2_res = await client.post(f"/api/v1/restaurants/{t2_id}/categories", json={"name": "Sake & Cocktails", "sortOrder": 1})
        cat2_id = cat2_res.json()["id"]
        await client.post(f"/api/v1/restaurants/{t2_id}/menu", json={
            "categoryId": cat2_id,
            "name": "Yuzu Smoke Martini",
            "price": 850.00,
            "isVegetarian": True,
            "targetDestination": "BAR"
        })

        # Verify Menu isolation
        m1 = (await client.get(f"/api/v1/restaurants/{t1_id}/menu")).json()["items"]
        m2 = (await client.get(f"/api/v1/restaurants/{t2_id}/menu")).json()["items"]

        m1_names = [i["name"] for i in m1]
        m2_names = [i["name"] for i in m2]

        assert "Kingfish Prawn Curry" in m1_names
        assert "Kingfish Prawn Curry" not in m2_names
        assert "Yuzu Smoke Martini" in m2_names
        assert "Yuzu Smoke Martini" not in m1_names
        print(f" -> Menu Isolation verified: Tenant 1 menu contains {m1_names}; Tenant 2 menu contains {m2_names}.")

        # -------------------------------------------------------------
        # STEP 8: CUSTOMER ORDERS & KITCHEN / BAR ROUTING ISOLATION
        # -------------------------------------------------------------
        print("\n[STEP 8] Creating active orders for Tenant 1 and Tenant 2...")
        ord1_payload = {
            "restaurantId": t1_id,
            "tableNumber": "Table 01",
            "items": [{"name": "Kingfish Prawn Curry", "quantity": 2, "price": 420.00, "targetDestination": "KITCHEN"}],
            "totalAmount": 840.00,
            "orderType": "DINE_IN"
        }
        ord1 = (await client.post("/api/v1/orders", json=ord1_payload)).json()
        ord1_id = ord1["id"]

        ord2_payload = {
            "restaurantId": t2_id,
            "tableNumber": "Table 03",
            "items": [{"name": "Yuzu Smoke Martini", "quantity": 3, "price": 850.00, "targetDestination": "BAR"}],
            "totalAmount": 2550.00,
            "orderType": "DINE_IN"
        }
        ord2 = (await client.post("/api/v1/orders", json=ord2_payload)).json()
        ord2_id = ord2["id"]

        # Fetch orders for Tenant 1 and Tenant 2
        ords_1 = (await client.get(f"/api/v1/orders/restaurant/{t1_id}")).json()
        ords_2 = (await client.get(f"/api/v1/orders/restaurant/{t2_id}")).json()

        assert any(o["id"] == ord1_id for o in ords_1)
        assert not any(o["id"] == ord2_id for o in ords_1)
        assert any(o["id"] == ord2_id for o in ords_2)
        assert not any(o["id"] == ord1_id for o in ords_2)
        print(f" -> Order Isolation verified: Tenant 1 has order #{ord1_id}; Tenant 2 has order #{ord2_id}.")

        # -------------------------------------------------------------
        # STEP 9: WAITER & SERVICE REQUESTS ISOLATION
        # -------------------------------------------------------------
        print("\n[STEP 9] Verifying Customer / Waiter Service Request isolation...")
        req1 = (await client.post("/api/v1/customer-requests", json={
            "restaurantId": t1_id,
            "tableNumber": "Table 01",
            "requestType": "WATER",
            "message": "Extra coastal drinking water"
        })).json()

        req2 = (await client.post("/api/v1/customer-requests", json={
            "restaurantId": t2_id,
            "tableNumber": "Table 03",
            "requestType": "BILL",
            "message": "Final bill for Sakura Table 03"
        })).json()

        reqs_1 = (await client.get(f"/api/v1/customer-requests?restaurant_id={t1_id}")).json()
        reqs_2 = (await client.get(f"/api/v1/customer-requests?restaurant_id={t2_id}")).json()

        assert any(r["id"] == req1["id"] for r in reqs_1)
        assert not any(r["id"] == req2["id"] for r in reqs_1)
        assert any(r["id"] == req2["id"] for r in reqs_2)
        assert not any(r["id"] == req1["id"] for r in reqs_2)
        print(" -> Waiter Requests Isolation verified: Requests never cross tenant boundaries.")

        # -------------------------------------------------------------
        # STEP 10: BILLING, TAX & COMPLIANCE ISOLATION
        # -------------------------------------------------------------
        print("\n[STEP 10] Configuring and verifying Billing & Tax isolation...")
        await client.put(f"/api/v1/restaurants/{t1_id}/billing/config", json={
            "legal_name": "Coastal Spice Seafood LLP",
            "gstin": "30AAAAA1111A1Z5",
            "upi_id": "coastalspice@okaxis",
            "upi_merchant_name": "Coastal Spice Retreat"
        })

        await client.put(f"/api/v1/restaurants/{t2_id}/billing/config", json={
            "legal_name": "Neon Sakura Tokyo Kabushiki Gaisha",
            "gstin": "27BBBBB2222B2Z6",
            "upi_id": "neonsakura@upi",
            "upi_merchant_name": "Neon Sakura Lounge"
        })

        cfg1 = (await client.get(f"/api/v1/restaurants/{t1_id}/billing/config")).json()
        cfg2 = (await client.get(f"/api/v1/restaurants/{t2_id}/billing/config")).json()

        assert cfg1["legalName"] == "Coastal Spice Seafood LLP"
        assert cfg1["gstin"] == "30AAAAA1111A1Z5"
        assert cfg1["upiId"] == "coastalspice@okaxis"

        assert cfg2["legalName"] == "Neon Sakura Tokyo Kabushiki Gaisha"
        assert cfg2["gstin"] == "27BBBBB2222B2Z6"
        assert cfg2["upiId"] == "neonsakura@upi"
        print(" -> Billing & GST/UPI configuration verified: Completely separated.")

        # -------------------------------------------------------------
        # STEP 11: ZERO CAFE.CO FALLBACK GUARANTEE
        # -------------------------------------------------------------
        print("\n[STEP 11] Verifying ZERO CAFE.CO fallback guarantee...")
        bogus_ids = ["rest-999999999999", "default", "undefined", "null", "rest-unknown"]
        for b_id in bogus_ids:
            res_bogus = await client.get(f"/api/v1/restaurants/{b_id}")
            if res_bogus.status_code == 200:
                # If 200, must NEVER be CAFE.CO
                assert res_bogus.json()["name"] != "CAFE.CO"
            else:
                assert res_bogus.status_code in [404, 400]

        print(" -> Zero fallback guarantee verified: Missing/invalid IDs never return CAFE.CO.")

    print("\n" + "=" * 80)
    print("ALL 11 END-TO-END MULTI-TENANT ISOLATION CHECKS PASSED WITH ZERO DATA MIXING!")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(run_audit())

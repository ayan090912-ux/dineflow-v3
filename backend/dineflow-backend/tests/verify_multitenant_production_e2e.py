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
    async with AsyncClient(transport=transport, base_url="http://test") as raw_client:
        class RobustClient:
            def __init__(self, inner):
                self.inner = inner

            async def request(self, method, url, **kwargs):
                for attempt in range(6):
                    res = await self.inner.request(method, url, **kwargs)
                    if res.status_code == 429:
                        wait_sec = 3
                        try:
                            wait_sec = int(res.json().get("retry_after_seconds", 3))
                        except Exception:
                            pass
                        print(f" [HTTP 429 Rate limited on {url}] Waiting {wait_sec + 1}s (attempt {attempt+1}/6)...")
                        await asyncio.sleep(wait_sec + 1)
                        continue
                    return res
                return res

            async def get(self, url, **kwargs):
                return await self.request("GET", url, **kwargs)

            async def post(self, url, **kwargs):
                return await self.request("POST", url, **kwargs)

            async def put(self, url, **kwargs):
                return await self.request("PUT", url, **kwargs)

            async def delete(self, url, **kwargs):
                return await self.request("DELETE", url, **kwargs)

        client = RobustClient(raw_client)
        # -------------------------------------------------------------
        # STEP 1: ONBOARD TENANT 1A & 1B (Owner 1: Rajesh owns 2 restaurants)
        # -------------------------------------------------------------
        run_suffix = uuid.uuid4().hex[:6]
        owner1_email = f"rajesh_{run_suffix}@coastalspice.food"
        owner1_uid = f"uid-firebase-rajesh-{run_suffix}"
        owner2_email = f"kenji_{run_suffix}@neonsakura.tokyo"
        owner2_uid = f"uid-firebase-kenji-{run_suffix}"

        print(f"\n[STEP 1] Creating Tenant 1A: Coastal Spice Retreat (Owner: {owner1_email})...")
        payload_1a = {
            "name": f"Coastal Spice Retreat {run_suffix}",
            "cuisine": "South Indian Seafood",
            "businessType": "RESTAURANT",
            "hasBar": True,
            "hasTables": True,
            "hasKitchen": True,
            "hasWaiter": True,
            "hasInventory": True,
            "hasBilling": True,
            "ownerName": "Rajesh Nair",
            "ownerEmail": owner1_email,
            "ownerUid": owner1_uid,
            "phone": "+91 98450 11223",
            "address": "12 Fisherman Wharf, Calangute, Goa",
            "currency": "INR (₹)",
            "taxPercentage": 5.0
        }
        res1a = await client.post("/api/v1/restaurants", json=payload_1a)
        assert res1a.status_code == 201, f"Tenant 1A creation failed: {res1a.text}"
        tenant_1 = res1a.json()
        t1_id = tenant_1["id"]
        print(f" -> Tenant 1A Created: ID={t1_id}, Status={tenant_1['lifecycle_status']}, Approved={tenant_1['is_approved']}")
        assert tenant_1["lifecycle_status"] == "PENDING_APPROVAL"
        assert tenant_1["is_approved"] is False

        print(f"\n[STEP 1B] Creating Tenant 1B: Coastal Spice Express (Same Owner: {owner1_email})...")
        payload_1b = {
            "name": f"Coastal Spice Express {run_suffix}",
            "cuisine": "Fast Casual Seafood",
            "businessType": "RESTAURANT",
            "hasBar": False,
            "hasTables": True,
            "hasKitchen": True,
            "hasWaiter": True,
            "hasInventory": True,
            "hasBilling": True,
            "ownerName": "Rajesh Nair",
            "ownerEmail": owner1_email,
            "ownerUid": owner1_uid,
            "phone": "+91 98450 99887",
            "address": "Terminal 2, Dabolim Airport, Goa",
            "currency": "INR (₹)",
            "taxPercentage": 5.0
        }
        res1b = await client.post("/api/v1/restaurants", json=payload_1b)
        assert res1b.status_code == 201, f"Tenant 1B creation failed: {res1b.text}"
        tenant_1b = res1b.json()
        t1b_id = tenant_1b["id"]
        print(f" -> Tenant 1B Created: ID={t1b_id}, Status={tenant_1b['lifecycle_status']}, Approved={tenant_1b['is_approved']}")
        assert tenant_1b["lifecycle_status"] == "PENDING_APPROVAL"

        # -------------------------------------------------------------
        # STEP 2: ONBOARD TENANT 2 (Owner 2: Kenji)
        # -------------------------------------------------------------
        print(f"\n[STEP 2] Creating Tenant 2: Neon Sakura Lounge (Owner: {owner2_email})...")
        payload_2 = {
            "name": f"Neon Sakura Lounge {run_suffix}",
            "cuisine": "Japanese Izakaya & Bar",
            "businessType": "BAR",
            "hasBar": True,
            "hasTables": True,
            "hasKitchen": True,
            "hasWaiter": True,
            "hasInventory": True,
            "hasBilling": True,
            "ownerName": "Kenji Sato",
            "ownerEmail": owner2_email,
            "ownerUid": owner2_uid,
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
        assert t1_id != t2_id and t1b_id != t2_id, "Tenant IDs MUST be unique!"

        # -------------------------------------------------------------
        # STEP 3: PLATFORM ADMIN SEES ALL PENDING TENANTS
        # -------------------------------------------------------------
        print("\n[STEP 3] Platform Admin queries all pending approval requests...")
        admin_res = await client.get("/api/v1/admin/restaurants")
        assert admin_res.status_code == 200
        all_admin_rests = admin_res.json()
        p1a = next((r for r in all_admin_rests if r["id"] == t1_id), None)
        p1b = next((r for r in all_admin_rests if r["id"] == t1b_id), None)
        p2 = next((r for r in all_admin_rests if r["id"] == t2_id), None)
        assert p1a is not None, "Tenant 1A must be in Platform Admin queue"
        assert p1b is not None, "Tenant 1B must be in Platform Admin queue"
        assert p2 is not None, "Tenant 2 must be in Platform Admin queue"
        assert p1a["lifecycleStatus"] == "PENDING_APPROVAL"
        assert p1b["lifecycleStatus"] == "PENDING_APPROVAL"
        assert p2["lifecycleStatus"] == "PENDING_APPROVAL"
        print(f" -> Platform Admin confirmed pending status for {p1a['name']}, {p1b['name']}, and {p2['name']}")

        # -------------------------------------------------------------
        # STEP 4: PLATFORM ADMIN APPROVES ALL TENANTS
        # -------------------------------------------------------------
        print("\n[STEP 4] Platform Admin approves all tenants...")
        appr_1a = await client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": t1_id})
        assert appr_1a.status_code == 200 and appr_1a.json()["lifecycleStatus"] == "LIVE"

        appr_1b = await client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": t1b_id})
        assert appr_1b.status_code == 200 and appr_1b.json()["lifecycleStatus"] == "LIVE"

        appr_2 = await client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": t2_id})
        assert appr_2.status_code == 200 and appr_2.json()["lifecycleStatus"] == "LIVE"
        print(" -> All tenants successfully transitioned to LIVE status with auto-provisioned tables & categories")

        # -------------------------------------------------------------
        # STEP 5: VERIFY MULTI-RESTAURANT OWNER RESOLUTION & RESTAURANT SWITCHING
        # -------------------------------------------------------------
        print("\n[STEP 5] Verifying Multi-Restaurant Owner Identity & Hostname Switching...")
        # Owner 1 owns 2 restaurants
        my1 = await client.get(f"/api/v1/restaurants/owner/my?owner_email={owner1_email}")
        assert my1.status_code == 200
        my1_rests = my1.json()
        assert len(my1_rests) == 2, f"Owner 1 must have exactly 2 restaurants! Found {len(my1_rests)}"
        my1_ids = [r["id"] for r in my1_rests]
        assert t1_id in my1_ids and t1b_id in my1_ids
        assert t2_id not in my1_ids

        # Owner 2 owns 1 restaurant
        my2 = await client.get(f"/api/v1/restaurants/owner/my?owner_email={owner2_email}")
        assert my2.status_code == 200
        my2_rests = my2.json()
        assert len(my2_rests) == 1, f"Owner 2 must have exactly 1 restaurant! Found {len(my2_rests)}"
        assert my2_rests[0]["id"] == t2_id
        assert t1_id not in [r["id"] for r in my2_rests]

        # Verify Canonical Tenant Domains & Switching
        rest_1a_slug = next(r.get("public_slug") or r.get("publicSlug") or r.get("slug") for r in my1_rests if r["id"] == t1_id)
        rest_1b_slug = next(r.get("public_slug") or r.get("publicSlug") or r.get("slug") for r in my1_rests if r["id"] == t1b_id)
        assert rest_1a_slug != rest_1b_slug, "Tenant slugs must be distinct"
        print(f" -> Owner 1 Switching: https://{rest_1a_slug}.dinely.food/restaurant/dashboard <-> https://{rest_1b_slug}.dinely.food/restaurant/dashboard")
        print(" -> Multi-restaurant ownership & switching verified: Owner 1 owns 2 outlets; Owner 2 owns 1 outlet.")

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
        # STEP 7: MENU CATEGORIES & ITEMS ISOLATION (WITH STRICT OWNER AUTH)
        # -------------------------------------------------------------
        print("\n[STEP 7] Creating custom distinct menu items for Tenant 1 and Tenant 2...")
        from jose import jwt as jose_jwt
        from app.core.config.settings import get_settings
        app_settings = get_settings()

        token_1 = jose_jwt.encode(
            {"sub": owner1_uid, "email": owner1_email, "role": "OWNER", "restaurant_id": t1_id},
            app_settings.JWT_ACCESS_SECRET_KEY,
            algorithm=app_settings.JWT_ALGORITHM
        )
        headers_1 = {"Authorization": f"Bearer {token_1}", "X-Forwarded-For": "203.0.113.11"}

        token_2 = jose_jwt.encode(
            {"sub": owner2_uid, "email": owner2_email, "role": "OWNER", "restaurant_id": t2_id},
            app_settings.JWT_ACCESS_SECRET_KEY,
            algorithm=app_settings.JWT_ALGORITHM
        )
        headers_2 = {"Authorization": f"Bearer {token_2}", "X-Forwarded-For": "203.0.113.22"}

        # Cross-Tenant Rejection Test: Owner 1 attempting to mutate Tenant 2 must be rejected with 403
        cross_res = await client.post(f"/api/v1/restaurants/{t2_id}/categories", json={"name": "Hacked Category", "sortOrder": 99}, headers=headers_1)
        assert cross_res.status_code == 403, f"Cross-tenant category creation MUST be rejected with 403! Got {cross_res.status_code}"
        print(" -> Verified: Cross-tenant category mutation strictly rejected with 403 Forbidden.")

        # Tenant 1 Categories & Items (Authorized)
        cat1_res = await client.post(f"/api/v1/restaurants/{t1_id}/categories", json={"name": "Goan Curries", "sortOrder": 1}, headers=headers_1)
        assert cat1_res.status_code == 201, f"Failed creating cat 1: {cat1_res.text}"
        cat1_id = cat1_res.json()["id"]
        await client.post(f"/api/v1/restaurants/{t1_id}/menu", json={
            "categoryId": cat1_id,
            "name": "Kingfish Prawn Curry",
            "price": 420.00,
            "isVegetarian": False,
            "targetDestination": "KITCHEN"
        }, headers=headers_1)

        # Tenant 2 Categories & Items (Authorized)
        cat2_res = await client.post(f"/api/v1/restaurants/{t2_id}/categories", json={"name": "Sake & Cocktails", "sortOrder": 1}, headers=headers_2)
        assert cat2_res.status_code == 201, f"Failed creating cat 2: {cat2_res.text}"
        cat2_id = cat2_res.json()["id"]
        await client.post(f"/api/v1/restaurants/{t2_id}/menu", json={
            "categoryId": cat2_id,
            "name": "Yuzu Smoke Martini",
            "price": 850.00,
            "isVegetarian": True,
            "targetDestination": "BAR"
        }, headers=headers_2)

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
        # STEP 8: CUSTOMER ORDERS, REALTIME WEBSOCKETS & KITCHEN/BAR ROUTING ISOLATION
        # -------------------------------------------------------------
        print("\n[STEP 8] Connecting tenant-scoped WebSockets and creating active orders...")
        from app.modules.websocket.manager import ws_manager
        import json as json_lib

        class MockWebSocket:
            def __init__(self, name):
                self.name = name
                self.received = []
            async def accept(self):
                pass
            async def send_text(self, text: str):
                self.received.append(text)

        ws_kitchen_1 = MockWebSocket("Tenant1_Kitchen")
        ws_kitchen_2 = MockWebSocket("Tenant2_Kitchen")

        await ws_manager.connect(ws_kitchen_1, restaurant_id=t1_id, role="KITCHEN")
        await ws_manager.connect(ws_kitchen_2, restaurant_id=t2_id, role="KITCHEN")

        ord1_payload = {
            "restaurantId": t1_id,
            "tableNumber": "Table 01",
            "items": [{"name": "Kingfish Prawn Curry", "quantity": 2, "price": 420.00, "targetDestination": "KITCHEN"}],
            "totalAmount": 840.00,
            "orderType": "DINE_IN"
        }
        ord1_res = await client.post("/api/v1/orders", json=ord1_payload)
        assert ord1_res.status_code == 201, f"Failed placing order 1: {ord1_res.text}"
        ord1 = ord1_res.json()
        ord1_id = ord1["id"]

        ord2_payload = {
            "restaurantId": t2_id,
            "tableNumber": "Table 03",
            "items": [{"name": "Yuzu Smoke Martini", "quantity": 3, "price": 850.00, "targetDestination": "BAR"}],
            "totalAmount": 2550.00,
            "orderType": "DINE_IN"
        }
        ord2_res = await client.post("/api/v1/orders", json=ord2_payload)
        assert ord2_res.status_code == 201, f"Failed placing order 2: {ord2_res.text}"
        ord2 = ord2_res.json()
        ord2_id = ord2["id"]

        # Verify Realtime WebSocket Isolation: Tenant 1 Kitchen received ord1 but NOT ord2
        t1_events = [json_lib.loads(msg) for msg in ws_kitchen_1.received if msg.startswith("{")]
        t2_events = [json_lib.loads(msg) for msg in ws_kitchen_2.received if msg.startswith("{")]

        assert any(e.get("data", {}).get("id") == ord1_id or ord1_id in str(e) for e in t1_events), "Tenant 1 Kitchen must receive Order 1"
        assert not any(e.get("data", {}).get("id") == ord2_id or ord2_id in str(e) for e in t1_events), "Tenant 1 Kitchen must NEVER receive Order 2"

        assert any(e.get("data", {}).get("id") == ord2_id or ord2_id in str(e) for e in t2_events), "Tenant 2 Kitchen must receive Order 2"
        assert not any(e.get("data", {}).get("id") == ord1_id or ord1_id in str(e) for e in t2_events), "Tenant 2 Kitchen must NEVER receive Order 1"
        print(" -> Realtime WebSocket Isolation verified: Kitchen events remain strictly tenant-scoped with zero cross-tenant leakage.")

        await ws_manager.disconnect(ws_kitchen_1)
        await ws_manager.disconnect(ws_kitchen_2)

        # Cross-Tenant Orders Rejection Test
        cross_ord_1 = await client.get(f"/api/v1/orders/restaurant/{t2_id}", headers=headers_1)
        assert cross_ord_1.status_code == 403, f"Owner 1 must NOT access Tenant 2 orders! Got {cross_ord_1.status_code}"
        print(" -> Verified: Owner 1 unauthorized access to Tenant 2 orders strictly rejected with 403 Forbidden.")

        cross_ord_2 = await client.get(f"/api/v1/orders/restaurant/{t1_id}", headers=headers_2)
        assert cross_ord_2.status_code == 403, f"Owner 2 must NOT access Tenant 1 orders! Got {cross_ord_2.status_code}"
        print(" -> Verified: Owner 2 unauthorized access to Tenant 1 orders strictly rejected with 403 Forbidden.")

        # Authorized Orders Access
        ords_1_res = await client.get(f"/api/v1/orders/restaurant/{t1_id}", headers=headers_1)
        assert ords_1_res.status_code == 200, f"Owner 1 failed reading own orders: {ords_1_res.text}"
        ords_1 = ords_1_res.json()

        ords_2_res = await client.get(f"/api/v1/orders/restaurant/{t2_id}", headers=headers_2)
        assert ords_2_res.status_code == 200, f"Owner 2 failed reading own orders: {ords_2_res.text}"
        ords_2 = ords_2_res.json()

        assert any(o["id"] == ord1_id for o in ords_1)
        assert not any(o["id"] == ord2_id for o in ords_1)
        assert any(o["id"] == ord2_id for o in ords_2)
        assert not any(o["id"] == ord1_id for o in ords_2)
        print(f" -> Order Isolation verified: Tenant 1 has order #{ord1_id}; Tenant 2 has order #{ord2_id}.")

        # -------------------------------------------------------------
        # STEP 9: WAITER & SERVICE REQUESTS ISOLATION
        # -------------------------------------------------------------
        print("\n[STEP 9] Verifying Customer / Waiter Service Request isolation...")
        req1_res = await client.post("/api/v1/customer-requests", json={
            "restaurantId": t1_id,
            "tableNumber": "Table 01",
            "requestType": "WATER",
            "message": "Extra coastal drinking water"
        })
        assert req1_res.status_code == 201, f"Failed placing req 1: {req1_res.text}"
        req1 = req1_res.json()

        req2_res = await client.post("/api/v1/customer-requests", json={
            "restaurantId": t2_id,
            "tableNumber": "Table 03",
            "requestType": "BILL",
            "message": "Final bill for Sakura Table 03"
        })
        assert req2_res.status_code == 201, f"Failed placing req 2: {req2_res.text}"
        req2 = req2_res.json()

        # Cross-Tenant Service Request Rejection Test
        cross_req_1 = await client.get(f"/api/v1/customer-requests?restaurant_id={t2_id}", headers=headers_1)
        assert cross_req_1.status_code == 403, f"Owner 1 must NOT access Tenant 2 requests! Got {cross_req_1.status_code}"
        print(" -> Verified: Owner 1 unauthorized access to Tenant 2 requests strictly rejected with 403 Forbidden.")

        # Authorized Service Requests Access
        reqs_1_res = await client.get(f"/api/v1/customer-requests?restaurant_id={t1_id}", headers=headers_1)
        assert reqs_1_res.status_code == 200, f"Owner 1 failed reading own requests: {reqs_1_res.text}"
        reqs_1 = reqs_1_res.json()

        reqs_2_res = await client.get(f"/api/v1/customer-requests?restaurant_id={t2_id}", headers=headers_2)
        assert reqs_2_res.status_code == 200, f"Owner 2 failed reading own requests: {reqs_2_res.text}"
        reqs_2 = reqs_2_res.json()

        assert any(r["id"] == req1["id"] for r in reqs_1)
        assert not any(r["id"] == req2["id"] for r in reqs_1)
        assert any(r["id"] == req2["id"] for r in reqs_2)
        assert not any(r["id"] == req1["id"] for r in reqs_2)
        print(" -> Waiter Requests Isolation verified: Requests never cross tenant boundaries.")

        # -------------------------------------------------------------
        # STEP 9B: DYNAMIC MEMBERSHIP ACCESS DELEGATION
        # -------------------------------------------------------------
        print("\n[STEP 9B] Verifying Restaurant Membership Delegation...")
        from app.core.database.connection import AsyncSessionLocal
        from app.modules.restaurants.models import RestaurantMembership

        # Grant Owner 1 role 'STAFF' in Tenant 2
        async with AsyncSessionLocal() as db_session:
            new_mem = RestaurantMembership(
                restaurant_id=t2_id,
                user_uid=owner1_uid,
                user_email=owner1_email,
                role="STAFF"
            )
            db_session.add(new_mem)
            await db_session.commit()

        # Now Owner 1 CAN access Tenant 2 orders via valid membership
        mem_access_res = await client.get(f"/api/v1/orders/restaurant/{t2_id}", headers=headers_1)
        assert mem_access_res.status_code == 200, f"Owner 1 with membership must access Tenant 2 orders! Got {mem_access_res.status_code}"
        print(" -> Verified: Owner 1 can access Tenant 2 orders only after valid membership was granted.")

        # Revoke membership
        async with AsyncSessionLocal() as db_session:
            from sqlalchemy import delete
            await db_session.execute(
                delete(RestaurantMembership).where(
                    (RestaurantMembership.restaurant_id == t2_id) &
                    (RestaurantMembership.user_uid == owner1_uid)
                )
            )
            await db_session.commit()

        # Now Owner 1 is rejected again
        revoked_res = await client.get(f"/api/v1/orders/restaurant/{t2_id}", headers=headers_1)
        assert revoked_res.status_code == 403, f"Owner 1 must be rejected after membership revoked! Got {revoked_res.status_code}"
        print(" -> Verified: Access revoked immediately when membership is deleted.")

        # -------------------------------------------------------------
        # STEP 10: BILLING, TAX & COMPLIANCE ISOLATION
        # -------------------------------------------------------------
        print("\n[STEP 10] Configuring and verifying Billing & Tax isolation...")
        # Cross-Tenant Rejection Test: Owner 1 attempting to update Tenant 2 billing must fail with 403
        cross_bill = await client.put(f"/api/v1/restaurants/{t2_id}/billing/config", json={
            "legal_name": "Unauthorized Intrusion",
            "gstin": "00XXXXX0000X0Z0",
            "upi_id": "hacker@upi",
            "upi_merchant_name": "Hacker"
        }, headers=headers_1)
        assert cross_bill.status_code == 403, f"Cross-tenant billing modification MUST be rejected with 403! Got {cross_bill.status_code}"
        print(" -> Verified: Cross-tenant billing modification strictly rejected with 403 Forbidden.")

        await client.put(f"/api/v1/restaurants/{t1_id}/billing/config", json={
            "legal_name": "Coastal Spice Seafood LLP",
            "gstin": "30AAAAA1111A1Z5",
            "upi_id": "coastalspice@okaxis",
            "upi_merchant_name": "Coastal Spice Retreat"
        }, headers=headers_1)

        await client.put(f"/api/v1/restaurants/{t2_id}/billing/config", json={
            "legal_name": "Neon Sakura Tokyo Kabushiki Gaisha",
            "gstin": "27BBBBB2222B2Z6",
            "upi_id": "neonsakura@upi",
            "upi_merchant_name": "Neon Sakura Lounge"
        }, headers=headers_2)

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

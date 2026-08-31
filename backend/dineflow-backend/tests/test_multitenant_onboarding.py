import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.security.rbac import require_platform_admin, get_current_firebase_admin

MOCK_ADMIN_CLAIMS = {
    "uid": "admin-ayan-123",
    "email": "ayan090912@gmail.com",
    "admin": True,
    "role": "PLATFORM_ADMIN"
}

@pytest.fixture(autouse=True)
def override_platform_admin_auth():
    async def _mock_admin():
        return MOCK_ADMIN_CLAIMS

    app.dependency_overrides[require_platform_admin] = _mock_admin
    app.dependency_overrides[get_current_firebase_admin] = _mock_admin
    yield
    if require_platform_admin in app.dependency_overrides:
        del app.dependency_overrides[require_platform_admin]
    if get_current_firebase_admin in app.dependency_overrides:
        del app.dependency_overrides[get_current_firebase_admin]


@pytest.mark.asyncio
async def test_new_restaurant_onboarding_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Step 1: Owner submits restaurant application
        payload = {
            "name": "Spice Route Coastal Bistro",
            "cuisine": "Seafood & Coastal",
            "businessType": "RESTAURANT",
            "hasBar": True,
            "hasTables": True,
            "hasKitchen": True,
            "hasWaiter": True,
            "hasInventory": True,
            "hasBilling": True,
            "ownerName": "Rajesh Kumar",
            "ownerEmail": "rajesh.spice@gmail.com",
            "ownerUid": "firebase-uid-rajesh-101",
            "phone": "+91 98765 43210",
            "address": "45 Beach Road, Goa, India"
        }
        res = await client.post("/api/v1/restaurants", json=payload)
        assert res.status_code == 201
        created = res.json()
        rest_id = created["id"]
        assert rest_id.startswith("rest-")
        assert created["name"] == "Spice Route Coastal Bistro"
        assert created["is_approved"] is False
        assert created["lifecycle_status"] == "PENDING_APPROVAL"
        assert created["owner_email"] == "rajesh.spice@gmail.com"
        assert created["owner_uid"] == "firebase-uid-rajesh-101"

        # Step 2: Platform Admin reviews and views in pending list
        admin_res = await client.get("/api/v1/admin/restaurants")
        assert admin_res.status_code == 200
        admin_rests = admin_res.json()
        found = next((r for r in admin_rests if r["id"] == rest_id), None)
        assert found is not None
        assert found["lifecycleStatus"] == "PENDING_APPROVAL"
        assert found["isApproved"] is False
        assert found["ownerEmail"] == "rajesh.spice@gmail.com"

        # Step 3: Platform Admin approves the restaurant
        approve_res = await client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_id})
        assert approve_res.status_code == 200
        assert approve_res.json()["status"] == "SUCCESS"
        assert approve_res.json()["lifecycleStatus"] == "LIVE"

        # Step 4: Verify restaurant is now LIVE and tables were seeded
        detail_res = await client.get(f"/api/v1/restaurants/{rest_id}")
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert detail["is_approved"] is True
        assert detail["lifecycle_status"] == "LIVE"
        assert detail["status"] == "OPEN"

        # Check seeded tables
        tbl_res = await client.get(f"/api/v1/restaurants/{rest_id}/tables")
        assert tbl_res.status_code == 200
        tables = tbl_res.json()
        assert len(tables) >= 8
        assert all(t["restaurant_id"] == rest_id for t in tables)


@pytest.mark.asyncio
async def test_restaurant_rejection_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create restaurant
        payload = {
            "name": "Quick Snacks Corner",
            "businessType": "FOOD_CART",
            "ownerName": "Pooja Sharma",
            "ownerEmail": "pooja.cart@gmail.com",
            "ownerUid": "uid-pooja-202",
        }
        res = await client.post("/api/v1/restaurants", json=payload)
        rest_id = res.json()["id"]

        # Reject restaurant
        reason = "Missing valid business license and tax registration documents."
        rej_res = await client.post("/api/v1/admin/restaurants/reject", json={
            "restaurant_id": rest_id,
            "reason": reason
        })
        assert rej_res.status_code == 200
        assert rej_res.json()["status"] == "SUCCESS"
        assert rej_res.json()["lifecycleStatus"] == "REJECTED"

        # Verify state in database
        detail_res = await client.get(f"/api/v1/restaurants/{rest_id}")
        detail = detail_res.json()
        assert detail["is_approved"] is False
        assert detail["lifecycle_status"] == "REJECTED"
        assert detail["rejection_reason"] == reason


@pytest.mark.asyncio
async def test_owner_tenant_resolution_and_isolation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create Owner A's restaurant
        res_a = await client.post("/api/v1/restaurants", json={
            "name": "Owner A Bistro",
            "ownerEmail": "ownerA@dinely.test",
            "ownerUid": "uid-owner-A",
        })
        rest_a_id = res_a.json()["id"]

        # Create Owner B's restaurant
        res_b = await client.post("/api/v1/restaurants", json={
            "name": "Owner B Tavern",
            "ownerEmail": "ownerB@dinely.test",
            "ownerUid": "uid-owner-B",
        })
        rest_b_id = res_b.json()["id"]

        assert rest_a_id != rest_b_id

        # Query Owner A's restaurants
        owner_a_res = await client.get("/api/v1/restaurants/owner/my?owner_email=ownerA@dinely.test")
        assert owner_a_res.status_code == 200
        owner_a_rests = owner_a_res.json()
        assert len(owner_a_rests) == 1
        assert owner_a_rests[0]["id"] == rest_a_id
        assert owner_a_rests[0]["name"] == "Owner A Bistro"

        # Query Owner B's restaurants
        owner_b_res = await client.get("/api/v1/restaurants/owner/my?owner_email=ownerB@dinely.test")
        assert owner_b_res.status_code == 200
        owner_b_rests = owner_b_res.json()
        assert len(owner_b_rests) == 1
        assert owner_b_rests[0]["id"] == rest_b_id
        assert owner_b_rests[0]["name"] == "Owner B Tavern"

        # Query unknown owner
        unknown_res = await client.get("/api/v1/restaurants/owner/my?owner_email=unknown@nobody.com")
        assert unknown_res.status_code == 200
        assert unknown_res.json() == []


@pytest.mark.asyncio
async def test_strict_multi_tenant_data_isolation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create and approve Restaurant A
        res_a = await client.post("/api/v1/restaurants", json={
            "name": "Trattoria Milano",
            "ownerEmail": "milano@dinely.test",
        })
        rest_a = res_a.json()["id"]
        await client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_a})

        # 2. Create and approve Restaurant B
        res_b = await client.post("/api/v1/restaurants", json={
            "name": "Tokyo Robata Grill",
            "ownerEmail": "tokyo@dinely.test",
        })
        rest_b = res_b.json()["id"]
        await client.post("/api/v1/admin/restaurants/approve", json={"restaurant_id": rest_b})

        # 3. Create Categories for A and B
        cat_a_res = await client.post(f"/api/v1/restaurants/{rest_a}/categories", json={"name": "Pasta Fresca", "sortOrder": 1})
        cat_a_id = cat_a_res.json()["id"]

        cat_b_res = await client.post(f"/api/v1/restaurants/{rest_b}/categories", json={"name": "Yakitori Skewers", "sortOrder": 1})
        cat_b_id = cat_b_res.json()["id"]

        # 4. Add Menu Item to A and Menu Item to B
        item_a_res = await client.post(f"/api/v1/restaurants/{rest_a}/menu", json={
            "categoryId": cat_a_id,
            "name": "Truffle Tagliatelle",
            "price": 24.50,
            "targetDestination": "KITCHEN"
        })
        item_a_id = item_a_res.json()["id"]

        item_b_res = await client.post(f"/api/v1/restaurants/{rest_b}/menu", json={
            "categoryId": cat_b_id,
            "name": "Wagyu Beef Kushiyaki",
            "price": 38.00,
            "targetDestination": "KITCHEN"
        })
        item_b_id = item_b_res.json()["id"]

        # 5. Verify Menu Item Isolation
        menu_a_res = (await client.get(f"/api/v1/restaurants/{rest_a}/menu")).json()
        menu_b_res = (await client.get(f"/api/v1/restaurants/{rest_b}/menu")).json()
        menu_a = menu_a_res.get("items", menu_a_res) if isinstance(menu_a_res, dict) else menu_a_res
        menu_b = menu_b_res.get("items", menu_b_res) if isinstance(menu_b_res, dict) else menu_b_res

        assert any(item["name"] == "Truffle Tagliatelle" for item in menu_a)
        assert not any(item["name"] == "Wagyu Beef Kushiyaki" for item in menu_a)

        assert any(item["name"] == "Wagyu Beef Kushiyaki" for item in menu_b)
        assert not any(item["name"] == "Truffle Tagliatelle" for item in menu_b)

        # 6. Create Customer Requests for A and B
        req_a = await client.post("/api/v1/customer-requests", json={
            "restaurantId": rest_a,
            "tableNumber": "Table 01",
            "requestType": "WATER",
            "message": "Water for Milano Table 01"
        })
        req_b = await client.post("/api/v1/customer-requests", json={
            "restaurantId": rest_b,
            "tableNumber": "Table 02",
            "requestType": "BILL",
            "message": "Bill for Tokyo Table 02"
        })

        # 7. Verify Customer Request Isolation
        reqs_a = (await client.get(f"/api/v1/customer-requests?restaurant_id={rest_a}")).json()
        reqs_b = (await client.get(f"/api/v1/customer-requests?restaurant_id={rest_b}")).json()

        assert any(r["tableNumber"] == "Table 01" for r in reqs_a)
        assert not any(r["tableNumber"] == "Table 02" for r in reqs_a)

        assert any(r["tableNumber"] == "Table 02" for r in reqs_b)
        assert not any(r["tableNumber"] == "Table 01" for r in reqs_b)


@pytest.mark.asyncio
async def test_zero_cafe_co_fallback():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Requesting a random non-existent restaurant must return 404, NEVER CAFE.CO
        res = await client.get("/api/v1/restaurants/rest-non-existent-999999")
        assert res.status_code == 404
        assert "not found" in res.json()["detail"].lower()

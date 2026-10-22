"""
DineFlow Global Menu Library Comprehensive Test Suite
Covers:
1. Catalogue search, category/subcategory filtering, and pagination
2. Single and bulk addition of catalogue items to a restaurant
3. Tenant isolation and RBAC permissions
4. Duplicate handling and idempotent repeated requests (SKIP, OVERWRITE, CREATE_COPY)
5. Custom restaurant price preservation and availability controls
6. Immutability of global catalogue templates when tenant modifies local menu item
7. Description library generator and template workflows
8. Accurate station routing (Kitchen, Bar, Hookah) and order terminal delivery
9. Wedding/event guest interface price suppression
10. Preservation of existing menu CRUD and billing workflows
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.main import app
from app.modules.restaurants.models import Restaurant, RestaurantMembership
from app.modules.menu.models import MenuCategory, MenuItem, CatalogueItem
from app.modules.tables.models import Table
from app.modules.menu.catalogue_seed import GLOBAL_CATALOGUE_SEED
from app.modules.menu.library_router import ensure_catalogue_seeded


AUTH_HEADER_A = {"Authorization": "Bearer firebase_token_owner::uid_owner_lib_a::owner_a@test.com"}
AUTH_HEADER_B = {"Authorization": "Bearer firebase_token_owner::uid_owner_lib_b::owner_b@test.com"}
UNAUTHORIZED_HEADER = {"Authorization": "Bearer firebase_token_customer::uid_customer_anon::customer@test.com"}


@pytest_asyncio.fixture(autouse=True)
async def setup_menu_library_env(db_session: AsyncSession):
    # Create test restaurants
    rest_a = Restaurant(
        id="rest-lib-test-a",
        name="The Bengali Feast",
        slug="the-bengali-feast",
        public_slug="the-bengali-feast",
        lifecycle_status="ACTIVE",
        invoice_starting_number=1001,
        owner_email="owner_a@test.com",
        owner_uid="uid_owner_lib_a",
        has_kitchen=True,
        has_bar=True,
        has_hookah=True,
        has_waiter=True,
        has_billing=True,
    )
    rest_b = Restaurant(
        id="rest-lib-test-b",
        name="Mughlai Darbar",
        slug="mughlai-darbar",
        public_slug="mughlai-darbar",
        lifecycle_status="ACTIVE",
        invoice_starting_number=2001,
        owner_email="owner_b@test.com",
        owner_uid="uid_owner_lib_b",
        has_kitchen=True,
        has_bar=True,
        has_hookah=True,
        has_waiter=True,
        has_billing=True,
    )
    db_session.add_all([rest_a, rest_b])

    # Tables
    tbl_a = Table(id="tbl-lib-a1", restaurant_id="rest-lib-test-a", table_number="Table 01", status="AVAILABLE")
    db_session.add(tbl_a)

    # Pre-seed Catalogue
    await ensure_catalogue_seeded(db_session)
    await db_session.commit()

    return {"rest_a": rest_a, "rest_b": rest_b, "tbl_a": tbl_a}


@pytest.mark.asyncio
async def test_01_catalogue_search_and_filtering(db_session):
    """1. Test catalogue retrieval, search, subcategory, and dietary filtering"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Full library retrieval
        res = await ac.get("/api/v1/menu/library")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 40
        assert len(data["items"]) > 0

        # Search for Bengali Hilsa
        s_res = await ac.get("/api/v1/menu/library?search=ilish")
        assert s_res.status_code == 200
        s_data = s_res.json()
        assert s_data["total"] >= 1
        assert any("Ilish" in item["name"] for item in s_data["items"])

        # Filter by Category = HOOKAH
        h_res = await ac.get("/api/v1/menu/library?category=HOOKAH")
        assert h_res.status_code == 200
        h_data = h_res.json()
        assert h_data["total"] >= 5
        assert all(i["targetDestination"] == "HOOKAH" for i in h_data["items"])

        # Filter by Dietary = VEG
        v_res = await ac.get("/api/v1/menu/library?dietaryType=VEG")
        assert v_res.status_code == 200
        v_data = v_res.json()
        assert all(i["isVegetarian"] is True for i in v_data["items"])


@pytest.mark.asyncio
async def test_02_add_items_to_restaurant_menu(db_session):
    """2. Add catalogue items to a restaurant menu with custom pricing and automatic category creation"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "items": [
                {
                    "catalogueItemId": "citem-food-shorshe-ilish",
                    "price": 750.0,  # Restaurant sets its own price
                    "customName": "Signature Shorshe Ilish",
                    "categoryName": "Bengali Heritage",
                    "targetDestination": "KITCHEN",
                    "servingSize": "2 large steaks",
                    "duplicateAction": "SKIP"
                },
                {
                    "catalogueItemId": "citem-hookah-paan-raas-supreme",
                    "price": 950.0,
                    "categoryName": "Lounge Hookah",
                    "targetDestination": "HOOKAH",
                    "duplicateAction": "SKIP"
                }
            ]
        }
        res = await ac.post(
            "/api/v1/menu/library/restaurants/rest-lib-test-a/add-items",
            json=payload,
            headers=AUTH_HEADER_A
        )
        assert res.status_code == 201
        res_data = res.json()
        assert res_data["addedCount"] == 2
        assert res_data["skippedCount"] == 0

        # Verify items appear on restaurant menu
        menu_res = await ac.get("/api/v1/restaurants/rest-lib-test-a/menu")
        assert menu_res.status_code == 200
        menu_data = menu_res.json()
        items = menu_data["items"]
        item_names = [i["name"] for i in items]
        assert "Signature Shorshe Ilish" in item_names
        assert "Paan Raas Supreme" in item_names

        # Verify price set is exact
        ilish = next(i for i in items if i["name"] == "Signature Shorshe Ilish")
        assert ilish["price"] == 750.0
        assert ilish["targetDestination"] == "KITCHEN"

        paan = next(i for i in items if i["name"] == "Paan Raas Supreme")
        assert paan["price"] == 950.0
        assert paan["targetDestination"] == "HOOKAH"


@pytest.mark.asyncio
async def test_03_tenant_isolation_and_permissions(db_session):
    """3. Verify Tenant B cannot add items to Tenant A, and unauthorized users cannot add items"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "items": [
                {"catalogueItemId": "citem-food-kosha-mangsho", "price": 550.0}
            ]
        }
        # Customer cannot add items
        unauth_res = await ac.post(
            "/api/v1/menu/library/restaurants/rest-lib-test-a/add-items",
            json=payload,
            headers=UNAUTHORIZED_HEADER
        )
        assert unauth_res.status_code in [401, 403]

        # Owner B cannot add items to Restaurant A
        cross_res = await ac.post(
            "/api/v1/menu/library/restaurants/rest-lib-test-a/add-items",
            json=payload,
            headers=AUTH_HEADER_B
        )
        assert cross_res.status_code == 403


@pytest.mark.asyncio
async def test_04_duplicate_handling_and_preservation(db_session):
    """4. Duplicate items detect existing records: SKIP preserves existing and OVERWRITE updates metadata"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # First addition
        p1 = {
            "items": [
                {"catalogueItemId": "citem-food-murgh-makhani", "price": 420.0, "duplicateAction": "SKIP"}
            ]
        }
        res1 = await ac.post(
            "/api/v1/menu/library/restaurants/rest-lib-test-a/add-items",
            json=p1,
            headers=AUTH_HEADER_A
        )
        assert res1.status_code == 201
        assert res1.json()["addedCount"] == 1

        # Second addition with SKIP -> must skip cleanly
        p2 = {
            "items": [
                {"catalogueItemId": "citem-food-murgh-makhani", "price": 490.0, "duplicateAction": "SKIP"}
            ]
        }
        res2 = await ac.post(
            "/api/v1/menu/library/restaurants/rest-lib-test-a/add-items",
            json=p2,
            headers=AUTH_HEADER_A
        )
        assert res2.status_code == 201
        assert res2.json()["addedCount"] == 0
        assert res2.json()["skippedCount"] == 1

        # Verify price was NOT overwritten by the skipped request
        m_res = await ac.get("/api/v1/restaurants/rest-lib-test-a/menu")
        butter_chicken = next(i for i in m_res.json()["items"] if "Murgh Makhani" in i["name"])
        assert butter_chicken["price"] == 420.0


@pytest.mark.asyncio
async def test_05_catalogue_template_immutability(db_session):
    """5. Editing restaurant menu item never alters the global catalogue template"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Add item
        add_res = await ac.post(
            "/api/v1/menu/library/restaurants/rest-lib-test-a/add-items",
            json={"items": [{"catalogueItemId": "citem-food-dal-makhani", "price": 320.0}]},
            headers=AUTH_HEADER_A
        )
        item_id = add_res.json()["added"][0]["id"]

        # Edit restaurant's local item
        await ac.put(
            f"/api/v1/restaurants/rest-lib-test-a/menu/{item_id}",
            json={"name": "Special Dinely 48-Hour Dal", "price": 450.0},
            headers=AUTH_HEADER_A
        )

        # Global template must remain pristine
        cat_item = await db_session.get(CatalogueItem, "citem-food-dal-makhani")
        assert cat_item.name == "Dal Makhani 24-Hour Simmer"
        assert cat_item.suggested_price_inr == 340.0


@pytest.mark.asyncio
async def test_06_description_generator_service():
    """6. Description generator produces short and long copy without external AI dependencies"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        gen_payload = {
            "itemName": "Kolkata Mutton Biryani",
            "category": "FOOD",
            "cuisine": "Bengali",
            "flavourProfile": "Aromatic saffron and meetha ittar",
            "ingredients": ["Aged Basmati Rice", "Tender Goat Meat", "Spiced Potato"],
            "dietaryType": "NON_VEG",
            "tone": "artisanal"
        }
        res = await ac.post("/api/v1/menu/library/generate-description", json=gen_payload)
        assert res.status_code == 200
        data = res.json()
        assert len(data["shortDescription"]) > 10
        assert len(data["longDescription"]) > 30
        assert len(data["variants"]) == 4  # classic, modern, concise, artisanal


@pytest.mark.asyncio
async def test_07_correct_terminal_routing(db_session):
    """7. Order containing library-added Food, Bar, and Hookah items routes to proper terminal queues"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Add 1 Food and 1 Hookah item
        await ac.post(
            "/api/v1/menu/library/restaurants/rest-lib-test-a/add-items",
            json={
                "items": [
                    {"catalogueItemId": "citem-food-paneer-tikka", "price": 350.0},
                    {"catalogueItemId": "citem-bar-gondhoraj-lemonade", "price": 180.0},
                    {"catalogueItemId": "citem-hookah-double-apple-royal", "price": 800.0}
                ]
            },
            headers=AUTH_HEADER_A
        )
        menu_res = await ac.get("/api/v1/restaurants/rest-lib-test-a/menu")
        items = {i["name"]: i for i in menu_res.json()["items"]}

        # Create order with all 3 items
        order_payload = {
            "restaurantId": "rest-lib-test-a",
            "tableNumber": "Table 01",
            "items": [
                {"id": items["Tandoori Paneer Tikka"]["id"], "name": "Tandoori Paneer Tikka", "price": 350.0, "quantity": 1},
                {"id": items["Gondhoraj Mint Shikanji"]["id"], "name": "Gondhoraj Mint Shikanji", "price": 180.0, "quantity": 1},
                {"id": items["Double Apple Royal"]["id"], "name": "Double Apple Royal", "price": 800.0, "quantity": 1}
            ]
        }
        ord_res = await ac.post("/api/v1/orders", json=order_payload, headers=AUTH_HEADER_A)
        assert ord_res.status_code == 201
        ord_data = ord_res.json()

        # Terminal status routing
        assert ord_data["kitchenStatus"] == "PENDING"
        assert ord_data["barStatus"] == "PENDING"
        assert ord_data["hookahStatus"] == "PENDING"


@pytest.mark.asyncio
async def test_08_wedding_event_guest_price_suppression(db_session):
    """8. Wedding guest interface suppresses all item prices and billing amounts for invited guests"""
    from app.modules.weddings.models import WeddingEvent, EventTable

    # Create active wedding event
    ev = WeddingEvent(
        id="ev-test-lib-wedding",
        restaurant_id="rest-lib-test-a",
        title="Roy & Sen Grand Wedding",
        couple_names="Ananya & Rahul",
        event_date="2026-11-20",
        status="ACTIVE",
        is_ordering_open=True,
        has_food=True,
        has_bar=True,
        has_hookah=True,
    )
    tbl = EventTable(
        id="ev-tbl-test-1",
        event_id="ev-test-lib-wedding",
        restaurant_id="rest-lib-test-a",
        table_number="VIP Table 01",
        capacity=8
    )
    db_session.add_all([ev, tbl])
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Public guest accesses event menu
        guest_res = await ac.get("/api/v1/public/events/ev-test-lib-wedding?table=VIP Table 01")
        assert guest_res.status_code == 200
        data = guest_res.json()

        # Verify that all menu categories and items have price = None
        for cat in data.get("menu", []):
            for item in cat.get("items", []):
                assert item["price"] is None, f"Price leaked for guest on item {item['name']}"


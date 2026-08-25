import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.menu.models import MenuCategory, MenuItem

@pytest_asyncio.fixture
async def setup_restaurant_and_menu(db_session):
    rest = Restaurant(
        id="rest-test-tax-1",
        name="Tax Test Bistro",
        slug="tax-test-bistro",
        cuisine="Multi-Cuisine",
        business_type="RESTAURANT",
        currency="INR (₹)",
        tax_percentage=5.0,
    )
    db_session.add(rest)

    cat = MenuCategory(
        id="cat-tax-food",
        restaurant_id="rest-test-tax-1",
        name="Food",
        sort_order=1,
        is_enabled=True,
    )
    db_session.add(cat)

    item1 = MenuItem(
        id="item-tax-1",
        restaurant_id="rest-test-tax-1",
        category_id="cat-tax-food",
        name="Truffle Pasta",
        price=1000.0,
        is_available=True,
        target_destination="KITCHEN",
    )
    item2 = MenuItem(
        id="item-tax-2",
        restaurant_id="rest-test-tax-1",
        category_id="cat-tax-food",
        name="Cocktail",
        price=500.0,
        is_available=True,
        target_destination="BAR",
    )
    db_session.add(item1)
    db_session.add(item2)

    await db_session.commit()
    return rest

@pytest.mark.asyncio
async def test_create_and_get_taxes(db_session, setup_restaurant_and_menu):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create GST 5% Tax
        payload = {
            "name": "GST",
            "type": "PERCENTAGE",
            "rate": 5.0,
            "isInclusive": False,
            "appliesTo": "ORDER",
            "applicableOrderTypes": ["DINE_IN", "TAKEAWAY", "DELIVERY"],
            "status": "ACTIVE"
        }
        res = await ac.post("/api/v1/restaurants/rest-test-tax-1/taxes", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["name"] == "GST"
        assert data["rate"] == 5.0
        assert data["status"] == "ACTIVE"
        tax_id = data["id"]

        # List taxes
        res_list = await ac.get("/api/v1/restaurants/rest-test-tax-1/taxes")
        assert res_list.status_code == 200
        taxes = res_list.json()
        assert len(taxes) >= 1
        assert any(t["id"] == tax_id for t in taxes)

@pytest.mark.asyncio
async def test_multi_tax_and_calculation(db_session, setup_restaurant_and_menu):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Create GST 5%
        await ac.post("/api/v1/restaurants/rest-test-tax-1/taxes", json={
            "name": "GST",
            "type": "PERCENTAGE",
            "rate": 5.0,
            "isInclusive": False,
            "appliesTo": "ORDER"
        })
        # 2. Create Service Charge 10%
        await ac.post("/api/v1/restaurants/rest-test-tax-1/taxes", json={
            "name": "Service Charge",
            "type": "PERCENTAGE",
            "rate": 10.0,
            "isInclusive": False,
            "appliesTo": "ORDER"
        })

        # Calculate taxes for ₹1,000 subtotal
        calc_payload = {
            "items": [{"menuItemId": "item-tax-1", "price": 1000.0, "quantity": 1}],
            "orderType": "DINE_IN"
        }
        res_calc = await ac.post("/api/v1/restaurants/rest-test-tax-1/taxes/calculate", json=calc_payload)
        assert res_calc.status_code == 200
        calc_data = res_calc.json()

        assert calc_data["subtotal"] == 1000.0
        assert calc_data["total_tax_amount"] == 150.0  # ₹50 GST + ₹100 Service Charge
        assert calc_data["grand_total"] == 1150.0
        assert len(calc_data["tax_breakdown"]) == 2

@pytest.mark.asyncio
async def test_activate_deactivate_tax(db_session, setup_restaurant_and_menu):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/api/v1/restaurants/rest-test-tax-1/taxes", json={
            "name": "Packaging Charge",
            "type": "FIXED",
            "fixedAmount": 20.0,
            "isInclusive": False,
            "appliesTo": "ORDER"
        })
        tax_id = res.json()["id"]

        # Deactivate
        res_deact = await ac.post(f"/api/v1/restaurants/rest-test-tax-1/taxes/{tax_id}/deactivate")
        assert res_deact.status_code == 200
        assert res_deact.json()["status"] == "INACTIVE"

        # Activate
        res_act = await ac.post(f"/api/v1/restaurants/rest-test-tax-1/taxes/{tax_id}/activate")
        assert res_act.status_code == 200
        assert res_act.json()["status"] == "ACTIVE"

@pytest.mark.asyncio
async def test_multi_tenant_tax_isolation(db_session, setup_restaurant_and_menu):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create tax in rest-test-tax-1
        res = await ac.post("/api/v1/restaurants/rest-test-tax-1/taxes", json={
            "name": "Rest 1 Secret Tax",
            "type": "PERCENTAGE",
            "rate": 5.0
        })
        tax_id = res.json()["id"]

        # Try to update or fetch tax using another restaurant ID (rest-other)
        res_forbidden = await ac.get(f"/api/v1/restaurants/rest-other/taxes/{tax_id}")
        assert res_forbidden.status_code == 404

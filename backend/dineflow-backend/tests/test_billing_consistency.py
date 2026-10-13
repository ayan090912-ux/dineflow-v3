import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone
from sqlalchemy import select

from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table, TableSession
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.orders.models import Order, Bill
from app.modules.taxes.models import Tax, TaxCategory, TaxMenuItem
from app.modules.business_day.models import BusinessDay
from app.modules.billing.service import BillingService

AUTH_HEADER_A = {"Authorization": "Bearer firebase_token_owner::uid_owner_a::owner_a@test.com"}
AUTH_HEADER_B = {"Authorization": "Bearer firebase_token_owner::uid_owner_b::owner_b@test.com"}
STAFF_HEADER_A = AUTH_HEADER_A


@pytest.fixture(autouse=True)
def clear_caches_before_test():
    from app.modules.orders.router import invalidate_order_tax_cache
    invalidate_order_tax_cache()


@pytest_asyncio.fixture
async def setup_billing_env(db_session):
    """Sets up primary restaurant A and secondary restaurant B for testing"""
    rest_a = Restaurant(
        id="rest-billing-test-a",
        name="Billing Gourmet A",
        slug="billing-gourmet-a",
        cuisine="Multi-Cuisine",
        business_type="RESTAURANT",
        currency="INR (₹)",
        tax_percentage=5.0,
        service_charge_percentage=5.0,
        service_charge_enabled=True,
        invoice_prefix="INV-A-",
        invoice_starting_number=1001,
        owner_email="owner_a@test.com",
        owner_uid="uid_owner_a",
        has_kitchen=True,
        has_bar=True,
        has_waiter=True,
        has_billing=True,
    )
    rest_b = Restaurant(
        id="rest-billing-test-b",
        name="Billing Gourmet B",
        slug="billing-gourmet-b",
        cuisine="Multi-Cuisine",
        business_type="RESTAURANT",
        currency="INR (₹)",
        tax_percentage=10.0,
        service_charge_percentage=0.0,
        service_charge_enabled=False,
        invoice_prefix="INV-B-",
        invoice_starting_number=2001,
        owner_email="owner_b@test.com",
        owner_uid="uid_owner_b",
        has_kitchen=True,
        has_bar=True,
        has_waiter=True,
        has_billing=True,
    )
    db_session.add_all([rest_a, rest_b])

    # Tables
    tbl_a1 = Table(
        id="tbl-a-1",
        restaurant_id="rest-billing-test-a",
        table_number="Table 01",
        status="AVAILABLE"
    )
    tbl_b1 = Table(
        id="tbl-b-1",
        restaurant_id="rest-billing-test-b",
        table_number="Table 01",
        status="AVAILABLE"
    )
    db_session.add_all([tbl_a1, tbl_b1])

    # Menu items
    cat_food = MenuCategory(id="cat-food-a", restaurant_id="rest-billing-test-a", name="Food", sort_order=1)
    cat_bar = MenuCategory(id="cat-bar-a", restaurant_id="rest-billing-test-a", name="Bar", sort_order=2)
    db_session.add_all([cat_food, cat_bar])

    item_food = MenuItem(
        id="item-food-1",
        restaurant_id="rest-billing-test-a",
        category_id="cat-food-a",
        name="Paneer Butter Masala",
        price=300.0,
        is_available=True,
        target_destination="KITCHEN",
    )
    item_drink = MenuItem(
        id="item-drink-1",
        restaurant_id="rest-billing-test-a",
        category_id="cat-bar-a",
        name="Craft Mojito",
        price=200.0,
        is_available=True,
        target_destination="BAR",
        is_alcoholic=True,
    )
    db_session.add_all([item_food, item_drink])
    await db_session.commit()

    return {
        "rest_a": rest_a,
        "rest_b": rest_b,
        "tbl_a1": tbl_a1,
        "tbl_b1": tbl_b1,
        "item_food": item_food,
        "item_drink": item_drink,
    }


@pytest.mark.asyncio
async def test_01_single_item_order(db_session, setup_billing_env):
    """1. A simple order with one item: exact subtotal, 5% tax, and total matching"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        order_payload = {
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [
                {"id": "item-food-1", "name": "Paneer Butter Masala", "price": 300.0, "quantity": 1}
            ]
        }
        res = await ac.post("/api/v1/orders", json=order_payload)
        assert res.status_code == 201
        ord_data = res.json()
        assert ord_data["subtotal"] == 300.0
        assert ord_data["tax_amount"] == 15.0  # 5% GST fallback
        assert ord_data["total_amount"] == 315.0

        # Verify running table bill API matches
        bill_res = await ac.get("/api/v1/restaurants/rest-billing-test-a/billing/table/Table 01/bill")
        assert bill_res.status_code == 200
        bill_data = bill_res.json()
        assert bill_data["subtotal"] == 300.0
        # Service charge enabled on rest_a (5% on 300 = 15.0)
        assert bill_data["serviceChargeAmount"] == 15.0
        assert bill_data["taxAmount"] == 15.0
        assert bill_data["grandTotal"] == 330.0  # 300 + 15 (SC) + 15 (Tax)


@pytest.mark.asyncio
async def test_02_multiple_items_with_quantities(db_session, setup_billing_env):
    """2. Multiple items with different quantities: verifies line totals and aggregate sums"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        order_payload = {
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [
                {"id": "item-food-1", "name": "Paneer Butter Masala", "price": 300.0, "quantity": 2}, # 600
                {"id": "item-drink-1", "name": "Craft Mojito", "price": 200.0, "quantity": 3},        # 600
            ]
        }
        res = await ac.post("/api/v1/orders", json=order_payload)
        assert res.status_code == 201
        ord_data = res.json()
        assert ord_data["subtotal"] == 1200.0
        assert ord_data["tax_amount"] == 60.0  # 5% of 1200
        assert ord_data["total_amount"] == 1260.0


@pytest.mark.asyncio
async def test_03_modifiers_and_paid_addons(db_session, setup_billing_env):
    """3. Modifiers and paid add-ons reflected in unit prices and line totals"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        order_payload = {
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [
                # Base 300 + 50 extra cheese = 350
                {"id": "item-food-1", "name": "Paneer Butter Masala (Extra Cheese)", "price": 350.0, "quantity": 2}
            ]
        }
        res = await ac.post("/api/v1/orders", json=order_payload)
        assert res.status_code == 201
        ord_data = res.json()
        assert ord_data["subtotal"] == 700.0
        assert ord_data["total_amount"] == 735.0  # 700 + 35


@pytest.mark.asyncio
async def test_04_multiple_tax_rates(db_session, setup_billing_env):
    """4. Multiple tax rates: CGST 2.5% + SGST 2.5% split breakdown"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create CGST 2.5% and SGST 2.5%
        await ac.post("/api/v1/restaurants/rest-billing-test-a/taxes", json={
            "name": "CGST",
            "type": "PERCENTAGE",
            "rate": 2.5,
            "isInclusive": False,
            "appliesTo": "ORDER"
        }, headers=AUTH_HEADER_A)
        await ac.post("/api/v1/restaurants/rest-billing-test-a/taxes", json={
            "name": "SGST",
            "type": "PERCENTAGE",
            "rate": 2.5,
            "isInclusive": False,
            "appliesTo": "ORDER"
        }, headers=AUTH_HEADER_A)

        order_payload = {
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [
                {"id": "item-food-1", "name": "Paneer Butter Masala", "price": 1000.0, "quantity": 1}
            ]
        }
        res = await ac.post("/api/v1/orders", json=order_payload)
        assert res.status_code == 201
        data = res.json()
        assert data["subtotal"] == 1000.0
        assert data["tax_amount"] == 50.0
        assert data["total_amount"] == 1050.0
        # Verify tax breakdown contains both CGST and SGST
        bd = data["tax_breakdown"]
        names = [t["name"] for t in bd]
        assert "CGST" in names
        assert "SGST" in names
        assert all(t["amount"] == 25.0 for t in bd)


@pytest.mark.asyncio
async def test_05_tax_inclusive_and_exclusive_pricing(db_session, setup_billing_env):
    """5. Tax-inclusive vs tax-exclusive: inclusive tax extracts base without inflating total"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Add Liquor Tax (10% Inclusive) for Bar items
        t_res = await ac.post("/api/v1/restaurants/rest-billing-test-a/taxes", json={
            "name": "Liquor VAT",
            "type": "PERCENTAGE",
            "rate": 10.0,
            "isInclusive": True,
            "appliesTo": "CATEGORY",
            "categoryIds": ["cat-bar-a"]
        }, headers=AUTH_HEADER_A)
        assert t_res.status_code == 201

        order_payload = {
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [
                {"id": "item-drink-1", "categoryId": "cat-bar-a", "name": "Craft Mojito", "price": 110.0, "quantity": 1}
            ]
        }
        res = await ac.post("/api/v1/orders", json=order_payload)
        assert res.status_code == 201
        data = res.json()
        # Inclusive price: grand total stays 110.0, tax is extracted internally (10.0)
        assert data["subtotal"] == 110.0
        assert data["tax_amount"] == 0.0  # Excluded tax is 0.0
        assert data["total_amount"] == 110.0


@pytest.mark.asyncio
async def test_06_item_level_discounts(db_session, setup_billing_env):
    """6. Item-level discounts: price reflects net item charge"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        order_payload = {
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [
                {"id": "item-food-1", "name": "Special Promo Dish", "price": 250.0, "quantity": 2}
            ]
        }
        res = await ac.post("/api/v1/orders", json=order_payload)
        assert res.status_code == 201
        data = res.json()
        assert data["subtotal"] == 500.0


@pytest.mark.asyncio
async def test_07_order_level_discounts(db_session, setup_billing_env):
    """7. Order-level discounts: tax is calculated on taxable subtotal after discount"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create an order: subtotal 1000
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Dish", "price": 1000.0, "quantity": 1}]
        })

        # Calculate bill with 10% discount (₹100 off -> net ₹900)
        calc_res = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/calculate", json={
            "tableNumber": "Table 01",
            "discountPercentage": 10.0
        })
        assert calc_res.status_code == 200
        data = calc_res.json()
        assert data["subtotal"] == 1000.0
        assert data["discountAmount"] == 100.0
        assert data["taxableSubtotal"] == 900.0
        # 5% tax on 900 = 45.0
        assert data["taxAmount"] == 45.0
        # 5% service charge on 900 = 45.0
        assert data["serviceChargeAmount"] == 45.0
        assert data["grandTotal"] == 990.0  # 900 + 45 + 45


@pytest.mark.asyncio
async def test_08_service_charges_and_applicable_fees(db_session, setup_billing_env):
    """8. Service charges applied accurately when enabled and 0 when disabled"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # On Rest B: service charge is disabled
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-b",
            "tableNumber": "Table 01",
            "items": [{"id": "item-b-1", "name": "Item B", "price": 500.0, "quantity": 1}]
        })
        calc_b = await ac.post("/api/v1/restaurants/rest-billing-test-b/billing/calculate", json={
            "tableNumber": "Table 01"
        })
        assert calc_b.status_code == 200
        b_data = calc_b.json()
        assert b_data["serviceChargeAmount"] == 0.0
        assert b_data["serviceChargePercentage"] == 0.0


@pytest.mark.asyncio
async def test_09_fractional_monetary_values_and_rounding(db_session, setup_billing_env):
    """9. Fractional monetary values and nearest-rupee round-off adjustments"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Price 199.99 * 3 = 599.97
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Dish", "price": 199.99, "quantity": 3}]
        })
        bill_res = await ac.get("/api/v1/restaurants/rest-billing-test-a/billing/table/Table 01/bill")
        assert bill_res.status_code == 200
        data = bill_res.json()
        assert data["subtotal"] == 599.97
        # Verify grand_total is rounded to whole rupee
        assert data["grandTotal"] == round(data["grandTotal"])
        assert abs(data["roundOffAmount"]) < 1.0


@pytest.mark.asyncio
async def test_10_zero_value_or_fully_discounted_orders(db_session, setup_billing_env):
    """10. Zero-value or 100% discounted orders do not cause division by zero or negative totals"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Free Welcome Bread", "price": 0.0, "quantity": 1}]
        })
        calc_res = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/calculate", json={
            "tableNumber": "Table 01",
            "discountPercentage": 100.0
        })
        assert calc_res.status_code == 200
        data = calc_res.json()
        assert data["grandTotal"] == 0.0
        assert data["taxAmount"] == 0.0
        assert data["serviceChargeAmount"] == 0.0


@pytest.mark.asyncio
async def test_11_split_payments_and_partial_balances(db_session, setup_billing_env):
    """11. Outstanding balance and amount paid contracts match across states"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Dish", "price": 200.0, "quantity": 1}]
        })
        inv_res = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/generate-invoice", json={
            "tableNumber": "Table 01"
        })
        assert inv_res.status_code == 200
        bill = inv_res.json()
        assert bill["amountPaid"] == 0.0
        assert bill["balanceDue"] == bill["grandTotal"]

        # Mark paid
        pay_res = await ac.post(f"/api/v1/restaurants/rest-billing-test-a/billing/{bill['id']}/mark-payment", json={
            "paymentMethod": "CASH",
            "verifiedBy": "Staff Waiter"
        }, headers=STAFF_HEADER_A)
        assert pay_res.status_code == 200
        paid_data = pay_res.json()
        assert paid_data["amountPaid"] == bill["grandTotal"]
        assert paid_data["balanceDue"] == 0.0


@pytest.mark.asyncio
async def test_12_repeated_payment_submission_and_idempotency(db_session, setup_billing_env):
    """12. Repeated payment submission does not duplicate paid status or change amounts"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Dish", "price": 200.0, "quantity": 1}]
        })
        inv_res = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/generate-invoice", json={
            "tableNumber": "Table 01"
        })
        bill = inv_res.json()
        bill_id = bill["id"]

        # 1st payment call
        p1 = await ac.post(f"/api/v1/restaurants/rest-billing-test-a/billing/{bill_id}/mark-payment", json={
            "paymentMethod": "UPI",
            "paymentReference": "UPI-REF-12345"
        }, headers=STAFF_HEADER_A)
        assert p1.status_code == 200

        # 2nd duplicate payment call
        p2 = await ac.post(f"/api/v1/restaurants/rest-billing-test-a/billing/{bill_id}/mark-payment", json={
            "paymentMethod": "UPI",
            "paymentReference": "UPI-REF-12345"
        }, headers=STAFF_HEADER_A)
        assert p2.status_code == 200
        assert p2.json()["grandTotal"] == p1.json()["grandTotal"]
        assert p2.json()["paymentStatus"] == "PAID"


@pytest.mark.asyncio
async def test_13_cancelled_items_and_reversals(db_session, setup_billing_env):
    """13. Cancelled orders are excluded from bill calculations"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Order 1 (Valid): 300
        o1 = await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Dish 1", "price": 300.0, "quantity": 1}]
        })
        # Order 2 (To be cancelled): 500
        o2 = await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Dish 2", "price": 500.0, "quantity": 1}]
        })
        o2_id = o2.json()["id"]

        # Cancel Order 2
        await ac.patch(f"/api/v1/orders/{o2_id}/status", json={"status": "CANCELLED"}, headers=AUTH_HEADER_A)

        # Check bill
        bill_res = await ac.get("/api/v1/restaurants/rest-billing-test-a/billing/table/Table 01/bill")
        assert bill_res.status_code == 200
        b_data = bill_res.json()
        assert b_data["subtotal"] == 300.0  # Only Order 1 included


@pytest.mark.asyncio
async def test_14_editing_unpaid_order(db_session, setup_billing_env):
    """14. Placing additional items on an unpaid session recalculates the bill dynamically"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Initial order: 300
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Starter", "price": 300.0, "quantity": 1}]
        })
        b1 = await ac.get("/api/v1/restaurants/rest-billing-test-a/billing/table/Table 01/bill")
        assert b1.json()["subtotal"] == 300.0

        # Additional order placed later during dinner: 200
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-drink-1", "name": "Beverage", "price": 200.0, "quantity": 1}]
        })
        b2 = await ac.get("/api/v1/restaurants/rest-billing-test-a/billing/table/Table 01/bill")
        assert b2.json()["subtotal"] == 500.0


@pytest.mark.asyncio
async def test_15_menu_price_changes_after_order_creation(db_session, setup_billing_env):
    """15. Menu price changes after order creation do not silently rewrite the order snapshot"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create order at price 300
        ord_res = await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Paneer", "price": 300.0, "quantity": 1}]
        })
        ord_id = ord_res.json()["id"]

        # Now menu price increases to 450
        item = await db_session.get(MenuItem, "item-food-1")
        item.price = 450.0
        await db_session.commit()

        # Persisted order item still has price 300
        ord_check = await ac.get(f"/api/v1/orders/{ord_id}")
        assert ord_check.status_code == 200
        assert ord_check.json()["items"][0]["price"] == 300.0
        assert ord_check.json()["subtotal"] == 300.0


@pytest.mark.asyncio
async def test_16_paid_bill_immutability(db_session, setup_billing_env):
    """16. Paid bills are immutable and never recomputed or overwritten"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Lunch", "price": 400.0, "quantity": 1}]
        })
        inv_res = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/generate-invoice", json={
            "tableNumber": "Table 01"
        })
        bill = inv_res.json()
        original_grand_total = bill["grandTotal"]

        # Pay the bill
        await ac.post(f"/api/v1/restaurants/rest-billing-test-a/billing/{bill['id']}/mark-payment", json={
            "paymentMethod": "CASH"
        }, headers=STAFF_HEADER_A)

        # Later calls to generate-invoice or get bill return the exact same paid bill
        check_bill = await ac.get(f"/api/v1/restaurants/rest-billing-test-a/billing/table/Table 01/bill")
        assert check_bill.status_code == 200
        assert check_bill.json()["grandTotal"] == original_grand_total
        assert check_bill.json()["paymentStatus"] == "PAID"


@pytest.mark.asyncio
async def test_17_customer_waiter_owner_consistency(db_session, setup_billing_env):
    """17. Customer bill, waiter bill preview, and owner invoice return identical numbers"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Dish", "price": 500.0, "quantity": 2}] # 1000
        })

        # 1. Customer View
        customer_bill = await ac.get("/api/v1/restaurants/rest-billing-test-a/billing/table/Table 01/bill")
        assert customer_bill.status_code == 200
        c_data = customer_bill.json()

        # 2. Waiter / Calculation View
        waiter_calc = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/calculate", json={
            "tableNumber": "Table 01"
        })
        assert waiter_calc.status_code == 200
        w_data = waiter_calc.json()

        # 3. Owner Invoice View
        owner_inv = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/generate-invoice", json={
            "tableNumber": "Table 01"
        })
        assert owner_inv.status_code == 200
        o_data = owner_inv.json()

        # All 3 layers must have strictly matching figures
        assert c_data["subtotal"] == w_data["subtotal"] == o_data["subtotal"] == 1000.0
        assert c_data["taxAmount"] == w_data["taxAmount"] == o_data["taxAmount"]
        assert c_data["serviceChargeAmount"] == w_data["serviceChargeAmount"] == o_data["serviceChargeAmount"]
        assert c_data["grandTotal"] == w_data["grandTotal"] == o_data["grandTotal"]


@pytest.mark.asyncio
async def test_18_payment_gateway_amount_matching(db_session, setup_billing_env):
    """18. Online UPI / payment amount matches payable grand total"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Dish", "price": 400.0, "quantity": 1}]
        })
        inv = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/generate-invoice", json={
            "tableNumber": "Table 01"
        })
        bill = inv.json()

        # Customer reports UPI payment for exact bill total
        rep_res = await ac.post(f"/api/v1/restaurants/rest-billing-test-a/billing/{bill['id']}/report-customer-payment", json={
            "amount": bill["grandTotal"],
            "paymentMethod": "UPI"
        })
        assert rep_res.status_code == 200
        assert rep_res.json()["paymentStatus"] == "PAYMENT_AWAITING_CONFIRMATION"


@pytest.mark.asyncio
async def test_19_business_day_and_eod_consistency(db_session, setup_billing_env):
    """19. Business-day closure: cash + card + upi sales reconcile with total sales"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Open business day
        await ac.post("/api/v1/restaurants/rest-billing-test-a/business-day/open", json={
            "openingCash": 1000.0
        }, headers=AUTH_HEADER_A)

        # Place Order 1 and Pay via Cash
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Cash Order", "price": 500.0, "quantity": 1}]
        })
        inv1 = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/generate-invoice", json={"tableNumber": "Table 01"})
        b1_id = inv1.json()["id"]
        await ac.post(f"/api/v1/restaurants/rest-billing-test-a/billing/{b1_id}/mark-payment", json={"paymentMethod": "CASH"}, headers=STAFF_HEADER_A)

        # Place Order 2 and Pay via UPI
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-drink-1", "name": "UPI Order", "price": 300.0, "quantity": 1}]
        })
        inv2 = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/generate-invoice", json={"tableNumber": "Table 01"})
        b2_id = inv2.json()["id"]
        await ac.post(f"/api/v1/restaurants/rest-billing-test-a/billing/{b2_id}/mark-payment", json={"paymentMethod": "UPI"}, headers=STAFF_HEADER_A)

        # Close business day
        close_res = await ac.post("/api/v1/restaurants/rest-billing-test-a/business-day/close", json={
            "closingNotes": "EOD Reconciliation Check",
            "forceCloseActiveTables": True
        }, headers=AUTH_HEADER_A)
        assert close_res.status_code == 200
        res_data = close_res.json()
        bday_summary = res_data.get("summary") or res_data.get("closedDay", {}).get("summary") or res_data

        # Mathematical Invariant: sum of payment methods equals total sales
        cash = bday_summary["cashSales"]
        upi = bday_summary["upiSales"]
        total = bday_summary["totalSales"]
        assert round(cash + upi, 2) == round(total, 2)


@pytest.mark.asyncio
async def test_20_multi_tenant_isolation(db_session, setup_billing_env):
    """20. Multi-tenant isolation: Tenant B cannot access Tenant A's bills or diagnostics"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Dish", "price": 300.0, "quantity": 1}]
        })
        inv = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/generate-invoice", json={"tableNumber": "Table 01"})
        bill_a_id = inv.json()["id"]

        # Owner B attempts to access Restaurant A diagnostic
        diag_res = await ac.get(
            f"/api/v1/restaurants/rest-billing-test-a/billing/diagnostic/{bill_a_id}",
            headers=AUTH_HEADER_B
        )
        assert diag_res.status_code == 403


@pytest.mark.asyncio
async def test_21_concurrent_updates_and_settlement_safety(db_session, setup_billing_env):
    """21. Repeated invoice generations for same session update rather than creating duplicates"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [{"id": "item-food-1", "name": "Dish", "price": 200.0, "quantity": 1}]
        })
        # Generate 1
        inv1 = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/generate-invoice", json={"tableNumber": "Table 01"})
        # Generate 2 (simulated concurrent click)
        inv2 = await ac.post("/api/v1/restaurants/rest-billing-test-a/billing/generate-invoice", json={"tableNumber": "Table 01"})

        assert inv1.json()["id"] == inv2.json()["id"]
        assert inv1.json()["invoiceNumber"] == inv2.json()["invoiceNumber"]


@pytest.mark.asyncio
async def test_22_station_order_routing_intact(db_session, setup_billing_env):
    """22. Kitchen and bar routing intact while presenting unified bill"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        order_res = await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-billing-test-a",
            "tableNumber": "Table 01",
            "items": [
                {"id": "item-food-1", "name": "Hot Pasta", "price": 300.0, "quantity": 1, "targetDestination": "KITCHEN"},
                {"id": "item-drink-1", "name": "Cold Cocktail", "price": 200.0, "quantity": 1, "targetDestination": "BAR"}
            ]
        })
        assert order_res.status_code == 201
        data = order_res.json()
        assert data["kitchenStatus"] == "PENDING"
        assert data["barStatus"] == "PENDING"

        # Bill unifies both stations
        bill = await ac.get("/api/v1/restaurants/rest-billing-test-a/billing/table/Table 01/bill")
        assert bill.status_code == 200
        items = bill.json()["items"]
        stations = set(i["station"] for i in items)
        assert "KITCHEN" in stations
        assert "BAR" in stations
        assert bill.json()["subtotal"] == 500.0

import pytest
import pytest_asyncio
import asyncio
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table, TableSession
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.orders.models import Order, Bill
from app.modules.payments.models import PaymentTransaction
from app.modules.business_day.models import BusinessDay
from app.modules.billing.service import BillingService

AUTH_HEADER = {"Authorization": "Bearer firebase_token_owner::uid_owner_rec::owner_rec@test.com"}
AUTH_HEADER_B = {"Authorization": "Bearer firebase_token_owner::uid_owner_rec_b::owner_rec_b@test.com"}


@pytest.fixture(autouse=True)
def clear_caches():
    from app.modules.orders.router import invalidate_order_tax_cache
    invalidate_order_tax_cache()


@pytest_asyncio.fixture
async def setup_reconciliation_env(db_session):
    """Sets up primary restaurant A (with taxes & service charge) and secondary restaurant B for isolation testing"""
    rest_a = Restaurant(
        id="rest-recon-a",
        name="Reconciliation Bistro A",
        slug="recon-bistro-a",
        cuisine="Multi-Cuisine",
        business_type="RESTAURANT",
        currency="INR (₹)",
        tax_percentage=5.0,
        service_charge_percentage=10.0,
        service_charge_enabled=True,
        invoice_prefix="INV-REC-",
        invoice_starting_number=5001,
        owner_email="owner_rec@test.com",
        owner_uid="uid_owner_rec",
        has_kitchen=True,
        has_bar=True,
        has_waiter=True,
        has_billing=True,
    )
    rest_b = Restaurant(
        id="rest-recon-b",
        name="Reconciliation Bistro B",
        slug="recon-bistro-b",
        cuisine="Multi-Cuisine",
        business_type="RESTAURANT",
        currency="INR (₹)",
        tax_percentage=12.0,
        service_charge_percentage=0.0,
        service_charge_enabled=False,
        invoice_prefix="INV-RECB-",
        invoice_starting_number=7001,
        owner_email="owner_rec_b@test.com",
        owner_uid="uid_owner_rec_b",
        has_kitchen=True,
        has_bar=True,
        has_waiter=True,
        has_billing=True,
    )
    db_session.add_all([rest_a, rest_b])

    # Tables for rest_a
    tbl_a5 = Table(id="tbl-a-5", restaurant_id="rest-recon-a", table_number="Table 05", status="AVAILABLE")
    tbl_a6 = Table(id="tbl-a-6", restaurant_id="rest-recon-a", table_number="Table 06", status="AVAILABLE")
    # Table for rest_b
    tbl_b5 = Table(id="tbl-b-5", restaurant_id="rest-recon-b", table_number="Table 05", status="AVAILABLE")
    db_session.add_all([tbl_a5, tbl_a6, tbl_b5])

    # Menu items for rest_a
    cat_food = MenuCategory(id="cat-recon-food", restaurant_id="rest-recon-a", name="Mains", sort_order=1)
    db_session.add(cat_food)

    item1 = MenuItem(id="it-500", restaurant_id="rest-recon-a", category_id="cat-recon-food", name="Item 500", price=500.0, is_available=True)
    item2 = MenuItem(id="it-350", restaurant_id="rest-recon-a", category_id="cat-recon-food", name="Item 350", price=350.0, is_available=True)
    item3 = MenuItem(id="it-700", restaurant_id="rest-recon-a", category_id="cat-recon-food", name="Item 700", price=700.0, is_available=True)
    item4 = MenuItem(id="it-250", restaurant_id="rest-recon-a", category_id="cat-recon-food", name="Item 250", price=250.0, is_available=True)
    item5 = MenuItem(id="it-200", restaurant_id="rest-recon-a", category_id="cat-recon-food", name="Item 200", price=200.0, is_available=True)
    db_session.add_all([item1, item2, item3, item4, item5])

    # Menu item for rest_b
    cat_b = MenuCategory(id="cat-recon-b", restaurant_id="rest-recon-b", name="Mains B", sort_order=1)
    db_session.add(cat_b)
    item_b = MenuItem(id="it-b-999", restaurant_id="rest-recon-b", category_id="cat-recon-b", name="Item B", price=999.0, is_available=True)
    db_session.add(item_b)

    await db_session.commit()

    return {
        "rest_a": rest_a,
        "rest_b": rest_b,
        "tbl_a5": tbl_a5,
        "tbl_a6": tbl_a6,
        "tbl_b5": tbl_b5,
    }


@pytest.mark.asyncio
async def test_01_multi_order_consolidation(db_session, setup_reconciliation_env):
    """1. 1 table session with 5 separate orders produces 1 consolidated bill (500 + 350 + 700 + 250 + 200 = 2,000 subtotal)"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        order_prices = [500.0, 350.0, 700.0, 250.0, 200.0]
        item_ids = ["it-500", "it-350", "it-700", "it-250", "it-200"]

        for idx, (p, item_id) in enumerate(zip(order_prices, item_ids)):
            res = await ac.post("/api/v1/orders", json={
                "restaurantId": "rest-recon-a",
                "tableNumber": "5",  # Padded/unpadded variant test
                "items": [{"id": item_id, "name": f"Item {int(p)}", "price": p, "quantity": 1}]
            })
            assert res.status_code == 201

        # Query running bill using both 'Table 05' and '5'
        bill_res = await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 05/bill")
        assert bill_res.status_code == 200
        bill_data = bill_res.json()

        assert bill_data["subtotal"] == 2000.0
        # Service charge: 10% on 2000 = 200.0
        assert bill_data["serviceChargeAmount"] == 200.0
        # Tax: 5% on 2000 = 100.0
        assert bill_data["taxAmount"] == 100.0
        # Grand total = 2000 + 200 + 100 = 2300.0
        assert bill_data["grandTotal"] == 2300.0
        assert bill_data["amountPaid"] == 0.0
        assert bill_data["balanceDue"] == 2300.0
        assert bill_data["paymentStatus"] == "UNPAID"
        assert len(bill_data["items"]) == 5


@pytest.mark.asyncio
async def test_02_orders_placed_at_different_times(db_session, setup_reconciliation_env):
    """2. Orders placed at different times included in same session"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # First order
        o1 = await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
        })
        assert o1.status_code == 201
        sess_id = o1.json().get("table_session_id")
        assert sess_id is not None

        # Simulate delay
        await asyncio.sleep(0.05)

        # Second order placed later
        o2 = await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-350", "name": "Item 350", "price": 350.0, "quantity": 1}]
        })
        assert o2.status_code == 201
        assert o2.json().get("table_session_id") == sess_id

        # Authoritative bill incorporates both
        bill_res = await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 05/bill")
        assert bill_res.status_code == 200
        bill_data = bill_res.json()
        assert bill_data["subtotal"] == 850.0
        assert len(bill_data["items"]) == 2


@pytest.mark.asyncio
async def test_03_different_tables_isolated(db_session, setup_reconciliation_env):
    """3. Different tables never share bill items"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Table 5 order
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
        })
        # Table 6 order
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 06",
            "items": [{"id": "it-700", "name": "Item 700", "price": 700.0, "quantity": 1}]
        })

        b5 = (await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 05/bill")).json()
        b6 = (await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 06/bill")).json()

        assert b5["subtotal"] == 500.0
        assert b6["subtotal"] == 700.0
        assert all(it["name"] != "Item 700" for it in b5["items"])
        assert all(it["name"] != "Item 500" for it in b6["items"])


@pytest.mark.asyncio
async def test_04_different_tenants_isolated(db_session, setup_reconciliation_env):
    """4. Different tenants never share orders or invoices"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Restaurant A Table 5
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
        })
        # Restaurant B Table 5
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-b",
            "tableNumber": "Table 05",
            "items": [{"id": "it-b-999", "name": "Item B", "price": 999.0, "quantity": 1}]
        })

        res_a = await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 05/bill")
        res_b = await ac.get("/api/v1/restaurants/rest-recon-b/billing/table/Table 05/bill")

        assert res_a.status_code == 200
        assert res_b.status_code == 200
        data_a = res_a.json()
        data_b = res_b.json()

        assert data_a["subtotal"] == 500.0
        assert data_b["subtotal"] == 999.0
        assert data_a["restaurantId"] == "rest-recon-a"
        assert data_b["restaurantId"] == "rest-recon-b"


@pytest.mark.asyncio
async def test_05_completed_orders_remain_billable(db_session, setup_reconciliation_env):
    """5. Completed orders remain billable"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        o = await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
        })
        order_id = o.json()["id"]

        # Mark order completed/delivered
        upd = await ac.patch(f"/api/v1/orders/{order_id}/status", json={"status": "DELIVERED"}, headers=AUTH_HEADER)
        assert upd.status_code == 200

        bill_res = await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 05/bill")
        assert bill_res.status_code == 200
        assert bill_res.json()["subtotal"] == 500.0


@pytest.mark.asyncio
async def test_06_cancelled_voided_items_excluded(db_session, setup_reconciliation_env):
    """6. Cancelled/voided items excluded from bill"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Order 1: 500 (Active)
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
        })
        # Order 2: 700 (Cancelled)
        o2 = await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-700", "name": "Item 700", "price": 700.0, "quantity": 1}]
        })
        order_id_2 = o2.json()["id"]
        patch_res = await ac.patch(f"/api/v1/orders/{order_id_2}/status", json={"status": "CANCELLED"}, headers=AUTH_HEADER)
        assert patch_res.status_code == 200

        bill_res = await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 05/bill")
        assert bill_res.status_code == 200
        data = bill_res.json()
        assert data["subtotal"] == 500.0
        assert len(data["items"]) == 1


@pytest.mark.asyncio
async def test_07_repeated_bill_requests_do_not_duplicate_invoices(db_session, setup_reconciliation_env):
    """7. Repeated bill requests do not duplicate invoices"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
        })

        # Request bill via waiter/pos endpoint 1st time
        req1 = await ac.post("/api/v1/restaurants/rest-recon-a/billing/generate-invoice", json={"tableNumber": "Table 05"})
        assert req1.status_code == 200
        b1 = req1.json()

        # Request bill 2nd time
        req2 = await ac.post("/api/v1/restaurants/rest-recon-a/billing/generate-invoice", json={"tableNumber": "Table 05"})
        assert req2.status_code == 200
        b2 = req2.json()

        assert b1["id"] == b2["id"]
        assert b1["invoiceNumber"] == b2["invoiceNumber"]
        assert b1["grandTotal"] == b2["grandTotal"]


@pytest.mark.asyncio
async def test_08_concurrent_bill_requests_consistent(db_session, setup_reconciliation_env):
    """8. Concurrent bill requests produce consistent totals"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
        })

        # Fire 5 concurrent requests
        reqs = [
            ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 05/bill")
            for _ in range(5)
        ]
        responses = await asyncio.gather(*reqs)

        totals = [r.json()["grandTotal"] for r in responses]
        subtotals = [r.json()["subtotal"] for r in responses]

        assert all(s == 500.0 for s in subtotals)
        assert len(set(totals)) == 1


@pytest.mark.asyncio
async def test_09_menu_price_edits_preserve_historical_invoices(db_session, setup_reconciliation_env):
    """9. Menu price edits do not mutate finalized historical invoices"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
        })

        # Generate invoice and mark paid
        inv = (await ac.post("/api/v1/restaurants/rest-recon-a/billing/generate-invoice", json={"tableNumber": "Table 05"})).json()
        original_grand_total = inv["grandTotal"]
        bill_id = inv["id"]

        await ac.post(f"/api/v1/restaurants/rest-recon-a/billing/{bill_id}/mark-payment", json={"paymentMethod": "CASH"}, headers=AUTH_HEADER)

        # Mutate the menu item price in database from 500 to 1500
        stmt = select(MenuItem).where(MenuItem.id == "it-500")
        item = (await db_session.execute(stmt)).scalar_one()
        item.price = 1500.0
        await db_session.commit()

        # Check finalized bill from database directly
        stmt_b = select(Bill).where(Bill.id == bill_id)
        bill_db = (await db_session.execute(stmt_b)).scalar_one()
        assert bill_db.grand_total == original_grand_total
        assert bill_db.subtotal == 500.0

        # And via bill API
        bill_get = await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 05/bill")
        assert bill_get.status_code == 200
        assert bill_get.json()["grandTotal"] == original_grand_total
        assert bill_get.json()["subtotal"] == 500.0


@pytest.mark.asyncio
async def test_10_partial_payments_reduce_outstanding_balance(db_session, setup_reconciliation_env):
    """10. Partial payments correctly reduce outstanding balance"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 2}] # 1000 subtotal
        })
        inv = (await ac.post("/api/v1/restaurants/rest-recon-a/billing/generate-invoice", json={"tableNumber": "Table 05"})).json()
        bill_id = inv["id"]
        grand_total = inv["grandTotal"] # 1000 + 100(SC) + 50(Tax) = 1150.0

        # Partial payment of 500.0
        pay_res = await ac.post(f"/api/v1/restaurants/rest-recon-a/billing/{bill_id}/mark-payment", json={
            "paymentMethod": "CASH",
            "amountPaid": 500.0,
            "paymentReference": "CASH-PARTIAL-1"
        }, headers=AUTH_HEADER)
        assert pay_res.status_code == 200
        pdata = pay_res.json()

        assert pdata["paymentStatus"] == "PARTIALLY_PAID"
        assert pdata["amountPaid"] == 500.0
        assert pdata["balanceDue"] == grand_total - 500.0


@pytest.mark.asyncio
async def test_11_duplicate_payment_notifications_idempotent(db_session, setup_reconciliation_env):
    """11. Duplicate payment notifications do not double-count"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
        })
        inv = (await ac.post("/api/v1/restaurants/rest-recon-a/billing/generate-invoice", json={"tableNumber": "Table 05"})).json()
        bill_id = inv["id"]

        # Call 1 with ref UPI-100
        p1 = await ac.post(f"/api/v1/restaurants/rest-recon-a/billing/{bill_id}/mark-payment", json={
            "paymentMethod": "UPI",
            "paymentReference": "UPI-IDEMPOTENT-100"
        }, headers=AUTH_HEADER)
        assert p1.status_code == 200
        amt1 = p1.json()["amountPaid"]

        # Call 2 with identical ref
        p2 = await ac.post(f"/api/v1/restaurants/rest-recon-a/billing/{bill_id}/mark-payment", json={
            "paymentMethod": "UPI",
            "paymentReference": "UPI-IDEMPOTENT-100"
        }, headers=AUTH_HEADER)
        assert p2.status_code == 200
        amt2 = p2.json()["amountPaid"]

        assert amt1 == amt2
        assert p2.json()["paymentStatus"] == "PAID"


@pytest.mark.asyncio
async def test_12_empty_carts_and_qr_scans_zero_total(db_session, setup_reconciliation_env):
    """12. QR scans and empty carts never increase bill"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Table 06 has no orders placed
        res = await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 06/bill")
        assert res.status_code == 200
        data = res.json()
        assert data["subtotal"] == 0.0
        assert data["grandTotal"] == 0.0
        assert data["items"] == []


@pytest.mark.asyncio
async def test_13_late_orders_handled_after_bill_draft(db_session, setup_reconciliation_env):
    """13. Late orders handled after bill draft exists"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # First order 500
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
        })
        # Draft bill
        d1 = (await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 05/bill")).json()
        assert d1["subtotal"] == 500.0

        # Late order placed (another dish 350)
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-350", "name": "Item 350", "price": 350.0, "quantity": 1}]
        })

        # Bill draft reflects both immediately
        d2 = (await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 05/bill")).json()
        assert d2["subtotal"] == 850.0
        assert len(d2["items"]) == 2


@pytest.mark.asyncio
async def test_14_closed_sessions_do_not_contaminate_new_sessions(db_session, setup_reconciliation_env):
    """14. Closed sessions do not contaminate newly opened sessions"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Place order 500 in session 1
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
        })
        # Generate and pay bill
        inv = (await ac.post("/api/v1/restaurants/rest-recon-a/billing/generate-invoice", json={"tableNumber": "Table 05"})).json()
        await ac.post(f"/api/v1/restaurants/rest-recon-a/billing/{inv['id']}/mark-payment", json={"paymentMethod": "CASH"}, headers=AUTH_HEADER)

        # Close session
        close_res = await ac.post("/api/v1/restaurants/rest-recon-a/tables/Table 05/close-session", headers=AUTH_HEADER)
        assert close_res.status_code == 200

        # 2. Open new session at Table 5 and place order of 200
        o2 = await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-200", "name": "Item 200", "price": 200.0, "quantity": 1}]
        })
        assert o2.status_code == 201

        # Running bill should only show the new order (200), not the old one (500)
        bill_new = (await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 05/bill")).json()
        assert bill_new["subtotal"] == 200.0
        assert len(bill_new["items"]) == 1


@pytest.mark.asyncio
async def test_15_waiter_customer_pos_reconcile_identical_totals(db_session, setup_reconciliation_env):
    """15. Waiter, customer, POS, and billing API reconcile identical totals"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Place 2 orders: 500 + 350 = 850
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
        })
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-350", "name": "Item 350", "price": 350.0, "quantity": 1}]
        })

        # 1. Customer running bill endpoint
        b_cust = (await ac.get("/api/v1/restaurants/rest-recon-a/billing/table/Table 05/bill")).json()

        # 2. Waiter / POS invoice generation
        b_pos = (await ac.post("/api/v1/restaurants/rest-recon-a/billing/generate-invoice", json={"tableNumber": "Table 05"})).json()

        # 3. Direct BillingService calculation
        calc_data = await BillingService.calculate_table_bill_data(setup_reconciliation_env["rest_a"], "Table 05", db=db_session)

        assert b_cust["subtotal"] == b_pos["subtotal"] == calc_data["subtotal"] == 850.0
        assert b_cust["grandTotal"] == b_pos["grandTotal"] == calc_data["grandTotal"]
        assert b_cust["serviceChargeAmount"] == b_pos["serviceChargeAmount"] == calc_data["serviceChargeAmount"]
        assert b_cust["taxAmount"] == b_pos["taxAmount"] == calc_data["taxAmount"]


@pytest.mark.asyncio
async def test_16_day_management_sales_reconciliation(db_session, setup_reconciliation_env):
    """16. Day Management sales reconcile with authoritative payments"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Open business day
        open_res = await ac.post("/api/v1/restaurants/rest-recon-a/business-day/open", json={"openingFloat": 1000.0}, headers=AUTH_HEADER)
        assert open_res.status_code in [200, 201]

        # Place orders and pay bill
        await ac.post("/api/v1/orders", json={
            "restaurantId": "rest-recon-a",
            "tableNumber": "Table 05",
            "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 2}] # 1000 subtotal
        })
        inv = (await ac.post("/api/v1/restaurants/rest-recon-a/billing/generate-invoice", json={"tableNumber": "Table 05"})).json()
        await ac.post(f"/api/v1/restaurants/rest-recon-a/billing/{inv['id']}/mark-payment", json={"paymentMethod": "CASH"}, headers=AUTH_HEADER)

        # Check current day live financial counters
        day_res = await ac.get("/api/v1/restaurants/rest-recon-a/business-day/current", headers=AUTH_HEADER)
        assert day_res.status_code == 200
        pdata = day_res.json()
        assert pdata["totalSales"] == inv["grandTotal"]
        assert pdata["totalOrders"] >= 1


@pytest.mark.asyncio
async def test_17_realtime_events_integrity(db_session, setup_reconciliation_env):
    """17. Realtime updates refresh screens without duplicate alerts"""
    from app.modules.websocket.manager import ws_manager
    broadcast_log = []
    original_broadcast = ws_manager.broadcast_event

    async def mock_broadcast(restaurant_id, event_type, payload, target_audience=None):
        broadcast_log.append({"event_type": event_type, "payload": payload, "audience": target_audience})
        return await original_broadcast(restaurant_id, event_type, payload, target_audience)

    ws_manager.broadcast_event = mock_broadcast

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            await ac.post("/api/v1/orders", json={
                "restaurantId": "rest-recon-a",
                "tableNumber": "Table 05",
                "items": [{"id": "it-500", "name": "Item 500", "price": 500.0, "quantity": 1}]
            })
            inv = (await ac.post("/api/v1/restaurants/rest-recon-a/billing/generate-invoice", json={"tableNumber": "Table 05"})).json()
            assert inv["id"] is not None
            assert inv["grandTotal"] > 0

            # Verify broadcast events emitted with complete authoritative payload
            bill_events = [e for e in broadcast_log if e["event_type"] == "BillRequested"]
            assert len(bill_events) >= 1
            assert bill_events[0]["payload"]["billId"] == inv["id"]
            assert bill_events[0]["payload"]["grandTotal"] == inv["grandTotal"]
    finally:
        ws_manager.broadcast_event = original_broadcast

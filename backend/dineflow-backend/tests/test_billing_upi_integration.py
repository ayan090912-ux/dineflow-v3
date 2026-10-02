import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.modules.restaurants.models import Restaurant
from app.core.database.connection import AsyncSessionLocal

@pytest.mark.asyncio
async def test_billing_and_upi_save_and_customer_fetch_pipeline():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Seed or ensure CAFE.CO exists
        rest_id = "rest-test-cafeco-101"
        owner_email = "cafe_owner@test.com"
        owner_uid = "uid_cafe_owner"
        async with AsyncSessionLocal() as db:
            rest = Restaurant(
                id=rest_id,
                name="CAFE.CO",
                slug="cafe-co-test",
                is_approved=True,
                status="OPEN",
                currency="INR (₹)",
                tax_percentage=5.0,
                owner_email=owner_email,
                owner_uid=owner_uid,
            )
            db.add(rest)
            await db.commit()

        owner_headers = {"Authorization": f"Bearer firebase_token_owner::{owner_uid}::{owner_email}"}

        # 2. Owner fetches initial billing config
        res_get_init = await ac.get(f"/api/v1/restaurants/{rest_id}/billing/config")
        assert res_get_init.status_code == 200
        init_config = res_get_init.json()
        assert init_config["restaurantId"] == rest_id
        assert init_config["name"] == "CAFE.CO"

        # 3. Owner saves UPI configuration (Screenshot 1 simulation)
        payload = {
            "legal_name": "CAFE.CO Fine Dining Private Limited",
            "state": "Maharashtra",
            "state_code": "27",
            "gstin": "27AAACB2418L1Z2",
            "pan": "AAACB2418L",
            "invoice_prefix": "INV-",
            "invoice_starting_number": 1001,
            "service_charge_percentage": 5.0,
            "service_charge_enabled": True,
            "upi_id": "7488933071@ybl",
            "upi_merchant_name": "CAFE.CO",
            "upi_qr_url": "https://storage.googleapis.com/dinely-cd6cd.appspot.com/qr/standee.png",
            "upi_enabled": True
        }
        res_put = await ac.put(f"/api/v1/restaurants/{rest_id}/billing/config", json=payload, headers=owner_headers)
        assert res_put.status_code == 200, f"PUT failed: {res_put.text}"
        saved_data = res_put.json()
        assert saved_data["status"] == "success"
        assert saved_data["config"]["upiId"] == "7488933071@ybl"
        assert saved_data["config"]["upiEnabled"] is True
        assert saved_data["config"]["upiMerchantName"] == "CAFE.CO"

        # 4. Customer on mobile device fetches billing / payment config for CAFE.CO
        res_customer_get = await ac.get(f"/api/v1/restaurants/{rest_id}/billing/config")
        assert res_customer_get.status_code == 200
        cust_config = res_customer_get.json()
        assert cust_config["upiId"] == "7488933071@ybl"
        assert cust_config["upiMerchantName"] == "CAFE.CO"
        assert cust_config["upiEnabled"] is True
        assert cust_config["upiQrUrl"] == "https://storage.googleapis.com/dinely-cd6cd.appspot.com/qr/standee.png"

        # 5. Customer fetches restaurant details directly
        res_rest_details = await ac.get(f"/api/v1/restaurants/{rest_id}")
        assert res_rest_details.status_code == 200
        rest_details = res_rest_details.json()
        assert rest_details["id"] == rest_id
        assert rest_details["name"] == "CAFE.CO"

@pytest.mark.asyncio
async def test_multi_tenant_upi_isolation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        rest_a = "rest-tenant-a"
        rest_b = "rest-tenant-b"
        owner_a_email = "owner_a@test.com"
        owner_a_uid = "uid_owner_a"
        owner_b_email = "owner_b@test.com"
        owner_b_uid = "uid_owner_b"

        async with AsyncSessionLocal() as db:
            db.add(Restaurant(id=rest_a, name="Restaurant A", slug="rest-a", is_approved=True, status="OPEN", owner_email=owner_a_email, owner_uid=owner_a_uid))
            db.add(Restaurant(id=rest_b, name="Restaurant B", slug="rest-b", is_approved=True, status="OPEN", owner_email=owner_b_email, owner_uid=owner_b_uid))
            await db.commit()

        headers_a = {"Authorization": f"Bearer firebase_token_owner::{owner_a_uid}::{owner_a_email}"}
        headers_b = {"Authorization": f"Bearer firebase_token_owner::{owner_b_uid}::{owner_b_email}"}

        # Save UPI for Restaurant A
        await ac.put(f"/api/v1/restaurants/{rest_a}/billing/config", json={
            "upi_id": "restaurantA@okhdfc",
            "upi_merchant_name": "Restaurant A",
            "upi_enabled": True
        }, headers=headers_a)

        # Save UPI for Restaurant B
        await ac.put(f"/api/v1/restaurants/{rest_b}/billing/config", json={
            "upi_id": "restaurantB@icici",
            "upi_merchant_name": "Restaurant B",
            "upi_enabled": True
        }, headers=headers_b)

        # Verify A gets ONLY A
        res_a = await ac.get(f"/api/v1/restaurants/{rest_a}/billing/config")
        assert res_a.json()["upiId"] == "restaurantA@okhdfc"

        # Verify B gets ONLY B
        res_b = await ac.get(f"/api/v1/restaurants/{rest_b}/billing/config")
        assert res_b.json()["upiId"] == "restaurantB@icici"


@pytest.mark.asyncio
async def test_order_with_items_cannot_generate_zero_invoice_regression():
    """
    REGRESSION TEST:
    Ensures an order with line items CANNOT generate an invoice with grand total ₹0.0.
    Verifies the invariant: Order total = Invoice grand total = Payment amount.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        rest_id = "rest-billing-regression-1"
        tbl_id = "tbl-reg-01"
        sess_id = "sess-reg-01-12345"

        from app.modules.tables.models import Table, TableSession
        from app.modules.orders.models import Order, OrderItem
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as db:
            db.add(Restaurant(
                id=rest_id,
                name="Regression Grill",
                slug="regression-grill",
                is_approved=True,
                status="OPEN",
                currency="INR (₹)",
                tax_percentage=0.0
            ))
            db.add(Table(
                id=tbl_id,
                restaurant_id=rest_id,
                table_number="01",
                capacity=4,
                status="OCCUPIED",
                is_occupied=True,
                active_session_id=sess_id
            ))
            db.add(TableSession(
                id=sess_id,
                restaurant_id=rest_id,
                table_id=tbl_id,
                table_number="01",
                status="ACTIVE",
                session_started_at=now
            ))
            # Seed order with 2 items totaling 770.0
            items_data = [
                {"menuItemId": "item-biryani", "name": "Chicken Biryani", "price": 340.0, "quantity": 1, "targetDestination": "KITCHEN"},
                {"menuItemId": "item-keema", "name": "Chicken Keema", "unitPrice": 430.0, "quantity": 1, "targetDestination": "BAR"}
            ]
            db.add(Order(
                id="ord-regression-770",
                restaurant_id=rest_id,
                table_id=tbl_id,
                table_number="01",
                table_session_id=sess_id,
                status="READY",
                kitchen_status="READY",
                bar_status="READY",
                subtotal=770.0,
                total_amount=770.0,
                items_json=items_data
            ))
            await db.commit()

        # 1. Calculate bill
        res_calc = await ac.post(f"/api/v1/restaurants/{rest_id}/billing/calculate", json={
            "tableId": tbl_id,
            "tableNumber": "01",
            "tableSessionId": sess_id
        })
        assert res_calc.status_code == 200, f"Calculate failed: {res_calc.text}"
        calc_data = res_calc.json()
        assert calc_data["subtotal"] == 770.0, f"Expected subtotal 770.0, got {calc_data['subtotal']}"
        assert calc_data["grandTotal"] == 770.0, f"Expected grandTotal 770.0, got {calc_data['grandTotal']}"

        # 2. Generate invoice
        res_inv = await ac.post(f"/api/v1/restaurants/{rest_id}/billing/generate-invoice", json={
            "tableId": tbl_id,
            "tableNumber": "01",
            "tableSessionId": sess_id,
            "paymentMethod": "CASH"
        })
        assert res_inv.status_code == 200, f"Generate invoice failed: {res_inv.text}"
        inv_data = res_inv.json()
        bill_id = inv_data["id"]
        inv_grand_total = float(inv_data["grandTotal"])
        assert inv_grand_total > 0.0, "FATAL: Invoice grand total cannot be 0.0 for orders with items"
        assert inv_grand_total == 770.0, f"Expected invoice 770.0, got {inv_grand_total}"

        # 3. Settle payment (authenticated staff terminal)
        login_resp = await ac.post("/api/v1/auth/terminal-login", json={
            "restaurant_id": rest_id,
            "role": "WAITER",
            "passcode": "1234"
        })
        assert login_resp.status_code == 200
        waiter_token = login_resp.json()["access_token"]
        w_headers = {"Authorization": f"Bearer {waiter_token}"}

        res_pay = await ac.post(
            f"/api/v1/restaurants/{rest_id}/billing/{bill_id}/mark-payment",
            json={
                "paymentMethod": "CASH",
                "verifiedBy": "Regression Lead",
                "amountPaid": inv_grand_total
            },
            headers=w_headers
        )
        assert res_pay.status_code == 200
        pay_data = res_pay.json()
        assert pay_data["status"] == "success"
        bill_data = pay_data["bill"]
        assert bill_data["paymentStatus"] == "PAID"
        assert float(bill_data["grandTotal"]) == 770.0

        # 4. Verify canonical invariant: Order total == Invoice grand total == Payment amount
        order_total = 770.0
        invoice_total = inv_grand_total
        payment_total = float(bill_data["grandTotal"])
        assert order_total == invoice_total == payment_total == 770.0, (
            f"Invariant violated: Order={order_total}, Invoice={invoice_total}, Payment={payment_total}"
        )


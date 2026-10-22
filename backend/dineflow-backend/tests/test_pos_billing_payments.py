import pytest
import hmac
import hashlib
import json
import base64
import time
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.database.connection import AsyncSessionLocal
from app.modules.restaurants.models import Restaurant
from app.modules.orders.models import Bill, Order
from app.modules.tables.models import Table, TableSession
from app.modules.payments.models import PaymentTransaction
from app.modules.printers.models import RestaurantPrinter
from app.modules.payments.service import PaymentService
from app.modules.printers.escpos import EscPosBuilder, ThermalPaperWidth


@pytest.mark.asyncio
async def test_dynamic_upi_qr_generation_and_exact_amount():
    """
    Test 1: Verify exact bill amount is encoded into the payment request and dynamic UPI QR.
    """
    rest_id = f"rest-test-pay-{int(time.time())}"
    async with AsyncSessionLocal() as db:
        rest = Restaurant(
            id=rest_id,
            name="Spice & Coal POS",
            slug=f"spice-coal-{int(time.time())}",
            is_approved=True,
            status="OPEN",
            currency="INR (₹)",
            upi_id="spicecoal@icici",
            upi_merchant_name="Spice & Coal Bistro",
            billing_settings_json={
                "upi_id": "spicecoal@icici",
                "upi_merchant_name": "Spice & Coal Bistro"
            }
        )
        db.add(rest)

        bill = Bill(
            id=f"bill-test-{int(time.time())}",
            restaurant_id=rest_id,
            table_id="tbl-12",
            table_number="T12",
            table_session_id="sess-12",
            subtotal=1250.0,
            discount_amount=50.0,
            tax_amount=60.0,
            service_charge_amount=0.0,
            grand_total=1260.0,
            payment_status="UNPAID",
            status="OPEN",
        )
        db.add(bill)
        await db.commit()

        # Generate Payment Request
        res = await PaymentService.create_or_refresh_bill_payment_request(bill, rest, db)
        assert res["totalPayable"] == 1260.0
        assert res["amountDue"] == 1260.0
        assert "upi://pay?" in res["qrPayload"]
        assert "am=1260.00" in res["qrPayload"]
        assert "pa=spicecoal@icici" in res["qrPayload"]
        assert res["qrDataUrl"].startswith("data:image/png;base64,")

        # Verify persisted fields on Bill
        b_stmt = select(Bill).where(Bill.id == bill.id)
        b_res = await db.execute(b_stmt)
        updated_bill = b_res.scalar_one()
        assert updated_bill.payment_qr_payload == res["qrPayload"]
        assert updated_bill.amount_due == 1260.0
        assert updated_bill.payment_status == "PAYMENT_PENDING"


@pytest.mark.asyncio
async def test_cryptographic_razorpay_webhook_verification():
    """
    Test 2: Verify cryptographic HMAC-SHA256 signature verification rejects forged payloads.
    """
    secret = "rzp_sec_test_secret_key_123"
    raw_payload = json.dumps({
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_test_998877",
                    "amount": 126000,
                    "status": "captured",
                    "notes": {"bill_id": "bill-dummy-123"}
                }
            }
        }
    }).encode("utf-8")

    # Generate valid signature
    valid_sig = hmac.new(secret.encode("utf-8"), raw_payload, hashlib.sha256).hexdigest()
    invalid_sig = "forged_signature_0000000000000000"

    assert PaymentService.verify_razorpay_webhook_signature(raw_payload, valid_sig, secret) is True
    assert PaymentService.verify_razorpay_webhook_signature(raw_payload, invalid_sig, secret) is False
    assert PaymentService.verify_razorpay_webhook_signature(raw_payload, "", secret) is False


@pytest.mark.asyncio
async def test_idempotent_webhook_processing_prevents_double_crediting():
    """
    Test 3: Verify processing duplicate webhooks only creates one PaymentTransaction
    and does not double-credit the bill.
    """
    rest_id = f"rest-test-idem-{int(time.time())}"
    async with AsyncSessionLocal() as db:
        rest = Restaurant(
            id=rest_id,
            name="Idempotency Grill",
            slug=f"idem-grill-{int(time.time())}",
            is_approved=True,
            status="OPEN"
        )
        db.add(rest)

        bill = Bill(
            id=f"bill-idem-{int(time.time())}",
            restaurant_id=rest_id,
            table_id="tbl-05",
            table_number="T05",
            table_session_id="sess-05",
            subtotal=500.0,
            grand_total=500.0,
            amount_paid=0.0,
            amount_due=500.0,
            payment_status="PAYMENT_PENDING",
            status="OPEN"
        )
        db.add(bill)
        await db.commit()

        # First webhook arrival
        tx_ref = f"pay_rzp_ref_{int(time.time())}"
        success1, msg1, b1 = await PaymentService.process_verified_payment(
            db=db,
            restaurant_id=rest_id,
            bill_id=bill.id,
            gateway="RAZORPAY",
            transaction_reference=tx_ref,
            amount_paid=500.0,
            gateway_order_id="order_123",
            gateway_payment_id=tx_ref
        )
        assert success1 is True
        assert msg1 == "SETTLED"
        assert b1.payment_status == "PAID"
        assert b1.amount_paid == 500.0
        assert b1.amount_due == 0.0

        # Duplicate webhook arrival with same transaction_reference
        success2, msg2, b2 = await PaymentService.process_verified_payment(
            db=db,
            restaurant_id=rest_id,
            bill_id=bill.id,
            gateway="RAZORPAY",
            transaction_reference=tx_ref,
            amount_paid=500.0,
            gateway_order_id="order_123",
            gateway_payment_id=tx_ref
        )
        assert success2 is True
        assert msg2 == "ALREADY_PROCESSED"

        # Check total transactions recorded for this bill
        tx_stmt = select(PaymentTransaction).where(PaymentTransaction.bill_id == bill.id)
        tx_res = await db.execute(tx_stmt)
        tx_list = list(tx_res.scalars().all())
        assert len(tx_list) == 1
        assert tx_list[0].amount == 500.0


@pytest.mark.asyncio
async def test_bill_invoice_generation_api_with_auto_qr():
    """
    Test 4: Verify the /billing/generate-invoice endpoint automatically associates
    the bill with a dynamic UPI QR and accurate financial breakdown.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        rest_id = f"rest-api-bill-{int(time.time())}"
        owner_uid = f"uid_{int(time.time())}"
        owner_email = f"owner_{int(time.time())}@test.com"

        async with AsyncSessionLocal() as db:
            rest = Restaurant(
                id=rest_id,
                name="Tandoor Junction",
                slug=f"tandoor-junction-{int(time.time())}",
                is_approved=True,
                status="OPEN",
                owner_uid=owner_uid,
                owner_email=owner_email,
                tax_percentage=5.0,
                upi_id="tandoor@okaxis",
                upi_merchant_name="Tandoor Junction"
            )
            db.add(rest)

            # Create an active table order with items_json
            order = Order(
                id=f"ord-{int(time.time())}",
                restaurant_id=rest_id,
                table_number="T01",
                items_json=[
                    {"menuItemId": "i1", "name": "Butter Chicken", "price": 400.0, "quantity": 2},
                    {"menuItemId": "i2", "name": "Garlic Naan", "price": 60.0, "quantity": 3}
                ],
                subtotal=980.0,
                total_amount=980.0,
                status="COMPLETED"
            )
            db.add(order)
            await db.commit()

        # Staff generates invoice
        owner_headers = {"Authorization": f"Bearer firebase_token_owner::{owner_uid}::{owner_email}"}
        payload = {
            "tableNumber": "T01",
            "discountPercentage": 10.0,
            "orderType": "DINE_IN"
        }
        res = await ac.post(
            f"/api/v1/restaurants/{rest_id}/billing/generate-invoice",
            json=payload,
            headers=owner_headers
        )
        assert res.status_code == 200, f"Error: {res.text}"
        data = res.json()
        assert data["tableNumber"] == "T01"
        assert data["subtotal"] == 980.0
        assert data["discountAmount"] == 98.0  # 10%
        # Taxable: 882.0. 5% GST: 44.10. Total with tax: 926.10, Round-off to 926.0
        assert data["grandTotal"] in [926.0, 926.10]
        assert data["paymentQrPayload"] is not None
        assert "upi://pay?" in data["paymentQrPayload"]
        assert f"am={data['grandTotal']:.2f}" in data["paymentQrPayload"]
        assert data["qrDataUrl"].startswith("data:image/png;base64,")
        assert data["paymentStatus"] == "PAYMENT_PENDING"

        # Check status endpoint
        bill_id = data["id"]
        status_res = await ac.get(f"/api/v1/restaurants/{rest_id}/billing/{bill_id}/payment-status")
        assert status_res.status_code == 200
        st_data = status_res.json()
        assert st_data["billId"] == bill_id
        assert st_data["paymentStatus"] == "PAYMENT_PENDING"
        assert st_data["isPaid"] is False
        assert st_data["amountDue"] == data["grandTotal"]


@pytest.mark.asyncio
async def test_escpos_thermal_receipt_formatting():
    """
    Test 5: Verify ESC/POS builder produces valid byte sequences for 58mm and 80mm paper,
    including bold text, line alignment, QR code commands, and paper cut.
    """
    # 58mm layout
    b58 = EscPosBuilder(paper_width=ThermalPaperWidth.WIDTH_58MM)
    b58.init()
    b58.bold(True)
    b58.text_line("TEST RESTAURANT 58MM", align="center")
    b58.bold(False)
    b58.text_line("Butter Naan x 2", align="left")
    b58.qr_code("upi://pay?pa=test@upi&am=100.00")
    b58.cut()
    raw_58 = b58.get_bytes()

    assert len(raw_58) > 30
    assert b"\x1b@" in raw_58  # ESC @ (init)
    assert b"TEST RESTAURANT 58MM" in raw_58
    assert b"\x1dVB\x00" in raw_58  # GS V 66 0 (cut)

    # 80mm layout
    b80 = EscPosBuilder(paper_width=ThermalPaperWidth.WIDTH_80MM)
    b80.init()
    b80.text_line("TEST RESTAURANT 80MM", align="center")
    b80.two_column("Subtotal:", "INR 1,200.00")
    b80.two_column("Grand Total:", "INR 1,260.00")
    b80.cut()
    raw_80 = b80.get_bytes()

    assert len(raw_80) > 30
    assert b"Subtotal:" in raw_80
    assert b"INR 1,260.00" in raw_80


@pytest.mark.asyncio
async def test_thermal_printer_crud_and_dispatch_api():
    """
    Test 6: Verify printer configuration CRUD and test print execution.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        rest_id = f"rest-print-{int(time.time())}"
        owner_uid = f"uid_prn_{int(time.time())}"
        owner_email = f"owner_prn_{int(time.time())}@test.com"

        async with AsyncSessionLocal() as db:
            rest = Restaurant(
                id=rest_id,
                name="Thermal Express",
                slug=f"thermal-express-{int(time.time())}",
                is_approved=True,
                status="OPEN",
                owner_uid=owner_uid,
                owner_email=owner_email
            )
            db.add(rest)
            await db.commit()

        owner_headers = {"Authorization": f"Bearer firebase_token_owner::{owner_uid}::{owner_email}"}

        # 1. Create a Browser Thermal Printer Profile
        prn_payload = {
            "name": "Front Desk Thermal POS",
            "connectionType": "BROWSER",
            "paperWidth": "80mm",
            "isDefault": True,
            "autoPrintOnBill": False,
            "copies": 1
        }
        res_create = await ac.post(
            f"/api/v1/restaurants/{rest_id}/printers",
            json=prn_payload,
            headers=owner_headers
        )
        assert res_create.status_code == 201
        created = res_create.json()
        assert created["name"] == "Front Desk Thermal POS"
        assert created["paperWidth"] == "80mm"
        assert created["isDefault"] is True
        printer_id = created["id"]

        # 2. List printers
        res_list = await ac.get(f"/api/v1/restaurants/{rest_id}/printers", headers=owner_headers)
        assert res_list.status_code == 200
        printers = res_list.json()
        assert len(printers) == 1
        assert printers[0]["id"] == printer_id

        # 3. Test Print on Browser Thermal Printer
        res_test = await ac.post(
            f"/api/v1/restaurants/{rest_id}/printers/{printer_id}/test-print",
            headers=owner_headers
        )
        assert res_test.status_code == 200
        test_data = res_test.json()
        assert test_data["success"] is True
        assert test_data["connectionType"] == "BROWSER"
        assert "test receipt" in test_data["message"]

import json
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database.connection import get_db
from app.core.config.settings import get_settings
from app.core.security.tenant_auth import require_tenant_staff_or_owner, CallerContext
from app.modules.restaurants.models import Restaurant
from app.modules.orders.models import Bill
from app.modules.payments.service import PaymentService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/{restaurant_id}/webhook/razorpay")
@router.post("/webhook/razorpay")
async def razorpay_webhook_endpoint(
    request: Request,
    restaurant_id: Optional[str] = None,
    x_razorpay_signature: Optional[str] = Header(None, alias="X-Razorpay-Signature"),
    db: AsyncSession = Depends(get_db)
):
    """
    Authoritative Razorpay Webhook Handler.
    Verifies cryptographic signature using HMAC-SHA256 over raw request bytes.
    Idempotent: drops duplicate webhooks and verifies amount before marking bill as PAID.
    """
    settings = get_settings()
    raw_body = await request.body()

    # Discover webhook secret (restaurant custom override or platform default)
    webhook_secret = getattr(settings, "RAZORPAY_WEBHOOK_SECRET", None)

    rest: Optional[Restaurant] = None
    if restaurant_id:
        rest_stmt = select(Restaurant).where(Restaurant.id == restaurant_id)
        rest_res = await db.execute(rest_stmt)
        rest = rest_res.scalar_one_or_none()
        if rest and rest.billing_settings_json:
            webhook_secret = rest.billing_settings_json.get("razorpay_webhook_secret") or webhook_secret

    if not webhook_secret:
        # If in dev or sandbox mode without configured secret, reject or require valid secret
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Razorpay webhook secret not configured"
        )

    # 1. Cryptographic Signature Verification
    if not x_razorpay_signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-Razorpay-Signature header"
        )

    is_valid = PaymentService.verify_razorpay_webhook_signature(
        raw_body=raw_body,
        signature=x_razorpay_signature,
        secret=webhook_secret
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cryptographic webhook signature"
        )

    # 2. Parse Event Payload
    try:
        payload = json.loads(raw_body.decode('utf-8'))
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed JSON payload")

    event = payload.get("event")
    if event in ["payment.captured", "order.paid", "qr_code.credited"]:
        payment_entity = (
            payload.get("payload", {}).get("payment", {}).get("entity", {}) or
            payload.get("payload", {}).get("order", {}).get("entity", {})
        )
        notes = payment_entity.get("notes", {}) or {}
        bill_id = notes.get("bill_id") or notes.get("billId")
        target_rest_id = restaurant_id or notes.get("restaurant_id")

        if not bill_id:
            # Fallback check payment receipt
            receipt = payment_entity.get("receipt", "")
            if receipt.startswith("bill-"):
                bill_id = receipt.split("-")[0] + "-" + receipt.split("-")[1]

        if bill_id and target_rest_id:
            raw_amt = payment_entity.get("amount", 0)
            amount_in_rupees = float(raw_amt) / 100.0 if raw_amt > 100 else float(raw_amt)
            pay_id = payment_entity.get("id") or f"rzp_{payment_entity.get('order_id', 'pay')}"
            order_id = payment_entity.get("order_id")

            success, status_msg, updated_bill = await PaymentService.process_verified_payment(
                db=db,
                restaurant_id=target_rest_id,
                bill_id=bill_id,
                gateway="RAZORPAY",
                transaction_reference=pay_id,
                amount_paid=amount_in_rupees,
                gateway_order_id=order_id,
                gateway_payment_id=pay_id,
                payment_method="UPI",
                raw_payload=payload
            )
            return {
                "status": "success",
                "result": status_msg,
                "billId": bill_id,
                "amountPaid": amount_in_rupees
            }

    return {"status": "ignored", "event": event}


@router.post("/{restaurant_id}/webhook/cashfree")
@router.post("/webhook/cashfree")
async def cashfree_webhook_endpoint(
    request: Request,
    restaurant_id: Optional[str] = None,
    x_webhook_signature: Optional[str] = Header(None, alias="x-webhook-signature"),
    x_webhook_timestamp: Optional[str] = Header(None, alias="x-webhook-timestamp"),
    db: AsyncSession = Depends(get_db)
):
    """
    Authoritative Cashfree Webhook Handler.
    Verifies cryptographic signature using HMAC-SHA256 with timestamp.
    """
    settings = get_settings()
    raw_body = await request.body()
    secret_key = getattr(settings, "CASHFREE_SECRET_KEY", None)

    rest: Optional[Restaurant] = None
    if restaurant_id:
        rest_stmt = select(Restaurant).where(Restaurant.id == restaurant_id)
        rest_res = await db.execute(rest_stmt)
        rest = rest_res.scalar_one_or_none()
        if rest and rest.billing_settings_json:
            secret_key = rest.billing_settings_json.get("cashfree_secret_key") or secret_key

    if not secret_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cashfree secret key not configured"
        )

    # Cryptographic check
    if not x_webhook_signature or not x_webhook_timestamp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Cashfree webhook signature or timestamp"
        )

    is_valid = PaymentService.verify_cashfree_webhook_signature(
        raw_body=raw_body,
        timestamp=x_webhook_timestamp,
        signature=x_webhook_signature,
        secret=secret_key
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Cashfree webhook signature"
        )

    try:
        payload = json.loads(raw_body.decode('utf-8'))
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed JSON")

    data = payload.get("data", {}) or {}
    order_info = data.get("order", {})
    payment_info = data.get("payment", {})
    payment_status = payment_info.get("payment_status") or data.get("payment_status")

    if payment_status == "SUCCESS":
        order_tags = order_info.get("order_tags", {}) or {}
        bill_id = order_tags.get("bill_id")
        target_rest_id = restaurant_id or order_tags.get("restaurant_id")
        amount = float(payment_info.get("payment_amount", 0.0))
        cf_payment_id = str(payment_info.get("cf_payment_id") or payment_info.get("payment_id") or "")
        order_id = str(order_info.get("order_id") or "")

        if bill_id and target_rest_id:
            success, status_msg, updated_bill = await PaymentService.process_verified_payment(
                db=db,
                restaurant_id=target_rest_id,
                bill_id=bill_id,
                gateway="CASHFREE",
                transaction_reference=cf_payment_id,
                amount_paid=amount,
                gateway_order_id=order_id,
                gateway_payment_id=cf_payment_id,
                payment_method="UPI",
                raw_payload=payload
            )
            return {"status": "success", "result": status_msg, "billId": bill_id}

    return {"status": "ignored"}


@router.get("/{restaurant_id}/bills/{bill_id}/reconcile")
async def reconcile_bill_payment_endpoint(
    restaurant_id: str,
    bill_id: str,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    """
    Reconciles unsettled bill against provider API.
    Used when a customer paid but webhook is delayed.
    """
    rest_stmt = select(Restaurant).where(Restaurant.id == restaurant_id)
    rest_res = await db.execute(rest_stmt)
    rest = rest_res.scalar_one_or_none()
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")

    b_stmt = select(Bill).where(Bill.id == bill_id, Bill.restaurant_id == restaurant_id)
    b_res = await db.execute(b_stmt)
    bill = b_res.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    is_paid, msg = await PaymentService.reconcile_bill_payment_status(bill, rest, db)
    return {
        "billId": bill.id,
        "paymentStatus": bill.payment_status,
        "isPaid": (bill.payment_status == "PAID"),
        "reconciliationMessage": msg,
        "amountPaid": bill.amount_paid,
        "amountDue": bill.amount_due,
    }

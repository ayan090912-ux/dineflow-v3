import uuid
from typing import Optional, List, Any, Dict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body, Request, Header
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, or_

from app.core.database.connection import get_db
from app.core.security.tenant_auth import require_tenant_owner_or_admin, require_tenant_staff_or_owner, CallerContext
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table, TableSession
from app.modules.orders.models import Order, Bill
from app.modules.taxes.models import Tax, TaxCategory, TaxMenuItem, InvoiceTaxSnapshot
from app.modules.taxes.calculation import calculate_taxes
from app.modules.billing.service import BillingService, get_table_variants
from app.modules.websocket.manager import ws_manager

router = APIRouter()

# Session-scoped billing router (mounted at /api/v1 to expose /billing/sessions/{session_id}/bill)
session_bill_router = APIRouter()

# ----------------- SCHEMAS -----------------

class BillingConfigUpdateSchema(BaseModel):
    legal_name: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    invoice_prefix: Optional[str] = "INV-"
    invoice_starting_number: Optional[float] = 1001
    service_charge_percentage: Optional[float] = 0.0
    service_charge_enabled: Optional[bool] = False
    upi_id: Optional[str] = None
    upi_merchant_name: Optional[str] = None
    upi_qr_url: Optional[str] = None
    upi_enabled: Optional[bool] = True
    billing_settings_json: Optional[Dict[str, Any]] = None

class CalculateBillInputSchema(BaseModel):
    tableId: Optional[str] = None
    tableNumber: str
    tableSessionId: Optional[str] = None
    discountPercentage: Optional[float] = 0.0
    discountAmount: Optional[float] = 0.0
    serviceChargePercentage: Optional[float] = None
    orderType: Optional[str] = "DINE_IN"

class GenerateInvoiceInputSchema(BaseModel):
    tableId: Optional[str] = None
    tableNumber: str
    tableSessionId: Optional[str] = None
    discountPercentage: Optional[float] = 0.0
    discountAmount: Optional[float] = 0.0
    serviceChargePercentage: Optional[float] = None
    paymentMethod: Optional[str] = None
    orderType: Optional[str] = "DINE_IN"

class MarkPaymentSchema(BaseModel):
    paymentMethod: Optional[str] = "CASH"  # CASH | CARD | UPI | QR_CODE | OTHER
    payment_method: Optional[str] = None
    verifiedBy: Optional[str] = "Staff"
    verified_by: Optional[str] = None
    paymentReference: Optional[str] = None
    payment_reference: Optional[str] = None
    amountPaid: Optional[float] = None
    amount_paid: Optional[float] = None

class QrUploadSchema(BaseModel):
    qrDataUrl: str
    merchantName: Optional[str] = None
    upiId: Optional[str] = None

class BillSessionRequestSchema(BaseModel):
    restaurantId: Optional[str] = None
    tableId: Optional[str] = None
    tableNumber: Optional[str] = None
    paymentMethod: Optional[str] = "CASH"
    discountPercentage: Optional[float] = 0.0
    discountAmount: Optional[float] = 0.0
    serviceChargePercentage: Optional[float] = None
    orderType: Optional[str] = "DINE_IN"

# ----------------- HELPERS -----------------

async def find_restaurant_by_identifier(restaurant_id: str, db: AsyncSession) -> Optional[Restaurant]:
    clean_id = (restaurant_id or "").strip()
    if not clean_id:
        return None

    # Strict multi-tenancy: Only resolve by exact restaurant ID or exact slug/public_slug
    stmt = select(Restaurant).where(
        Restaurant.deleted_at.is_(None),
        or_(
            Restaurant.id == clean_id,
            func.lower(Restaurant.id) == clean_id.lower(),
            Restaurant.slug == clean_id.lower(),
            Restaurant.public_slug == clean_id.lower()
        )
    ).limit(1)
    res = await db.execute(stmt)
    rest = res.scalar_one_or_none()
    if rest:
        return rest

    # Strict zero fallback: NEVER return default, earliest, or first restaurant
    return None

def format_bill_response(bill: Bill) -> dict:
    created_at_val = None
    if getattr(bill, "created_at", None):
        try:
            created_at_val = bill.created_at.isoformat()
        except Exception:
            created_at_val = str(bill.created_at)

    updated_at_val = None
    if getattr(bill, "updated_at", None):
        try:
            updated_at_val = bill.updated_at.isoformat()
        except Exception:
            updated_at_val = str(bill.updated_at)

    amount_paid_val = float(getattr(bill, "amount_paid", 0.0) or (bill.grand_total if bill.payment_status == "PAID" else 0.0))
    balance_due_val = 0.0 if bill.payment_status == "PAID" else float(getattr(bill, "amount_due", 0.0) or max(0.0, bill.grand_total - amount_paid_val))
    taxable_subtotal_val = max(0.0, round(float(bill.subtotal or 0.0) - float(bill.discount_amount or 0.0), 2))

    qr_payload = getattr(bill, "payment_qr_payload", None)
    qr_data_url = None
    if qr_payload:
        from app.modules.payments.service import PaymentService
        try:
            qr_data_url = PaymentService.generate_qr_data_url(qr_payload)
        except Exception:
            pass

    return {
        "id": bill.id,
        "restaurantId": bill.restaurant_id,
        "restaurant_id": bill.restaurant_id,
        "tableId": bill.table_id,
        "table_id": bill.table_id,
        "tableNumber": bill.table_number,
        "table_number": bill.table_number,
        "tableSessionId": bill.table_session_id,
        "table_session_id": bill.table_session_id,
        "invoiceNumber": bill.invoice_number or bill.id,
        "invoice_number": bill.invoice_number or bill.id,
        "subtotal": bill.subtotal,
        "discountAmount": bill.discount_amount,
        "discount_amount": bill.discount_amount,
        "discountPercentage": bill.discount_percentage,
        "discount_percentage": bill.discount_percentage,
        "taxableSubtotal": taxable_subtotal_val,
        "taxable_subtotal": taxable_subtotal_val,
        "serviceChargeAmount": bill.service_charge_amount,
        "service_charge_amount": bill.service_charge_amount,
        "serviceChargePercentage": bill.service_charge_percentage,
        "service_charge_percentage": bill.service_charge_percentage,
        "taxPercentage": bill.tax_percentage,
        "tax_percentage": bill.tax_percentage,
        "taxAmount": bill.tax_amount,
        "tax_amount": bill.tax_amount,
        "roundOffAmount": bill.round_off_amount,
        "round_off_amount": bill.round_off_amount,
        "grandTotal": bill.grand_total,
        "grand_total": bill.grand_total,
        "amountPaid": amount_paid_val,
        "amount_paid": amount_paid_val,
        "balanceDue": balance_due_val,
        "balance_due": balance_due_val,
        "status": bill.status,
        "paymentStatus": bill.payment_status,
        "payment_status": bill.payment_status,
        "paymentMethod": bill.payment_method,
        "payment_method": bill.payment_method,
        "paymentVerifiedBy": bill.payment_verified_by,
        "payment_verified_by": bill.payment_verified_by,
        "paymentReference": bill.payment_reference,
        "payment_reference": bill.payment_reference,
        "paymentGateway": getattr(bill, "payment_gateway", None),
        "gatewayOrderId": getattr(bill, "gateway_order_id", None),
        "gatewayPaymentId": getattr(bill, "gateway_payment_id", None),
        "gatewayQrId": getattr(bill, "gateway_qr_id", None),
        "paymentQrPayload": qr_payload,
        "qrDataUrl": qr_data_url,
        "paymentInitiatedAt": bill.payment_initiated_at.isoformat() if getattr(bill, "payment_initiated_at", None) else None,
        "paymentExpiresAt": bill.payment_expires_at.isoformat() if getattr(bill, "payment_expires_at", None) else None,
        "printCount": getattr(bill, "print_count", 0) or 0,
        "lastPrintedAt": bill.last_printed_at.isoformat() if getattr(bill, "last_printed_at", None) else None,
        "printerId": getattr(bill, "printer_id", None),
        "taxBreakdown": bill.tax_breakdown_json or [],
        "tax_breakdown": bill.tax_breakdown_json or [],
        "tax_breakdown_json": bill.tax_breakdown_json or [],
        "items": bill.items_snapshot_json or [],
        "items_snapshot_json": bill.items_snapshot_json or [],
        "orders": bill.orders_snapshot_json or [],
        "orders_snapshot_json": bill.orders_snapshot_json or [],
        "businessDayId": getattr(bill, "business_day_id", None),
        "business_day_id": getattr(bill, "business_day_id", None),
        "paidAt": bill.paid_at.isoformat() if getattr(bill, "paid_at", None) else None,
        "paid_at": bill.paid_at.isoformat() if getattr(bill, "paid_at", None) else None,
        "createdAt": created_at_val,
        "created_at": created_at_val,
        "updatedAt": updated_at_val,
        "updated_at": updated_at_val,
    }


# ----------------- BILLING CONFIGURATION ENDPOINTS -----------------

@router.get("/{restaurant_id}/billing/config")
async def get_restaurant_billing_config(
    restaurant_id: str,
    db: AsyncSession = Depends(get_db)
):
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    return {
        "restaurantId": rest.id,
        "name": rest.name,
        "legalName": rest.legal_name or rest.name,
        "state": rest.state or "",
        "stateCode": rest.state_code or "",
        "gstin": rest.gstin or "",
        "pan": rest.pan or "",
        "address": rest.address or "",
        "phone": rest.phone or "",
        "email": rest.email or "",
        "currency": rest.currency or "INR (₹)",
        "invoicePrefix": rest.invoice_prefix or "INV-",
        "invoiceStartingNumber": int(rest.invoice_starting_number or 1001),
        "serviceChargePercentage": rest.service_charge_percentage or 0.0,
        "serviceChargeEnabled": rest.service_charge_enabled or False,
        "upiId": rest.upi_id or "",
        "upiMerchantName": rest.upi_merchant_name or rest.name,
        "upiQrUrl": rest.upi_qr_url or "",
        "upiEnabled": rest.upi_enabled if rest.upi_enabled is not None else True,
        "billingSettings": rest.billing_settings_json or {},
    }

@router.put("/{restaurant_id}/billing/config")
async def update_restaurant_billing_config(
    restaurant_id: str,
    config: BillingConfigUpdateSchema,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    if config.legal_name is not None:
        rest.legal_name = config.legal_name.strip()
    if config.state is not None:
        rest.state = config.state.strip()
    if config.state_code is not None:
        rest.state_code = config.state_code.strip()
    if config.gstin is not None:
        rest.gstin = config.gstin.strip().upper()
    if config.pan is not None:
        rest.pan = config.pan.strip().upper()
    if config.invoice_prefix is not None:
        rest.invoice_prefix = config.invoice_prefix.strip().upper()
    if config.invoice_starting_number is not None:
        rest.invoice_starting_number = float(config.invoice_starting_number)
    if config.service_charge_percentage is not None:
        rest.service_charge_percentage = max(0.0, float(config.service_charge_percentage))
    if config.service_charge_enabled is not None:
        rest.service_charge_enabled = bool(config.service_charge_enabled)
    if config.upi_id is not None:
        rest.upi_id = config.upi_id.strip()
    if config.upi_merchant_name is not None:
        rest.upi_merchant_name = config.upi_merchant_name.strip()
    if config.upi_qr_url is not None:
        rest.upi_qr_url = config.upi_qr_url.strip()
    if config.upi_enabled is not None:
        rest.upi_enabled = bool(config.upi_enabled)
    if config.billing_settings_json is not None:
        rest.billing_settings_json = config.billing_settings_json

    await db.commit()
    await db.refresh(rest)

    # Broadcast updated configuration event to live terminals
    try:
        await ws_manager.broadcast_event(
            restaurant_id=rest.id,
            event_type="BillingConfigUpdated",
            payload={
                "restaurantId": rest.id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception:
        pass

    return {
        "status": "success",
        "message": "Billing and payment configuration updated successfully",
        "config": {
            "restaurantId": rest.id,
            "legalName": rest.legal_name,
            "state": rest.state,
            "stateCode": rest.state_code,
            "gstin": rest.gstin,
            "pan": rest.pan,
            "invoicePrefix": rest.invoice_prefix,
            "invoiceStartingNumber": int(rest.invoice_starting_number or 1001),
            "serviceChargePercentage": rest.service_charge_percentage,
            "serviceChargeEnabled": rest.service_charge_enabled,
            "upiId": rest.upi_id,
            "upiMerchantName": rest.upi_merchant_name,
            "upiQrUrl": rest.upi_qr_url,
            "upiEnabled": rest.upi_enabled,
        }
    }

@router.post("/{restaurant_id}/billing/qr-upload")
async def upload_restaurant_upi_qr(
    restaurant_id: str,
    payload: QrUploadSchema,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    if not payload.qrDataUrl:
        raise HTTPException(status_code=400, detail="QR image data is required")

    rest.upi_qr_url = payload.qrDataUrl
    if payload.merchantName:
        rest.upi_merchant_name = payload.merchantName
    if payload.upiId:
        rest.upi_id = payload.upiId
    rest.upi_enabled = True

    await db.commit()
    await db.refresh(rest)

    # Broadcast updated configuration event to live terminals
    try:
        await ws_manager.broadcast_event(
            restaurant_id=rest.id,
            event_type="BillingConfigUpdated",
            payload={
                "restaurantId": rest.id,
                "upiQrUrl": rest.upi_qr_url,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception:
        pass

    return {
        "status": "success",
        "message": "UPI QR code uploaded and verified successfully",
        "upiQrUrl": rest.upi_qr_url,
        "upiId": rest.upi_id,
        "upiMerchantName": rest.upi_merchant_name,
    }


# ----------------- BILL CALCULATION & INVOICE ENDPOINTS -----------------

@router.post("/{restaurant_id}/billing/calculate")
async def calculate_table_bill(
    restaurant_id: str,
    input_data: CalculateBillInputSchema,
    db: AsyncSession = Depends(get_db)
):
    """
    Authoritative bill calculation endpoint.
    Calculates subtotal, discounts, service charges, taxes, round-off, and grand total.
    """
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    return await BillingService.calculate_table_bill_data(
        rest=rest,
        table_number=input_data.tableNumber,
        table_session_id=input_data.tableSessionId,
        table_id=input_data.tableId,
        discount_percentage=input_data.discountPercentage or 0.0,
        discount_amount=input_data.discountAmount or 0.0,
        service_charge_percentage=input_data.serviceChargePercentage,
        order_type=input_data.orderType or "DINE_IN",
        db=db
    )


@router.get("/{restaurant_id}/billing/table/{table_number}/bill")
@router.get("/{restaurant_id}/billing/tables/{table_number}/running-bill")
async def get_running_table_bill(
    restaurant_id: str,
    table_number: str,
    session_id: Optional[str] = Query(None, alias="sessionId"),
    table_session_id: Optional[str] = Query(None, alias="tableSessionId"),
    db: AsyncSession = Depends(get_db)
):
    """
    Authoritative running bill endpoint for a table.
    Enables Customer Bill Modal, Waiter POS, and Checkout to display identical, verified totals.
    """
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    effective_sess_id = session_id or table_session_id or None
    tbl_num = (table_number or "").strip()
    t_candidates = get_table_variants(tbl_num)

    # 1. Resolve active TableSession if not explicitly provided
    active_sess = None
    if effective_sess_id:
        s_stmt = select(TableSession).where(TableSession.id == effective_sess_id)
        s_res = await db.execute(s_stmt)
        active_sess = s_res.scalar_one_or_none()

    if not active_sess and t_candidates:
        s_stmt = select(TableSession).where(
            TableSession.restaurant_id == rest.id,
            TableSession.table_number.in_(t_candidates),
            TableSession.status == "ACTIVE"
        ).order_by(TableSession.session_started_at.desc()).limit(1)
        s_res = await db.execute(s_stmt)
        active_sess = s_res.scalar_one_or_none()
        if active_sess:
            effective_sess_id = active_sess.id

    # Requirement 2: An empty table with NO active session must NEVER show a fabricated bill!
    now_iso = datetime.now(timezone.utc).isoformat()
    if not active_sess and not effective_sess_id:
        return {
            "id": f"provisional-{rest.id}-{tbl_num.lower().replace(' ', '_')}",
            "restaurantId": rest.id,
            "restaurant_id": rest.id,
            "tableId": f"table-{tbl_num}",
            "table_id": f"table-{tbl_num}",
            "tableNumber": tbl_num,
            "table_number": tbl_num,
            "tableSessionId": None,
            "table_session_id": None,
            "invoiceNumber": "Provisional Bill",
            "invoice_number": "Provisional Bill",
            "subtotal": 0.0,
            "discountAmount": 0.0,
            "discount_amount": 0.0,
            "discountPercentage": 0.0,
            "discount_percentage": 0.0,
            "taxableSubtotal": 0.0,
            "taxable_subtotal": 0.0,
            "serviceChargeAmount": 0.0,
            "service_charge_amount": 0.0,
            "serviceChargePercentage": 0.0,
            "service_charge_percentage": 0.0,
            "taxPercentage": float(rest.tax_percentage or 5.0),
            "tax_percentage": float(rest.tax_percentage or 5.0),
            "taxAmount": 0.0,
            "tax_amount": 0.0,
            "roundOffAmount": 0.0,
            "round_off_amount": 0.0,
            "grandTotal": 0.0,
            "grand_total": 0.0,
            "amountPaid": 0.0,
            "amount_paid": 0.0,
            "balanceDue": 0.0,
            "balance_due": 0.0,
            "status": "OPEN",
            "paymentStatus": "UNPAID",
            "payment_status": "UNPAID",
            "paymentMethod": None,
            "payment_method": None,
            "paymentVerifiedBy": None,
            "payment_verified_by": None,
            "paymentReference": None,
            "payment_reference": None,
            "taxBreakdown": [],
            "tax_breakdown": [],
            "tax_breakdown_json": [],
            "items": [],
            "items_snapshot_json": [],
            "orders": [],
            "orders_snapshot_json": [],
            "itemCount": 0,
            "createdAt": now_iso,
            "created_at": now_iso,
        }

    # 2. Check if an existing Bill already exists strictly for this active table session
    existing_bill = None
    if effective_sess_id:
        query = select(Bill).where(
            Bill.restaurant_id == rest.id,
            Bill.table_session_id == effective_sess_id
        ).order_by(Bill.created_at.desc()).limit(1)
        b_res = await db.execute(query)
        existing_bill = b_res.scalar_one_or_none()
    elif active_sess and t_candidates:
        query = select(Bill).where(
            Bill.restaurant_id == rest.id,
            Bill.table_number.in_(t_candidates),
            Bill.created_at >= active_sess.session_started_at
        ).order_by(Bill.created_at.desc()).limit(1)
        b_res = await db.execute(query)
        existing_bill = b_res.scalar_one_or_none()

    # Immutability Guarantee: If bill is already paid or closed, return historical snapshot
    if existing_bill and existing_bill.payment_status == "PAID":
        return format_bill_response(existing_bill)

    # 2. Compute authoritative bill data from active session orders
    calc_data = await BillingService.calculate_table_bill_data(
        rest=rest,
        table_number=tbl_num,
        table_session_id=effective_sess_id or (existing_bill.table_session_id if existing_bill else None),
        table_id=existing_bill.table_id if existing_bill else (active_sess.table_id if active_sess else None),
        discount_percentage=existing_bill.discount_percentage if existing_bill else 0.0,
        discount_amount=existing_bill.discount_amount if existing_bill else 0.0,
        service_charge_percentage=existing_bill.service_charge_percentage if existing_bill else None,
        db=db
    )

    if existing_bill:
        # Sync unpaid bill with newly placed or modified orders
        existing_bill.subtotal = calc_data["subtotal"]
        existing_bill.discount_amount = calc_data["discountAmount"]
        existing_bill.discount_percentage = calc_data["discountPercentage"]
        existing_bill.service_charge_amount = calc_data["serviceChargeAmount"]
        existing_bill.service_charge_percentage = calc_data["serviceChargePercentage"]
        existing_bill.tax_percentage = calc_data["taxPercentage"]
        existing_bill.tax_amount = calc_data["taxAmount"]
        existing_bill.round_off_amount = calc_data["roundOffAmount"]
        existing_bill.grand_total = calc_data["grandTotal"]
        existing_bill.amount_paid = calc_data["amountPaid"]
        existing_bill.amount_due = calc_data["balanceDue"]
        existing_bill.payment_status = calc_data["paymentStatus"]
        existing_bill.tax_breakdown_json = calc_data["taxBreakdown"]
        existing_bill.items_snapshot_json = calc_data["items"]
        existing_bill.orders_snapshot_json = calc_data["orders"]
        await db.commit()
        await db.refresh(existing_bill)
        return format_bill_response(existing_bill)

    # 3. If no persisted bill exists yet, return provisional bill matching format_bill_response contract
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "id": f"provisional-{rest.id}-{tbl_num.lower().replace(' ', '_')}",
        "restaurantId": rest.id,
        "restaurant_id": rest.id,
        "tableId": calc_data["tableId"],
        "table_id": calc_data["tableId"],
        "tableNumber": tbl_num,
        "table_number": tbl_num,
        "tableSessionId": calc_data["tableSessionId"] or effective_sess_id or "LIVE",
        "table_session_id": calc_data["tableSessionId"] or effective_sess_id or "LIVE",
        "invoiceNumber": "Provisional Bill",
        "invoice_number": "Provisional Bill",
        "subtotal": calc_data["subtotal"],
        "discountAmount": calc_data["discountAmount"],
        "discount_amount": calc_data["discountAmount"],
        "discountPercentage": calc_data["discountPercentage"],
        "discount_percentage": calc_data["discountPercentage"],
        "taxableSubtotal": calc_data["taxableSubtotal"],
        "taxable_subtotal": calc_data["taxableSubtotal"],
        "serviceChargeAmount": calc_data["serviceChargeAmount"],
        "service_charge_amount": calc_data["serviceChargeAmount"],
        "serviceChargePercentage": calc_data["serviceChargePercentage"],
        "service_charge_percentage": calc_data["serviceChargePercentage"],
        "taxPercentage": calc_data["taxPercentage"],
        "tax_percentage": calc_data["taxPercentage"],
        "taxAmount": calc_data["taxAmount"],
        "tax_amount": calc_data["taxAmount"],
        "roundOffAmount": calc_data["roundOffAmount"],
        "round_off_amount": calc_data["roundOffAmount"],
        "grandTotal": calc_data["grandTotal"],
        "grand_total": calc_data["grandTotal"],
        "amountPaid": calc_data["amountPaid"],
        "amount_paid": calc_data["amountPaid"],
        "balanceDue": calc_data["balanceDue"],
        "balance_due": calc_data["balanceDue"],
        "status": "OPEN",
        "paymentStatus": calc_data["paymentStatus"],
        "payment_status": calc_data["paymentStatus"],
        "paymentMethod": None,
        "payment_method": None,
        "paymentVerifiedBy": None,
        "payment_verified_by": None,
        "paymentReference": None,
        "payment_reference": None,
        "taxBreakdown": calc_data["taxBreakdown"],
        "tax_breakdown": calc_data["taxBreakdown"],
        "tax_breakdown_json": calc_data["taxBreakdown"],
        "items": calc_data["items"],
        "items_snapshot_json": calc_data["items"],
        "orders": calc_data["orders"],
        "orders_snapshot_json": calc_data["orders"],
        "createdAt": now_iso,
        "created_at": now_iso,
        "updatedAt": now_iso,
        "updated_at": now_iso,
    }


@router.get("/{restaurant_id}/billing/session/{session_id}/bill")
@router.get("/{restaurant_id}/billing/sessions/{session_id}/running-bill")
async def get_running_session_bill(
    restaurant_id: str,
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Session-scoped running bill endpoint.
    """
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    s_res = await db.execute(select(TableSession).where(TableSession.id == session_id))
    sess = s_res.scalar_one_or_none()
    tbl_num = sess.table_number if sess else "Table 01"

    return await get_running_table_bill(
        restaurant_id=restaurant_id,
        table_number=tbl_num,
        session_id=session_id,
        db=db
    )


@router.post("/{restaurant_id}/billing/generate-invoice")
async def generate_table_invoice(
    restaurant_id: str,
    payload: GenerateInvoiceInputSchema,
    db: AsyncSession = Depends(get_db)
):
    """
    Authoritative invoice generation endpoint.
    Creates or updates the single canonical Bill record for the active table session.
    """
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    bill = await BillingService.get_or_create_table_invoice(
        rest=rest,
        table_number=payload.tableNumber,
        table_session_id=payload.tableSessionId,
        table_id=payload.tableId,
        discount_percentage=payload.discountPercentage or 0.0,
        discount_amount=payload.discountAmount or 0.0,
        service_charge_percentage=payload.serviceChargePercentage,
        payment_method=payload.paymentMethod,
        order_type=payload.orderType or "DINE_IN",
        db=db
    )

    # Automatically generate / refresh dynamic payment request & UPI QR if unpaid
    if bill.payment_status not in ["PAID", "CLOSED"]:
        from app.modules.payments.service import PaymentService
        try:
            await PaymentService.create_or_refresh_bill_payment_request(bill=bill, rest=rest, db=db)
        except Exception as pe:
            print("[BILLING NOTICE] Dynamic payment QR generation warning:", pe)

    # Check if default thermal printer is configured for auto-printing
    from app.modules.printers.service import PrinterService
    try:
        default_printer = await PrinterService.get_default_printer(rest.id, db)
        if default_printer and default_printer.auto_print_on_bill:
            await PrinterService.print_bill_invoice(
                bill_id=bill.id,
                restaurant_id=rest.id,
                printer_id=default_printer.id,
                copies=default_printer.copies or 1,
                db=db
            )
    except Exception as print_err:
        print("[BILLING NOTICE] Auto-print warning:", print_err)

    formatted = format_bill_response(bill)
    try:
        await ws_manager.broadcast_event(
            restaurant_id=rest.id,
            event_type="BillRequested",
            payload={
                "billId": bill.id,
                "invoiceNumber": bill.invoice_number,
                "tableNumber": bill.table_number,
                "tableSessionId": bill.table_session_id,
                "grandTotal": bill.grand_total,
                "paymentQrPayload": bill.payment_qr_payload,
                "qrDataUrl": formatted.get("qrDataUrl"),
                "data": formatted,
            }
        )
        await ws_manager.broadcast_event(
            restaurant_id=rest.id,
            event_type="TableStatusUpdated",
            payload={
                "tableNumber": bill.table_number,
                "status": "BILL_REQUESTED",
            }
        )
    except Exception:
        pass

    return formatted


@router.post("/{restaurant_id}/billing/{bill_id}/generate-qr")
async def generate_bill_qr_endpoint(
    restaurant_id: str,
    bill_id: str,
    gateway: Optional[str] = Query(None),
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    """
    Explicitly generates or refreshes a dynamic UPI payment QR for a specific bill.
    """
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    stmt = select(Bill).where(Bill.id == bill_id, Bill.restaurant_id == rest.id)
    res = await db.execute(stmt)
    bill = res.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    from app.modules.payments.service import PaymentService
    qr_info = await PaymentService.create_or_refresh_bill_payment_request(
        bill=bill,
        rest=rest,
        db=db,
        preferred_gateway=gateway
    )
    formatted = format_bill_response(bill)

    # Realtime notification
    try:
        await ws_manager.broadcast_event(
            restaurant_id=rest.id,
            event_type="BillQrUpdated",
            payload={
                "billId": bill.id,
                "invoiceNumber": bill.invoice_number,
                "tableNumber": bill.table_number,
                "qrPayload": bill.payment_qr_payload,
                "qrDataUrl": formatted.get("qrDataUrl"),
                "totalPayable": bill.grand_total,
                "data": formatted,
            }
        )
    except Exception:
        pass

    return {
        "status": "success",
        "qr": qr_info,
        "bill": formatted
    }


@router.get("/{restaurant_id}/billing/{bill_id}/payment-status")
async def get_bill_payment_status(
    restaurant_id: str,
    bill_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Authoritative payment status endpoint for customer screens and polling terminals.
    """
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    stmt = select(Bill).where(Bill.id == bill_id, Bill.restaurant_id == rest.id)
    res = await db.execute(stmt)
    bill = res.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    formatted = format_bill_response(bill)
    return {
        "billId": bill.id,
        "invoiceNumber": bill.invoice_number,
        "tableNumber": bill.table_number,
        "paymentStatus": bill.payment_status,
        "status": bill.status,
        "amountPaid": float(bill.amount_paid or 0.0),
        "amountDue": float(bill.amount_due or (0.0 if bill.payment_status == 'PAID' else bill.grand_total)),
        "isPaid": (bill.payment_status == "PAID"),
        "paymentMethod": bill.payment_method,
        "paymentReference": bill.payment_reference,
        "paidAt": bill.paid_at.isoformat() if bill.paid_at else None,
        "bill": formatted
    }


@router.get("/{restaurant_id}/billing/diagnostic/{order_or_bill_id}")
async def get_billing_diagnostic_endpoint(
    restaurant_id: str,
    order_or_bill_id: str,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    """
    Non-mutating diagnostic tool (Section 11) for deep financial reconciliation.
    Inspects persisted line items, price snapshots, subtotals, taxes, and reports exact differences.
    """
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    return await BillingService.generate_billing_diagnostic(order_or_bill_id, rest.id, db)



# ----------------- BILLS LIST & PAYMENT ENDPOINTS -----------------

@router.get("/{restaurant_id}/billing/bills")
async def list_restaurant_bills(
    restaurant_id: str,
    status_filter: Optional[str] = None,
    payment_status: Optional[str] = None,
    table_number: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Restaurant '{restaurant_id}' not found")
    target_rest_id = rest.id

    query = select(Bill).where(Bill.restaurant_id == target_rest_id).order_by(Bill.created_at.desc())
    if status_filter:
        query = query.where(Bill.status == status_filter.upper())
    if payment_status:
        query = query.where(Bill.payment_status == payment_status.upper())
    if table_number:
        query = query.where(Bill.table_number == table_number)

    query = query.limit(limit).offset(offset)
    res = await db.execute(query)
    bills = list(res.scalars().all())
    return [format_bill_response(b) for b in bills]


@router.post("/{restaurant_id}/billing/{bill_id}/mark-payment")
@router.post("/{restaurant_id}/billing/{bill_id}/pay")
async def record_bill_payment(
    restaurant_id: str,
    bill_id: str,
    payload: MarkPaymentSchema,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Restaurant '{restaurant_id}' not found")
    target_rest_id = rest.id

    stmt = select(Bill).where(Bill.id == bill_id, Bill.restaurant_id == target_rest_id)
    res = await db.execute(stmt)
    bill = res.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    pm = payload.payment_method or payload.paymentMethod or "CASH"
    vb = payload.verified_by or payload.verifiedBy or caller.email or caller.uid or "Staff"
    pr = payload.payment_reference or payload.paymentReference or f"PAY-{bill.id}-{uuid.uuid4().hex[:8]}"

    amt_to_pay = float(payload.amount_paid if payload.amount_paid is not None else (payload.amountPaid if payload.amountPaid is not None else (bill.amount_due if getattr(bill, "amount_due", 0.0) > 0 else bill.grand_total)))

    from app.modules.payments.service import PaymentService
    success, status_msg, updated_bill = await PaymentService.process_verified_payment(
        db=db,
        restaurant_id=target_rest_id,
        bill_id=bill.id,
        gateway=f"MANUAL_{pm}",
        transaction_reference=pr,
        amount_paid=amt_to_pay,
        payment_method=pm,
        raw_payload={"verified_by": vb, "notes": "Staff manual payment record"}
    )
    if not updated_bill:
        updated_bill = bill

    if vb and hasattr(updated_bill, "payment_verified_by"):
        updated_bill.payment_verified_by = vb

    if not getattr(updated_bill, "business_day_id", None):
        from app.modules.business_day.models import BusinessDay
        bday_q = select(BusinessDay.id).where(
            BusinessDay.restaurant_id == target_rest_id,
            BusinessDay.status == "OPEN"
        ).order_by(BusinessDay.opened_at.desc()).limit(1)
        bday_res = await db.execute(bday_q)
        active_bday_id = bday_res.scalar_one_or_none()
        if active_bday_id:
            updated_bill.business_day_id = active_bday_id

    await db.commit()
    await db.refresh(updated_bill)

    formatted = format_bill_response(updated_bill)

    # Broadcast Realtime Event
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        payment_evt_id = f"evt-pay-{uuid.uuid4().hex[:12]}"
        pay_id = updated_bill.payment_reference or f"pay-{updated_bill.id}"
        event_payload = {
            "event_id": payment_evt_id,
            "eventId": payment_evt_id,
            "restaurant_id": target_rest_id,
            "restaurantId": target_rest_id,
            "table_id": updated_bill.table_id,
            "tableId": updated_bill.table_id,
            "table_session_id": updated_bill.table_session_id,
            "tableSessionId": updated_bill.table_session_id,
            "table_number": updated_bill.table_number,
            "tableNumber": updated_bill.table_number,
            "bill_id": updated_bill.id,
            "billId": updated_bill.id,
            "payment_id": pay_id,
            "paymentId": pay_id,
            "status": updated_bill.status,
            "payment_status": updated_bill.payment_status,
            "paymentStatus": updated_bill.payment_status,
            "amount": float(updated_bill.amount_paid or updated_bill.grand_total),
            "amount_paid": float(updated_bill.amount_paid or 0.0),
            "amountPaid": float(updated_bill.amount_paid or 0.0),
            "amount_due": float(updated_bill.amount_due or 0.0),
            "amountDue": float(updated_bill.amount_due or 0.0),
            "grand_total": float(updated_bill.grand_total),
            "grandTotal": float(updated_bill.grand_total),
            "payment_method": updated_bill.payment_method,
            "paymentMethod": updated_bill.payment_method,
            "timestamp": now_iso,
            "data": formatted,
        }
        await ws_manager.broadcast_event(
            restaurant_id=target_rest_id,
            event_type="BillPaid" if updated_bill.payment_status == "PAID" else "payment_status_updated",
            payload=event_payload,
            target_audience=["WAITER", "OWNER", "CUSTOMER", "POS"]
        )
        await ws_manager.broadcast_event(
            restaurant_id=target_rest_id,
            event_type="BillPaid",
            payload=event_payload,
            target_audience=["WAITER", "OWNER", "CUSTOMER", "POS"]
        )
    except Exception:
        pass

    return {
        **formatted,
        "status": "success",
        "paymentStatus": updated_bill.payment_status,
        "payment_status": updated_bill.payment_status,
        "billStatus": updated_bill.status,
        "bill_status": updated_bill.status,
        "message": f"Payment of ₹{amt_to_pay:.2f} recorded successfully via {updated_bill.payment_method}",
        "bill": formatted,
    }


@router.post("/{restaurant_id}/billing/{bill_id}/report-customer-payment")
async def report_customer_payment(
    restaurant_id: str,
    bill_id: str,
    payload: Optional[Dict[str, Any]] = Body(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Customer marks 'I Have Paid'.
    In accordance with financial safety (Part G, I, V):
    Customer action NEVER directly sets 'PAID'.
    Sets payment_status = 'PAYMENT_AWAITING_CONFIRMATION' and alerts staff terminal.
    """
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Restaurant '{restaurant_id}' not found")
    target_rest_id = rest.id

    stmt = select(Bill).where(Bill.id == bill_id, Bill.restaurant_id == target_rest_id)
    res = await db.execute(stmt)
    bill = res.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    if bill.payment_status != "PAID":
        bill.payment_status = "PAYMENT_AWAITING_CONFIRMATION"
        await db.commit()
        await db.refresh(bill)

    formatted = format_bill_response(bill)
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        payment_evt_id = f"evt-pay-await-{uuid.uuid4().hex[:12]}"
        pay_id = bill.payment_reference or f"pay-await-{bill.id}"
        await ws_manager.broadcast_event(
            restaurant_id=target_rest_id,
            event_type="payment_status_updated",
            payload={
                "event_id": payment_evt_id,
                "eventId": payment_evt_id,
                "restaurant_id": target_rest_id,
                "restaurantId": target_rest_id,
                "table_id": bill.table_id,
                "tableId": bill.table_id,
                "table_session_id": bill.table_session_id,
                "tableSessionId": bill.table_session_id,
                "table_number": bill.table_number,
                "tableNumber": bill.table_number,
                "bill_id": bill.id,
                "billId": bill.id,
                "payment_id": pay_id,
                "paymentId": pay_id,
                "status": "PAYMENT_AWAITING_CONFIRMATION",
                "payment_status": "PAYMENT_AWAITING_CONFIRMATION",
                "paymentStatus": "PAYMENT_AWAITING_CONFIRMATION",
                "amount": float(bill.grand_total),
                "grand_total": float(bill.grand_total),
                "grandTotal": float(bill.grand_total),
                "timestamp": now_iso,
                "data": formatted,
            },
            target_audience=["WAITER", "OWNER", "CUSTOMER"]
        )
    except Exception:
        pass

    return {
        **formatted,
        "status": bill.status,
        "paymentStatus": bill.payment_status,
        "message": "Payment reported. Awaiting staff verification.",
        "bill": formatted,
    }


@router.post("/{restaurant_id}/billing/webhook/razorpay")
async def razorpay_payment_webhook(
    request: Request,
    restaurant_id: str,
    x_razorpay_signature: Optional[str] = Header(None, alias="X-Razorpay-Signature"),
    db: AsyncSession = Depends(get_db)
):
    """
    Authoritative Razorpay Webhook Handler on Billing Router.
    Cryptographically verifies signature using HMAC-SHA256 and records payment idempotently.
    """
    from app.core.config.settings import get_settings
    from app.modules.payments.service import PaymentService
    import json

    settings = get_settings()
    raw_body = await request.body()

    rest = await find_restaurant_by_identifier(restaurant_id, db)
    target_rest_id = rest.id if rest else restaurant_id

    # Discover webhook secret (restaurant custom override or platform setting)
    webhook_secret = getattr(settings, "RAZORPAY_WEBHOOK_SECRET", None)
    if rest and getattr(rest, "billing_settings_json", None):
        webhook_secret = rest.billing_settings_json.get("razorpay_webhook_secret") or webhook_secret

    if webhook_secret and x_razorpay_signature:
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
        if not bill_id:
            receipt = payment_entity.get("receipt", "")
            if receipt.startswith("bill-"):
                bill_id = receipt.split("-")[0] + "-" + receipt.split("-")[1]

        if bill_id:
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
            return {"status": "success", "result": status_msg, "billId": bill_id}

    return {"status": "ignored"}


@router.post("/{restaurant_id}/billing/{bill_id}/close-table")
async def close_table_settlement(
    restaurant_id: str,
    bill_id: str,
    closed_by: Optional[str] = Query("Staff"),
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    target_rest_id = rest.id if rest else restaurant_id

    stmt = select(Bill).where(Bill.id == bill_id, Bill.restaurant_id == target_rest_id)
    res = await db.execute(stmt)
    bill = res.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    if bill.payment_status != "PAID":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot close table settlement: Bill #{bill.id} is unpaid. Please record payment before closing."
        )

    bill.status = "CLOSED"

    # Close Table Session
    if bill.table_session_id:
        sess_stmt = select(TableSession).where(TableSession.id == bill.table_session_id)
        sess_res = await db.execute(sess_stmt)
        sess = sess_res.scalar_one_or_none()
        if sess:
            sess.status = "CLOSED"
            sess.session_closed_at = datetime.now(timezone.utc)
            sess.closed_by_waiter_name = closed_by

    # Free up table
    tbl_stmt = select(Table).where(Table.restaurant_id == target_rest_id, Table.table_number == bill.table_number)
    tbl_res = await db.execute(tbl_stmt)
    tbl = tbl_res.scalar_one_or_none()
    if tbl:
        tbl.status = "AVAILABLE"
        tbl.active_session_id = None
        tbl.is_occupied = False

    await db.commit()
    await db.refresh(bill)

    formatted = format_bill_response(bill)

    # Broadcast Realtime Closure Event
    try:
        await ws_manager.broadcast_event(
            restaurant_id=target_rest_id,
            event_type="TableSessionClosed",
            payload={
                "tableNumber": bill.table_number,
                "tableSessionId": bill.table_session_id,
                "closedBy": closed_by,
                "data": formatted,
            }
        )
        await ws_manager.broadcast_event(
            restaurant_id=target_rest_id,
            event_type="TableStatusUpdated",
            payload={
                "tableNumber": bill.table_number,
                "status": "AVAILABLE",
            }
        )
    except Exception:
        pass

    return {
        "status": "success",
        "message": f"Table {bill.table_number} session closed and table reset to AVAILABLE",
        "bill": formatted,
    }

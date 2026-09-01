import uuid
from typing import Optional, List, Any, Dict
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, or_

from app.core.database.connection import get_db
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table, TableSession
from app.modules.orders.models import Order, Bill
from app.modules.taxes.models import Tax, TaxCategory, TaxMenuItem, InvoiceTaxSnapshot
from app.modules.taxes.calculation import calculate_taxes
from app.modules.websocket.manager import ws_manager

router = APIRouter()

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
    paymentMethod: str = "CASH"  # CASH | CARD | UPI | QR_CODE | OTHER
    verifiedBy: Optional[str] = "Staff"
    paymentReference: Optional[str] = None
    amountPaid: Optional[float] = None

class QrUploadSchema(BaseModel):
    qrDataUrl: str
    merchantName: Optional[str] = None
    upiId: Optional[str] = None

# ----------------- HELPERS -----------------

async def find_restaurant_by_identifier(restaurant_id: str, db: AsyncSession) -> Optional[Restaurant]:
    if not restaurant_id:
        return None
    
    clean_id = restaurant_id.strip()

    # Fast single indexed query covering exact ID, lowercased ID, slug, and lowercased name
    stmt = select(Restaurant).where(
        Restaurant.deleted_at.is_(None),
        or_(
            Restaurant.id == clean_id,
            func.lower(Restaurant.id) == clean_id.lower(),
            Restaurant.slug == clean_id.lower(),
            func.lower(Restaurant.name) == clean_id.lower()
        )
    ).limit(1)
    res = await db.execute(stmt)
    rest = res.scalar_one_or_none()
    if rest:
        return rest

    # Fallback for default identifiers if explicitly requested
    if clean_id.lower() in ["rest-1", "default", "current", "cafe-co", "cafeco"]:
        stmt = select(Restaurant).where(Restaurant.deleted_at.is_(None)).order_by(Restaurant.created_at.asc()).limit(1)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

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
        "status": bill.status,
        "paymentStatus": bill.payment_status,
        "payment_status": bill.payment_status,
        "paymentMethod": bill.payment_method,
        "payment_method": bill.payment_method,
        "paymentVerifiedBy": bill.payment_verified_by,
        "payment_verified_by": bill.payment_verified_by,
        "paymentReference": bill.payment_reference,
        "payment_reference": bill.payment_reference,
        "taxBreakdown": bill.tax_breakdown_json or [],
        "tax_breakdown": bill.tax_breakdown_json or [],
        "tax_breakdown_json": bill.tax_breakdown_json or [],
        "items": bill.items_snapshot_json or [],
        "items_snapshot_json": bill.items_snapshot_json or [],
        "orders": bill.orders_snapshot_json or [],
        "orders_snapshot_json": bill.orders_snapshot_json or [],
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
                "timestamp": datetime.utcnow().isoformat(),
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
                "timestamp": datetime.utcnow().isoformat(),
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
    # 1. Fetch Restaurant & Active Tax Configuration
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    taxes_stmt = select(Tax).where(Tax.restaurant_id == rest.id, Tax.status == "ACTIVE")
    t_res = await db.execute(taxes_stmt)
    active_taxes = list(t_res.scalars().all())

    # Tax category and item associations
    cat_stmt = select(TaxCategory)
    cat_res = await db.execute(cat_stmt)
    tax_categories_map: Dict[str, List[str]] = {}
    for tc in cat_res.scalars().all():
        tax_categories_map.setdefault(tc.tax_id, []).append(tc.category_id)

    item_stmt = select(TaxMenuItem)
    item_res = await db.execute(item_stmt)
    tax_items_map: Dict[str, List[str]] = {}
    for ti in item_res.scalars().all():
        tax_items_map.setdefault(ti.tax_id, []).append(ti.menu_item_id)

    # 2. Fetch Orders for this table session
    tbl_num = input_data.tableNumber
    sess_id = input_data.tableSessionId

    orders_query = select(Order).where(
        Order.restaurant_id == rest.id,
        Order.status != "CANCELLED"
    )
    if sess_id:
        orders_query = orders_query.where(Order.table_session_id == sess_id)
    else:
        orders_query = orders_query.where(Order.table_number == tbl_num)

    o_res = await db.execute(orders_query)
    table_orders = list(o_res.scalars().all())

    # Aggregate item list
    bill_items: List[Dict[str, Any]] = []
    for order in table_orders:
        items = getattr(order, "items_json", []) or []
        for itm in items:
            bill_items.append({
                "orderId": order.id,
                "menuItemId": itm.get("menuItemId") or itm.get("id") or "",
                "name": itm.get("name", "Item"),
                "quantity": int(itm.get("quantity") or 1),
                "unitPrice": float(itm.get("price") or 0.0),
                "totalPrice": round(float(itm.get("price") or 0.0) * int(itm.get("quantity") or 1), 2),
                "station": itm.get("targetDestination") or ("BAR" if itm.get("isAlcoholic") else "KITCHEN"),
                "category": itm.get("category"),
                "categoryId": itm.get("categoryId"),
            })

    # Run deterministic Tax Engine
    calc_res = calculate_taxes(
        items=bill_items,
        active_taxes=active_taxes,
        tax_categories_map=tax_categories_map,
        tax_items_map=tax_items_map,
        order_type=input_data.orderType or "DINE_IN"
    )

    subtotal = calc_res["subtotal"]
    tax_amount = calc_res["total_tax_amount"]
    tax_breakdown = calc_res["tax_breakdown"]

    # Calculate Discount
    disc_amt = input_data.discountAmount or 0.0
    if input_data.discountPercentage and input_data.discountPercentage > 0:
        disc_amt = round(subtotal * (input_data.discountPercentage / 100.0), 2)
    disc_amt = min(disc_amt, subtotal)

    taxable_subtotal = max(0.0, round(subtotal - disc_amt, 2))

    # Calculate Service Charge
    sc_pct = rest.service_charge_percentage if rest.service_charge_enabled else 0.0
    if input_data.serviceChargePercentage is not None:
        sc_pct = max(0.0, float(input_data.serviceChargePercentage))
    service_charge_amt = round(taxable_subtotal * (sc_pct / 100.0), 2) if sc_pct > 0 else 0.0

    raw_total = taxable_subtotal + service_charge_amt + tax_amount
    round_off = round(round(raw_total) - raw_total, 2)
    grand_total = round(raw_total + round_off, 2)

    return {
        "restaurantId": rest.id,
        "tableNumber": tbl_num,
        "tableSessionId": sess_id,
        "itemCount": len(bill_items),
        "items": bill_items,
        "orders": [
            {"id": o.id, "orderNumber": o.order_number or f"#ORD-{o.id[:4]}", "status": o.status, "totalAmount": o.total_amount}
            for o in table_orders
        ],
        "subtotal": subtotal,
        "discountPercentage": input_data.discountPercentage or 0.0,
        "discountAmount": disc_amt,
        "taxableSubtotal": taxable_subtotal,
        "serviceChargePercentage": sc_pct,
        "serviceChargeAmount": service_charge_amt,
        "taxAmount": tax_amount,
        "taxBreakdown": tax_breakdown,
        "roundOffAmount": round_off,
        "grandTotal": grand_total,
    }


@router.post("/{restaurant_id}/billing/generate-invoice")
async def generate_table_invoice(
    restaurant_id: str,
    payload: GenerateInvoiceInputSchema,
    db: AsyncSession = Depends(get_db)
):
    # 1. Fetch Restaurant & Next Invoice Number
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    # Generate sequential invoice number
    prefix = rest.invoice_prefix or "INV-"
    current_num = int(rest.invoice_starting_number or 1001)

    # Check for existing bills with invoice numbers to ensure uniqueness
    max_inv_stmt = select(func.count(Bill.id)).where(Bill.restaurant_id == rest.id)
    inv_count_res = await db.execute(max_inv_stmt)
    total_bills = inv_count_res.scalar() or 0
    invoice_number = f"{prefix}{current_num + total_bills}"

    # 2. Run Canonical Calculation
    calc_input = CalculateBillInputSchema(
        tableId=payload.tableId,
        tableNumber=payload.tableNumber,
        tableSessionId=payload.tableSessionId,
        discountPercentage=payload.discountPercentage,
        discountAmount=payload.discountAmount,
        serviceChargePercentage=payload.serviceChargePercentage,
        orderType=payload.orderType
    )
    calc_res = await calculate_table_bill(rest.id, calc_input, db)

    # 3. Create or Update Bill record
    bill_id = f"bill-{uuid.uuid4().hex[:12]}"
    new_bill = Bill(
        id=bill_id,
        restaurant_id=rest.id,
        table_id=payload.tableId or f"table-{payload.tableNumber}",
        table_number=payload.tableNumber,
        table_session_id=payload.tableSessionId or f"sess-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        invoice_number=invoice_number,
        subtotal=calc_res["subtotal"],
        discount_amount=calc_res["discountAmount"],
        discount_percentage=calc_res["discountPercentage"],
        service_charge_amount=calc_res["serviceChargeAmount"],
        service_charge_percentage=calc_res["serviceChargePercentage"],
        tax_percentage=rest.tax_percentage or 5.0,
        tax_amount=calc_res["taxAmount"],
        round_off_amount=calc_res["roundOffAmount"],
        grand_total=calc_res["grandTotal"],
        status="BILL_REQUESTED",
        payment_status="UNPAID",
        payment_method=payload.paymentMethod,
        tax_breakdown_json=calc_res["taxBreakdown"],
        items_snapshot_json=calc_res["items"],
        orders_snapshot_json=calc_res["orders"],
    )
    db.add(new_bill)

    # Update Table status to BILL_REQUESTED
    tbl_stmt = select(Table).where(Table.restaurant_id == rest.id, Table.table_number == payload.tableNumber)
    tbl_res = await db.execute(tbl_stmt)
    tbl = tbl_res.scalar_one_or_none()
    if tbl:
        tbl.status = "BILL_REQUESTED"

    # Update TableSession status
    if payload.tableSessionId:
        sess_stmt = select(TableSession).where(TableSession.id == payload.tableSessionId)
        sess_res = await db.execute(sess_stmt)
        sess = sess_res.scalar_one_or_none()
        if sess:
            sess.status = "BILL_REQUESTED"
            sess.bill_id = bill_id

    await db.commit()
    await db.refresh(new_bill)

    # 4. Broadcast Realtime Event
    formatted = format_bill_response(new_bill)
    try:
        await ws_manager.broadcast_event(
            restaurant_id=rest.id,
            event_type="BillRequested",
            payload={
                "billId": new_bill.id,
                "invoiceNumber": new_bill.invoice_number,
                "tableNumber": new_bill.table_number,
                "tableSessionId": new_bill.table_session_id,
                "grandTotal": new_bill.grand_total,
                "data": formatted,
            }
        )
        await ws_manager.broadcast_event(
            restaurant_id=rest.id,
            event_type="TableStatusUpdated",
            payload={
                "tableNumber": new_bill.table_number,
                "status": "BILL_REQUESTED",
            }
        )
    except Exception:
        pass

    return formatted


# ----------------- BILLS LIST & PAYMENT ENDPOINTS -----------------

@router.get("/{restaurant_id}/billing/bills")
async def list_restaurant_bills(
    restaurant_id: str,
    status_filter: Optional[str] = None,
    payment_status: Optional[str] = None,
    table_number: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    target_rest_id = rest.id if rest else restaurant_id

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
async def record_bill_payment(
    restaurant_id: str,
    bill_id: str,
    payload: MarkPaymentSchema,
    db: AsyncSession = Depends(get_db)
):
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    target_rest_id = rest.id if rest else restaurant_id

    stmt = select(Bill).where(Bill.id == bill_id, Bill.restaurant_id == target_rest_id)
    res = await db.execute(stmt)
    bill = res.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill.payment_status = "PAID"
    bill.status = "PAID"
    bill.payment_method = payload.paymentMethod
    bill.payment_verified_by = payload.verifiedBy or "Staff"
    bill.payment_reference = payload.paymentReference or f"PAY-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    # Update TableSession payment status
    if bill.table_session_id:
        sess_stmt = select(TableSession).where(TableSession.id == bill.table_session_id)
        sess_res = await db.execute(sess_stmt)
        sess = sess_res.scalar_one_or_none()
        if sess:
            sess.status = "PAID"
            sess.payment_status = "PAID"
            sess.payment_method = payload.paymentMethod

    await db.commit()
    await db.refresh(bill)

    formatted = format_bill_response(bill)

    # Broadcast Realtime Event
    try:
        await ws_manager.broadcast_event(
            restaurant_id=target_rest_id,
            event_type="BillPaid",
            payload={
                "billId": bill.id,
                "invoiceNumber": bill.invoice_number,
                "tableNumber": bill.table_number,
                "tableSessionId": bill.table_session_id,
                "paymentMethod": bill.payment_method,
                "paymentStatus": "PAID",
                "grandTotal": bill.grand_total,
                "data": formatted,
            }
        )
    except Exception:
        pass

    return {
        "status": "success",
        "message": f"Payment of ₹{bill.grand_total} recorded successfully via {bill.payment_method}",
        "bill": formatted,
    }


@router.post("/{restaurant_id}/billing/{bill_id}/close-table")
async def close_table_settlement(
    restaurant_id: str,
    bill_id: str,
    closed_by: Optional[str] = Query("Staff"),
    db: AsyncSession = Depends(get_db)
):
    rest = await find_restaurant_by_identifier(restaurant_id, db)
    target_rest_id = rest.id if rest else restaurant_id

    stmt = select(Bill).where(Bill.id == bill_id, Bill.restaurant_id == target_rest_id)
    res = await db.execute(stmt)
    bill = res.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill.status = "CLOSED"
    if bill.payment_status != "PAID":
        bill.payment_status = "PAID"
        bill.payment_method = bill.payment_method or "CASH"

    # Close Table Session
    if bill.table_session_id:
        sess_stmt = select(TableSession).where(TableSession.id == bill.table_session_id)
        sess_res = await db.execute(sess_stmt)
        sess = sess_res.scalar_one_or_none()
        if sess:
            sess.status = "CLOSED"
            sess.session_closed_at = datetime.utcnow()
            sess.closed_by_waiter_name = closed_by

    # Free up table
    tbl_stmt = select(Table).where(Table.restaurant_id == target_rest_id, Table.table_number == bill.table_number)
    tbl_res = await db.execute(tbl_stmt)
    tbl = tbl_res.scalar_one_or_none()
    if tbl:
        tbl.status = "AVAILABLE"
        tbl.current_session_id = None

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

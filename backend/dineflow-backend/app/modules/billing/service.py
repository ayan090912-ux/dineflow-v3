import uuid
from typing import Optional, List, Any, Dict, Tuple
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_

from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table, TableSession
from app.modules.orders.models import Order, Bill
from app.modules.taxes.models import Tax, TaxCategory, TaxMenuItem
from app.modules.taxes.calculation import calculate_taxes


class SynthesizedTax:
    """Fallback tax record when restaurant relies on default restaurant.tax_percentage"""
    def __init__(
        self,
        id: str,
        name: str,
        type: str,
        rate: float,
        fixed_amount: float,
        is_inclusive: bool,
        status: str,
        applicable_order_types: List[str],
        applies_to: str
    ):
        self.id = id
        self.name = name
        self.type = type
        self.rate = rate
        self.fixed_amount = fixed_amount
        self.is_inclusive = is_inclusive
        self.status = status
        self.applicable_order_types = applicable_order_types
        self.applies_to = applies_to


class BillingService:
    """
    Canonical, authoritative backend billing and monetary calculation engine.
    Single source of truth for:
    - Item pricing and quantities
    - Effective restaurant taxes (including multi-tax, inclusive vs exclusive, item/category priority, and default fallbacks)
    - Order-level & item-level discounts
    - Service charges
    - Nearest-rupee round-off adjustments
    - Final grand totals, amount paid, and outstanding balance
    """

    @staticmethod
    async def get_effective_taxes(
        rest: Restaurant,
        db: AsyncSession
    ) -> Tuple[List[Any], Dict[str, List[str]], Dict[str, List[str]]]:
        """
        Retrieves active taxes for a restaurant.
        If no explicit Tax records exist in the taxes table, falls back to the
        restaurant's configured tax_percentage so calculations never silently drop to 0%.
        """
        taxes_stmt = select(Tax).where(Tax.restaurant_id == rest.id, Tax.status == "ACTIVE")
        t_res = await db.execute(taxes_stmt)
        active_taxes = list(t_res.scalars().all())

        tax_categories_map: Dict[str, List[str]] = {}
        tax_items_map: Dict[str, List[str]] = {}

        if active_taxes:
            tax_ids = [t.id for t in active_taxes]
            cat_stmt = select(TaxCategory).where(TaxCategory.tax_id.in_(tax_ids))
            cat_res = await db.execute(cat_stmt)
            for tc in cat_res.scalars().all():
                tax_categories_map.setdefault(tc.tax_id, []).append(tc.category_id)

            item_stmt = select(TaxMenuItem).where(TaxMenuItem.tax_id.in_(tax_ids))
            item_res = await db.execute(item_stmt)
            for ti in item_res.scalars().all():
                tax_items_map.setdefault(ti.tax_id, []).append(ti.menu_item_id)
        else:
            # Fallback to restaurant default tax_percentage if configured > 0
            default_rate = float(rest.tax_percentage if rest.tax_percentage is not None else 5.0)
            if default_rate > 0.0:
                fallback_tax = SynthesizedTax(
                    id="default-order-gst",
                    name=f"GST ({default_rate:g}%)",
                    type="PERCENTAGE",
                    rate=default_rate,
                    fixed_amount=0.0,
                    is_inclusive=False,
                    status="ACTIVE",
                    applicable_order_types=["DINE_IN", "TAKEAWAY", "DELIVERY"],
                    applies_to="ORDER"
                )
                active_taxes = [fallback_tax]

        return active_taxes, tax_categories_map, tax_items_map

    @classmethod
    async def calculate_order_totals(
        cls,
        items: List[Dict[str, Any]],
        rest: Restaurant,
        db: AsyncSession,
        order_type: str = "DINE_IN"
    ) -> Dict[str, Any]:
        """
        Calculates authoritative totals for a single order creation or update.
        """
        active_taxes, tax_cats_map, tax_items_map = await cls.get_effective_taxes(rest, db)
        calc = calculate_taxes(
            items=items,
            active_taxes=active_taxes,
            tax_categories_map=tax_cats_map,
            tax_items_map=tax_items_map,
            order_type=order_type
        )
        return {
            "subtotal": calc["subtotal"],
            "taxAmount": calc["total_tax_amount"],
            "totalAmount": calc["grand_total"],
            "taxBreakdown": calc["tax_breakdown"],
            "totalIncludedTax": calc.get("total_included_tax", 0.0),
            "totalExcludedTax": calc.get("total_excluded_tax", 0.0),
        }

    @classmethod
    async def calculate_table_bill_data(
        cls,
        rest: Restaurant,
        table_number: str,
        table_session_id: Optional[str] = None,
        table_id: Optional[str] = None,
        discount_percentage: float = 0.0,
        discount_amount: float = 0.0,
        service_charge_percentage: Optional[float] = None,
        order_type: str = "DINE_IN",
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Authoritative calculation of a table's running or final bill.
        Aggregates items from active non-cancelled session orders, applies taxes,
        service charges, discounts, and round-offs.
        """
        tbl_num = (table_number or "").strip()
        sess_id = (table_session_id or "").strip() or None

        # Resolve session if not explicitly provided
        actual_session = None
        if sess_id:
            s_res = await db.execute(select(TableSession).where(TableSession.id == sess_id))
            actual_session = s_res.scalar_one_or_none()

        if not actual_session and tbl_num:
            t_candidates = [
                tbl_num,
                f"Table {tbl_num}",
                tbl_num.replace("Table ", "").strip()
            ]
            s_query = select(TableSession).where(
                TableSession.restaurant_id == rest.id,
                TableSession.table_number.in_(t_candidates),
                TableSession.status != "CLOSED"
            ).order_by(TableSession.session_started_at.desc()).limit(1)
            s_res = await db.execute(s_query)
            actual_session = s_res.scalar_one_or_none()
            if actual_session:
                sess_id = actual_session.id

        # Query all non-cancelled orders belonging to this session or table
        orders_query = select(Order).where(
            Order.restaurant_id == rest.id,
            Order.status != "CANCELLED"
        )
        if sess_id:
            orders_query = orders_query.where(Order.table_session_id == sess_id)
        else:
            t_candidates = [
                tbl_num,
                f"Table {tbl_num}",
                tbl_num.replace("Table ", "").strip()
            ]
            orders_query = orders_query.where(Order.table_number.in_(t_candidates))

        o_res = await db.execute(orders_query.order_by(Order.created_at.asc()))
        table_orders = list(o_res.scalars().all())

        # Fallback if no orders found by session ID: search by tableId / tableNumber
        if not table_orders and (table_id or tbl_num):
            t_filters = []
            if table_id:
                t_filters.append(Order.table_id == table_id)
            if tbl_num:
                t_filters.extend([
                    Order.table_number == tbl_num,
                    Order.table_number == f"Table {tbl_num}",
                    Order.table_number == tbl_num.replace("Table ", "").strip()
                ])
            fallback_query = select(Order).where(
                Order.restaurant_id == rest.id,
                Order.status != "CANCELLED",
                or_(*t_filters)
            ).order_by(Order.created_at.desc()).limit(20)
            fb_res = await db.execute(fallback_query)
            table_orders = list(fb_res.scalars().all())

        # Aggregate items
        bill_items: List[Dict[str, Any]] = []
        for order in table_orders:
            items = getattr(order, "items_json", []) or []
            for itm in items:
                raw_p = itm.get("price")
                if raw_p is None:
                    raw_p = itm.get("unit_price")
                if raw_p is None:
                    raw_p = itm.get("unitPrice")
                unit_p = float(raw_p or 0.0)
                qty = int(itm.get("quantity") or 1)
                raw_tot = itm.get("totalPrice") or itm.get("total_price")
                total_p = round(float(raw_tot) if raw_tot is not None else (unit_p * qty), 2)
                if unit_p == 0.0 and total_p > 0.0:
                    unit_p = round(total_p / max(1, qty), 2)

                bill_items.append({
                    "orderId": order.id,
                    "menuItemId": itm.get("menuItemId") or itm.get("id") or "",
                    "name": itm.get("name", "Item"),
                    "quantity": qty,
                    "price": unit_p,
                    "unitPrice": unit_p,
                    "unit_price": unit_p,
                    "totalPrice": total_p,
                    "total_price": total_p,
                    "station": itm.get("targetDestination") or ("BAR" if itm.get("isAlcoholic") else "KITCHEN"),
                    "category": itm.get("category"),
                    "categoryId": itm.get("categoryId"),
                })

        # Calculate Gross Subtotal
        subtotal = round(sum(float(i.get("totalPrice") or 0.0) for i in bill_items), 2)
        if subtotal <= 0.0 and table_orders:
            subtotal = round(sum(float(getattr(o, "subtotal", 0.0) or getattr(o, "total_amount", 0.0) or 0.0) for o in table_orders), 2)

        # Calculate Discounts
        disc_amt = round(float(discount_amount or 0.0), 2)
        disc_pct = round(float(discount_percentage or 0.0), 2)
        if disc_pct > 0 and disc_amt == 0.0:
            disc_amt = round(subtotal * (disc_pct / 100.0), 2)
        disc_amt = min(disc_amt, subtotal)
        taxable_subtotal = max(0.0, round(subtotal - disc_amt, 2))

        # Get Effective Taxes
        active_taxes, tax_cats_map, tax_items_map = await cls.get_effective_taxes(rest, db)

        # Run Tax Engine with Prorated Discount
        calc_res = calculate_taxes(
            items=bill_items,
            active_taxes=active_taxes,
            tax_categories_map=tax_cats_map,
            tax_items_map=tax_items_map,
            order_type=order_type or "DINE_IN",
            discount_amount=disc_amt,
            discount_percentage=disc_pct
        )

        tax_amount = calc_res["total_tax_amount"]
        tax_breakdown = calc_res["tax_breakdown"]

        # Calculate Service Charge
        sc_pct = float(rest.service_charge_percentage or 0.0) if rest.service_charge_enabled else 0.0
        if service_charge_percentage is not None:
            sc_pct = max(0.0, float(service_charge_percentage))
        service_charge_amt = round(taxable_subtotal * (sc_pct / 100.0), 2) if sc_pct > 0 else 0.0

        # Raw Total & Round Off (Nearest Rupee)
        raw_total = round(taxable_subtotal + service_charge_amt + tax_amount, 2)
        round_off = round(round(raw_total) - raw_total, 2)
        grand_total = round(raw_total + round_off, 2)

        # Determine Effective Tax Percentage for high-level display
        effective_tax_pct = float(rest.tax_percentage or 5.0)
        if active_taxes and active_taxes[0].type == "PERCENTAGE":
            effective_tax_pct = float(active_taxes[0].rate or effective_tax_pct)

        return {
            "restaurantId": rest.id,
            "restaurant_id": rest.id,
            "tableNumber": tbl_num,
            "table_number": tbl_num,
            "tableId": table_id or (actual_session.table_id if actual_session else f"table-{tbl_num}"),
            "table_id": table_id or (actual_session.table_id if actual_session else f"table-{tbl_num}"),
            "tableSessionId": sess_id,
            "table_session_id": sess_id,
            "itemCount": len(bill_items),
            "items": bill_items,
            "orders": [
                {
                    "id": o.id,
                    "orderNumber": o.order_number or f"#ORD-{o.id[:4]}",
                    "status": o.status,
                    "totalAmount": o.total_amount,
                    "total_amount": o.total_amount,
                    "subtotal": o.subtotal,
                    "tax_amount": o.tax_amount,
                }
                for o in table_orders
            ],
            "subtotal": subtotal,
            "discountPercentage": disc_pct,
            "discount_percentage": disc_pct,
            "discountAmount": disc_amt,
            "discount_amount": disc_amt,
            "taxableSubtotal": taxable_subtotal,
            "taxable_subtotal": taxable_subtotal,
            "serviceChargePercentage": sc_pct,
            "service_charge_percentage": sc_pct,
            "serviceChargeAmount": service_charge_amt,
            "service_charge_amount": service_charge_amt,
            "taxPercentage": effective_tax_pct,
            "tax_percentage": effective_tax_pct,
            "taxAmount": tax_amount,
            "tax_amount": tax_amount,
            "taxBreakdown": tax_breakdown,
            "tax_breakdown": tax_breakdown,
            "roundOffAmount": round_off,
            "round_off_amount": round_off,
            "grandTotal": grand_total,
            "grand_total": grand_total,
            "amountPaid": 0.0,
            "amount_paid": 0.0,
            "balanceDue": grand_total,
            "balance_due": grand_total,
        }

    @classmethod
    async def get_or_create_table_invoice(
        cls,
        rest: Restaurant,
        table_number: str,
        table_session_id: Optional[str] = None,
        table_id: Optional[str] = None,
        discount_percentage: float = 0.0,
        discount_amount: float = 0.0,
        service_charge_percentage: Optional[float] = None,
        payment_method: Optional[str] = None,
        order_type: str = "DINE_IN",
        db: AsyncSession = None
    ) -> Bill:
        """
        Retrieves or generates the authoritative Bill record.
        - If an unpaid bill already exists for this active session, it updates that record
          (avoiding duplicate bills and skipping invoice number fragmentation).
        - If the bill is already PAID or CLOSED, returns it unmodified (Immutability guarantee).
        - If no bill exists, assigns next sequential invoice number and creates new record.
        """
        sess_id = (table_session_id or "").strip() or None
        tbl_num = (table_number or "").strip()

        # Check for existing open/unpaid bill for this session or table
        existing_bill = None
        if sess_id:
            b_stmt = select(Bill).where(
                Bill.restaurant_id == rest.id,
                Bill.table_session_id == sess_id,
                Bill.status.notin_(["CLOSED", "CANCELLED", "PAID"]),
                Bill.payment_status != "PAID"
            ).order_by(Bill.created_at.desc()).limit(1)
            b_res = await db.execute(b_stmt)
            existing_bill = b_res.scalar_one_or_none()

        if not existing_bill and tbl_num:
            t_candidates = [
                tbl_num,
                f"Table {tbl_num}",
                tbl_num.replace("Table ", "").strip()
            ]
            b_stmt = select(Bill).where(
                Bill.restaurant_id == rest.id,
                Bill.table_number.in_(t_candidates),
                Bill.status.notin_(["CLOSED", "CANCELLED", "PAID"]),
                Bill.payment_status != "PAID"
            ).order_by(Bill.created_at.desc()).limit(1)
            b_res = await db.execute(b_stmt)
            existing_bill = b_res.scalar_one_or_none()

        # IMMUTABILITY GUARANTEE: If already paid or closed, do not rewrite!
        if existing_bill and existing_bill.payment_status == "PAID":
            return existing_bill

        # Calculate authoritative numbers
        calc_data = await cls.calculate_table_bill_data(
            rest=rest,
            table_number=tbl_num,
            table_session_id=sess_id or (existing_bill.table_session_id if existing_bill else None),
            table_id=table_id or (existing_bill.table_id if existing_bill else None),
            discount_percentage=discount_percentage,
            discount_amount=discount_amount,
            service_charge_percentage=service_charge_percentage,
            order_type=order_type,
            db=db
        )

        effective_sess_id = calc_data["tableSessionId"] or sess_id or f"sess-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"

        if existing_bill:
            # Update existing open / unpaid bill record
            existing_bill.subtotal = calc_data["subtotal"]
            existing_bill.discount_amount = calc_data["discountAmount"]
            existing_bill.discount_percentage = calc_data["discountPercentage"]
            existing_bill.service_charge_amount = calc_data["serviceChargeAmount"]
            existing_bill.service_charge_percentage = calc_data["serviceChargePercentage"]
            existing_bill.tax_percentage = calc_data["taxPercentage"]
            existing_bill.tax_amount = calc_data["taxAmount"]
            existing_bill.round_off_amount = calc_data["roundOffAmount"]
            existing_bill.grand_total = calc_data["grandTotal"]
            existing_bill.tax_breakdown_json = calc_data["taxBreakdown"]
            existing_bill.items_snapshot_json = calc_data["items"]
            existing_bill.orders_snapshot_json = calc_data["orders"]
            if payment_method:
                existing_bill.payment_method = payment_method
            existing_bill.status = "BILL_REQUESTED"
            from app.modules.business_day.models import BusinessDay
            bday_q = select(BusinessDay.id).where(
                BusinessDay.restaurant_id == rest.id,
                BusinessDay.status == "OPEN"
            ).order_by(BusinessDay.opened_at.desc()).limit(1)
            bday_res = await db.execute(bday_q)
            active_bday_id = bday_res.scalar_one_or_none()
            if active_bday_id and not getattr(existing_bill, "business_day_id", None):
                existing_bill.business_day_id = active_bday_id

            # Update Table & Session status
            await cls._sync_table_status(rest.id, tbl_num, effective_sess_id, existing_bill.id, db)
            await db.commit()
            await db.refresh(existing_bill)
            return existing_bill

        # Otherwise: Generate next sequential invoice number and create new Bill
        prefix = rest.invoice_prefix or "INV-"
        current_num = int(rest.invoice_starting_number or 1001)

        max_inv_stmt = select(func.count(Bill.id)).where(Bill.restaurant_id == rest.id)
        inv_count_res = await db.execute(max_inv_stmt)
        total_bills = inv_count_res.scalar() or 0
        invoice_number = f"{prefix}{current_num + total_bills}"

        from app.modules.business_day.models import BusinessDay
        bday_q = select(BusinessDay.id).where(
            BusinessDay.restaurant_id == rest.id,
            BusinessDay.status == "OPEN"
        ).order_by(BusinessDay.opened_at.desc()).limit(1)
        bday_res = await db.execute(bday_q)
        active_bday_id = bday_res.scalar_one_or_none()

        bill_id = f"bill-{uuid.uuid4().hex[:12]}"
        new_bill = Bill(
            id=bill_id,
            restaurant_id=rest.id,
            table_id=table_id or calc_data["tableId"] or f"table-{tbl_num}",
            table_number=tbl_num,
            table_session_id=effective_sess_id,
            business_day_id=active_bday_id,
            invoice_number=invoice_number,
            subtotal=calc_data["subtotal"],
            discount_amount=calc_data["discountAmount"],
            discount_percentage=calc_data["discountPercentage"],
            service_charge_amount=calc_data["serviceChargeAmount"],
            service_charge_percentage=calc_data["serviceChargePercentage"],
            tax_percentage=calc_data["taxPercentage"],
            tax_amount=calc_data["taxAmount"],
            round_off_amount=calc_data["roundOffAmount"],
            grand_total=calc_data["grandTotal"],
            status="BILL_REQUESTED",
            payment_status="UNPAID",
            payment_method=payment_method,
            tax_breakdown_json=calc_data["taxBreakdown"],
            items_snapshot_json=calc_data["items"],
            orders_snapshot_json=calc_data["orders"],
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(new_bill)

        await cls._sync_table_status(rest.id, tbl_num, effective_sess_id, bill_id, db)
        await db.commit()
        await db.refresh(new_bill)
        return new_bill

    @staticmethod
    async def _sync_table_status(
        restaurant_id: str,
        table_number: str,
        table_session_id: str,
        bill_id: str,
        db: AsyncSession
    ) -> None:
        t_candidates = [
            table_number,
            f"Table {table_number}",
            table_number.replace("Table ", "").strip()
        ]
        tbl_stmt = select(Table).where(
            Table.restaurant_id == restaurant_id,
            Table.table_number.in_(t_candidates)
        )
        tbl_res = await db.execute(tbl_stmt)
        tbl = tbl_res.scalar_one_or_none()
        if tbl:
            tbl.status = "BILL_REQUESTED"

        if table_session_id:
            sess_stmt = select(TableSession).where(TableSession.id == table_session_id)
            sess_res = await db.execute(sess_stmt)
            sess = sess_res.scalar_one_or_none()
            if sess:
                sess.status = "BILL_REQUESTED"
                sess.bill_id = bill_id

    @classmethod
    async def generate_billing_diagnostic(
        cls,
        order_or_bill_id: str,
        restaurant_id: str,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Non-mutating diagnostic utility (Section 11) for inspecting discrepancies:
        Accepts an order ID or bill ID and reports persisted line items, price snapshots,
        subtotal, taxes, charges, and layer comparison.
        """
        clean_id = (order_or_bill_id or "").strip()
        report: Dict[str, Any] = {
            "queryId": clean_id,
            "restaurantId": restaurant_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "targetType": None,
            "persistedRecord": None,
            "calculatedAuthoritative": None,
            "discrepancies": [],
            "status": "HEALTHY"
        }

        # 1. Search for Bill
        bill_stmt = select(Bill).where(Bill.id == clean_id, Bill.restaurant_id == restaurant_id)
        b_res = await db.execute(bill_stmt)
        bill = b_res.scalar_one_or_none()

        if bill:
            report["targetType"] = "BILL"
            rest_stmt = select(Restaurant).where(Restaurant.id == restaurant_id)
            r_res = await db.execute(rest_stmt)
            rest = r_res.scalar_one_or_none()

            calc = await cls.calculate_table_bill_data(
                rest=rest,
                table_number=bill.table_number,
                table_session_id=bill.table_session_id,
                table_id=bill.table_id,
                discount_percentage=bill.discount_percentage,
                discount_amount=bill.discount_amount,
                service_charge_percentage=bill.service_charge_percentage,
                db=db
            )

            report["persistedRecord"] = {
                "id": bill.id,
                "invoiceNumber": bill.invoice_number,
                "subtotal": bill.subtotal,
                "discountAmount": bill.discount_amount,
                "serviceChargeAmount": bill.service_charge_amount,
                "taxAmount": bill.tax_amount,
                "roundOffAmount": bill.round_off_amount,
                "grandTotal": bill.grand_total,
                "paymentStatus": bill.payment_status,
                "status": bill.status,
            }
            report["calculatedAuthoritative"] = {
                "subtotal": calc["subtotal"],
                "discountAmount": calc["discountAmount"],
                "serviceChargeAmount": calc["serviceChargeAmount"],
                "taxAmount": calc["taxAmount"],
                "roundOffAmount": calc["roundOffAmount"],
                "grandTotal": calc["grandTotal"],
            }

            diffs = []
            if abs(bill.subtotal - calc["subtotal"]) > 0.01:
                diffs.append(f"Subtotal mismatch: persisted={bill.subtotal} vs recalculated={calc['subtotal']}")
            if abs(bill.tax_amount - calc["taxAmount"]) > 0.01:
                diffs.append(f"Tax mismatch: persisted={bill.tax_amount} vs recalculated={calc['taxAmount']}")
            if abs(bill.grand_total - calc["grandTotal"]) > 0.01:
                diffs.append(f"Grand Total mismatch: persisted={bill.grand_total} vs recalculated={calc['grandTotal']}")

            report["discrepancies"] = diffs
            if diffs:
                report["status"] = "DISCREPANCY_DETECTED"
            return report

        # 2. Search for Order
        ord_stmt = select(Order).where(Order.id == clean_id, Order.restaurant_id == restaurant_id)
        o_res = await db.execute(ord_stmt)
        order = o_res.scalar_one_or_none()

        if order:
            report["targetType"] = "ORDER"
            rest_stmt = select(Restaurant).where(Restaurant.id == restaurant_id)
            r_res = await db.execute(rest_stmt)
            rest = r_res.scalar_one_or_none()

            items = order.items_json or []
            item_sum = round(sum(float(i.get("price") or 0.0) * int(i.get("quantity") or 1) for i in items), 2)
            ord_calc = await cls.calculate_order_totals(items, rest, db)

            report["persistedRecord"] = {
                "id": order.id,
                "orderNumber": order.order_number,
                "subtotal": order.subtotal,
                "taxAmount": order.tax_amount,
                "totalAmount": order.total_amount,
                "status": order.status,
            }
            report["calculatedAuthoritative"] = {
                "itemSum": item_sum,
                "subtotal": ord_calc["subtotal"],
                "taxAmount": ord_calc["taxAmount"],
                "totalAmount": ord_calc["totalAmount"],
            }

            diffs = []
            if abs(order.subtotal - item_sum) > 0.01:
                diffs.append(f"Order subtotal mismatch: stored={order.subtotal} vs items_sum={item_sum}")
            if abs(order.total_amount - ord_calc["totalAmount"]) > 0.01:
                diffs.append(f"Order total mismatch: stored={order.total_amount} vs authoritative={ord_calc['totalAmount']}")

            report["discrepancies"] = diffs
            if diffs:
                report["status"] = "DISCREPANCY_DETECTED"
            return report

        report["status"] = "NOT_FOUND"
        return report

from typing import List, Dict, Any, Optional
from app.modules.taxes.models import Tax

def calculate_taxes(
    items: List[Dict[str, Any]],
    active_taxes: List[Tax],
    tax_categories_map: Dict[str, List[str]],
    tax_items_map: Dict[str, List[str]],
    order_type: str = "DINE_IN",
    discount_amount: float = 0.0,
    discount_percentage: float = 0.0
) -> Dict[str, Any]:
    """
    Authoritative backend tax calculation engine.
    
    Priority Resolution Order per item:
    1. Menu Item specific tax (applies_to == "ITEM" and item_id matches)
    2. Category tax (applies_to == "CATEGORY" and category_id matches)
    3. Restaurant default tax (applies_to == "ORDER")
    
    Supports:
    - Multiple taxes on same order/item
    - Percentage vs Fixed Amount
    - Excluded vs Included taxes (properly combining multi-inclusive rates)
    - Order type filtering (Dine-in, Takeaway, Delivery)
    - Pro-rated discount deduction prior to taxable basis calculation
    """
    normalized_order_type = (order_type or "DINE_IN").upper()

    # Filter taxes applicable to the current order type
    applicable_taxes: List[Tax] = []
    for t in active_taxes:
        if getattr(t, "status", "ACTIVE") != "ACTIVE":
            continue
        valid_types = getattr(t, "applicable_order_types", None) or ["DINE_IN", "TAKEAWAY", "DELIVERY"]
        if isinstance(valid_types, list) and len(valid_types) > 0:
            upper_types = [str(x).upper() for x in valid_types]
            if normalized_order_type not in upper_types:
                continue
        applicable_taxes.append(t)

    # 1. First pass: compute gross item totals and gross subtotal
    subtotal = 0.0
    item_rows = []
    for item in items:
        item_id = str(item.get("menuItemId") or item.get("menu_item_id") or item.get("id") or "")
        cat_id = str(item.get("categoryId") or item.get("category_id") or item.get("category") or "")
        raw_price = item.get("price")
        if raw_price is None:
            raw_price = item.get("unit_price")
        if raw_price is None:
            raw_price = item.get("unitPrice")
        price = float(raw_price or 0.0)
        qty = int(item.get("quantity") or 1)
        if price == 0.0 and item.get("totalPrice"):
            price = round(float(item.get("totalPrice")) / max(1, qty), 2)
        elif price == 0.0 and item.get("total_price"):
            price = round(float(item.get("total_price")) / max(1, qty), 2)
        item_gross = round(price * qty, 2)
        subtotal = round(subtotal + item_gross, 2)
        item_rows.append({
            "item_id": item_id,
            "cat_id": cat_id,
            "price": price,
            "qty": qty,
            "item_gross": item_gross,
        })

    # 2. Determine effective discount and taxable subtotal
    eff_discount = round(float(discount_amount or 0.0), 2)
    if discount_percentage and discount_percentage > 0 and eff_discount == 0.0:
        eff_discount = round(subtotal * (discount_percentage / 100.0), 2)
    eff_discount = min(eff_discount, subtotal)
    taxable_subtotal = max(0.0, round(subtotal - eff_discount, 2))

    tax_totals: Dict[str, Dict[str, Any]] = {}
    for t in applicable_taxes:
        rate_val = float(t.rate or 0.0) if t.type == "PERCENTAGE" else float(getattr(t, "fixed_amount", 0.0) or 0.0)
        tax_totals[t.id] = {
            "tax_id": t.id,
            "name": t.name,
            "type": t.type,
            "rate": rate_val,
            "amount": 0.0,
            "is_inclusive": bool(t.is_inclusive),
        }

    # 3. Second pass: Calculate taxable base per item (prorated discount) and apply matched taxes
    accumulated_item_taxable = 0.0
    for idx, row in enumerate(item_rows):
        item_id = row["item_id"]
        cat_id = row["cat_id"]
        qty = row["qty"]
        item_gross = row["item_gross"]

        if subtotal > 0 and eff_discount > 0:
            if idx == len(item_rows) - 1:
                # Reconcile rounding cents on last item
                item_taxable = max(0.0, round(taxable_subtotal - accumulated_item_taxable, 2))
            else:
                disc_ratio = eff_discount / subtotal
                item_disc = round(item_gross * disc_ratio, 2)
                item_taxable = max(0.0, round(item_gross - item_disc, 2))
                accumulated_item_taxable = round(accumulated_item_taxable + item_taxable, 2)
        else:
            item_taxable = item_gross

        # Priority 1: Item-level taxes
        item_taxes = [
            t for t in applicable_taxes
            if getattr(t, "applies_to", "ORDER") == "ITEM" and item_id in tax_items_map.get(t.id, [])
        ]

        # Priority 2: Category-level taxes (if no item-level tax matched)
        cat_taxes = []
        if not item_taxes and cat_id:
            cat_taxes = [
                t for t in applicable_taxes
                if getattr(t, "applies_to", "ORDER") == "CATEGORY" and cat_id in tax_categories_map.get(t.id, [])
            ]

        # Priority 3: Entire Order default taxes
        order_taxes = [t for t in applicable_taxes if getattr(t, "applies_to", "ORDER") == "ORDER"]

        # Final taxes for this item
        matched_taxes = item_taxes or cat_taxes or order_taxes

        # Deduplicate by tax ID
        seen_ids = set()
        unique_matched_taxes = []
        for t in matched_taxes:
            if t.id not in seen_ids:
                seen_ids.add(t.id)
                unique_matched_taxes.append(t)

        # Separate inclusive and exclusive taxes
        incl_pct_taxes = [t for t in unique_matched_taxes if t.is_inclusive and t.type == "PERCENTAGE"]
        incl_fixed_taxes = [t for t in unique_matched_taxes if t.is_inclusive and t.type != "PERCENTAGE"]
        excl_taxes = [t for t in unique_matched_taxes if not t.is_inclusive]

        # Process Inclusive Fixed Taxes first
        fixed_incl_sum = sum(float(getattr(t, "fixed_amount", 0.0) or 0.0) * qty for t in incl_fixed_taxes)
        item_taxable_after_fixed = max(0.0, round(item_taxable - fixed_incl_sum, 2))
        for t in incl_fixed_taxes:
            t_fixed = float(getattr(t, "fixed_amount", 0.0) or 0.0)
            t_amt = min(round(t_fixed * qty, 2), item_taxable)
            if t.id in tax_totals:
                tax_totals[t.id]["amount"] = round(tax_totals[t.id]["amount"] + t_amt, 2)

        # Process Inclusive Percentage Taxes collectively to preserve compound net base
        if incl_pct_taxes:
            sum_incl_rate = sum(float(t.rate or 0.0) for t in incl_pct_taxes)
            item_net_base = round(item_taxable_after_fixed / (1.0 + (sum_incl_rate / 100.0)), 4) if sum_incl_rate > 0 else item_taxable_after_fixed
            for t in incl_pct_taxes:
                t_amt = round(item_net_base * (float(t.rate or 0.0) / 100.0), 2)
                if t.id in tax_totals:
                    tax_totals[t.id]["amount"] = round(tax_totals[t.id]["amount"] + t_amt, 2)

        # Process Exclusive Taxes
        for t in excl_taxes:
            if t.type == "PERCENTAGE":
                t_amt = round(item_taxable * (float(t.rate or 0.0) / 100.0), 2)
            else:
                t_fixed = float(getattr(t, "fixed_amount", 0.0) or 0.0)
                t_amt = round(t_fixed * qty, 2)
            if t.id in tax_totals:
                tax_totals[t.id]["amount"] = round(tax_totals[t.id]["amount"] + t_amt, 2)

    total_excluded_tax = 0.0
    total_included_tax = 0.0
    tax_breakdown = []

    for t_id, data in tax_totals.items():
        if data["amount"] >= 0:
            tax_breakdown.append(data)
            if data["is_inclusive"]:
                total_included_tax = round(total_included_tax + data["amount"], 2)
            else:
                total_excluded_tax = round(total_excluded_tax + data["amount"], 2)

    subtotal = round(subtotal, 2)
    total_excluded_tax = round(total_excluded_tax, 2)
    total_included_tax = round(total_included_tax, 2)
    grand_total = round(taxable_subtotal + total_excluded_tax, 2)

    return {
        "subtotal": subtotal,
        "discount_amount": eff_discount,
        "discount_percentage": discount_percentage,
        "taxable_amount": taxable_subtotal,
        "total_excluded_tax": total_excluded_tax,
        "total_included_tax": total_included_tax,
        "total_tax_amount": total_excluded_tax,
        "grand_total": grand_total,
        "tax_breakdown": tax_breakdown,
    }

from typing import List, Dict, Any, Optional
from app.modules.taxes.models import Tax

def calculate_taxes(
    items: List[Dict[str, Any]],
    active_taxes: List[Tax],
    tax_categories_map: Dict[str, List[str]],
    tax_items_map: Dict[str, List[str]],
    order_type: str = "DINE_IN"
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
    - Excluded vs Included taxes
    - Order type filtering (Dine-in, Takeaway, Delivery)
    """
    normalized_order_type = (order_type or "DINE_IN").upper()

    # Filter taxes applicable to the current order type
    applicable_taxes: List[Tax] = []
    for t in active_taxes:
        if t.status != "ACTIVE":
            continue
        valid_types = t.applicable_order_types or ["DINE_IN", "TAKEAWAY", "DELIVERY"]
        if isinstance(valid_types, list) and len(valid_types) > 0:
            upper_types = [str(x).upper() for x in valid_types]
            if normalized_order_type not in upper_types:
                continue
        applicable_taxes.append(t)

    subtotal = 0.0
    tax_totals: Dict[str, Dict[str, Any]] = {}

    for t in applicable_taxes:
        rate_val = t.rate if t.type == "PERCENTAGE" else (t.fixed_amount or 0.0)
        tax_totals[t.id] = {
            "tax_id": t.id,
            "name": t.name,
            "type": t.type,
            "rate": rate_val,
            "amount": 0.0,
            "is_inclusive": t.is_inclusive,
        }

    for item in items:
        item_id = str(item.get("menuItemId") or item.get("menu_item_id") or item.get("id") or "")
        cat_id = str(item.get("categoryId") or item.get("category_id") or item.get("category") or "")
        price = float(item.get("price") or item.get("unit_price") or 0.0)
        qty = int(item.get("quantity") or 1)
        item_gross = round(price * qty, 2)
        subtotal += item_gross

        # Priority 1: Item-level taxes
        item_taxes = [
            t for t in applicable_taxes
            if t.applies_to == "ITEM" and item_id in tax_items_map.get(t.id, [])
        ]
        
        # Priority 2: Category-level taxes (if no item-level tax matched)
        cat_taxes = []
        if not item_taxes and cat_id:
            cat_taxes = [
                t for t in applicable_taxes
                if t.applies_to == "CATEGORY" and cat_id in tax_categories_map.get(t.id, [])
            ]

        # Priority 3: Entire Order default taxes
        order_taxes = [t for t in applicable_taxes if t.applies_to == "ORDER"]

        # Final taxes for this item
        matched_taxes = item_taxes or cat_taxes or order_taxes

        # Deduplicate by tax ID
        seen_ids = set()
        unique_matched_taxes = []
        for t in matched_taxes:
            if t.id not in seen_ids:
                seen_ids.add(t.id)
                unique_matched_taxes.append(t)

        for t in unique_matched_taxes:
            tax_amt = 0.0
            if not t.is_inclusive:
                # Excluded Tax
                if t.type == "PERCENTAGE":
                    tax_amt = item_gross * (t.rate / 100.0)
                else:
                    fixed = t.fixed_amount or 0.0
                    tax_amt = fixed * qty
            else:
                # Included Tax
                if t.type == "PERCENTAGE":
                    tax_amt = item_gross - (item_gross / (1.0 + (t.rate / 100.0)))
                else:
                    fixed = t.fixed_amount or 0.0
                    tax_amt = min(fixed * qty, item_gross)

            tax_amt = round(tax_amt, 2)
            if t.id in tax_totals:
                tax_totals[t.id]["amount"] = round(tax_totals[t.id]["amount"] + tax_amt, 2)

    total_excluded_tax = 0.0
    total_included_tax = 0.0
    tax_breakdown = []

    for t_id, data in tax_totals.items():
        if data["amount"] >= 0:
            tax_breakdown.append(data)
            if data["is_inclusive"]:
                total_included_tax += data["amount"]
            else:
                total_excluded_tax += data["amount"]

    subtotal = round(subtotal, 2)
    total_excluded_tax = round(total_excluded_tax, 2)
    total_included_tax = round(total_included_tax, 2)
    grand_total = round(subtotal + total_excluded_tax, 2)

    return {
        "subtotal": subtotal,
        "taxable_amount": subtotal,
        "total_excluded_tax": total_excluded_tax,
        "total_included_tax": total_included_tax,
        "total_tax_amount": total_excluded_tax,
        "grand_total": grand_total,
        "tax_breakdown": tax_breakdown,
    }

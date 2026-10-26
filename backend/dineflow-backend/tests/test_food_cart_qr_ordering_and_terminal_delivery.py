import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database.connection import AsyncSessionLocal
from app.modules.restaurants.models import Restaurant
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.orders.models import Order
from app.core.security.jwt import create_access_token


@pytest.mark.asyncio
async def test_food_cart_qr_checkout_and_terminal_delivery_end_to_end():
    """
    Comprehensive regression test suite for:
    1. Public QR checkout creates real persisted order with coupon and PENDING status.
    2. Correct cart's Order Receiving Terminal fetches the order.
    3. Another cart CANNOT fetch or see the order (strict multi-tenant isolation).
    4. Unavailable/sold-out menu items reject orders with HTTP 400.
    5. Duplicate order creation idempotency protection.
    6. Terminal status progression (PENDING -> PREPARING -> READY).
    7. Customer tracking page lookup returns accurate status.
    8. Pickup coupon redemption enforces single-use and tenant scoping.
    """
    cart_a_id = f"test-cart-alpha-{uuid.uuid4().hex[:8]}"
    cart_b_id = f"test-cart-beta-{uuid.uuid4().hex[:8]}"

    async with AsyncSessionLocal() as db:
        # Seed Cart A (The receiving cart)
        cart_a = Restaurant(
            id=cart_a_id,
            name="Alpha Burger Cart",
            slug=cart_a_id,
            public_slug=cart_a_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            owner_uid="uid_alpha_owner",
            owner_email="alpha@dinely.food",
        )
        # Seed Cart B (Tenant isolation control)
        cart_b = Restaurant(
            id=cart_b_id,
            name="Beta Taco Cart",
            slug=cart_b_id,
            public_slug=cart_b_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            owner_uid="uid_beta_owner",
            owner_email="beta@dinely.food",
        )
        db.add_all([cart_a, cart_b])

        cat_a = MenuCategory(
            id=f"cat-a-{uuid.uuid4().hex[:6]}",
            restaurant_id=cart_a_id,
            name="Burgers & Fries",
            sort_order=1
        )
        db.add(cat_a)

        # Available dish item
        item_available = MenuItem(
            id=f"item-avail-{uuid.uuid4().hex[:6]}",
            restaurant_id=cart_a_id,
            category_id=cat_a.id,
            name="Classic Masala Burger",
            price=120.0,
            is_available=True,
            track_inventory=True,
            stock_quantity=15,
        )
        # Sold-out dish item
        item_sold_out = MenuItem(
            id=f"item-sold-{uuid.uuid4().hex[:6]}",
            restaurant_id=cart_a_id,
            category_id=cat_a.id,
            name="Double Truffle Burger",
            price=250.0,
            is_available=False,
            track_inventory=True,
            stock_quantity=0,
        )
        db.add_all([item_available, item_sold_out])
        await db.commit()
        item_avail_id = item_available.id
        item_sold_id = item_sold_out.id

    token_a = create_access_token(
        subject="uid_alpha_owner",
        scope="OWNER",
        extra_claims={
            "uid": "uid_alpha_owner",
            "email": "alpha@dinely.food",
            "role": "OWNER",
            "restaurant_id": cart_a_id,
        }
    )
    headers_owner_a = {"Authorization": f"Bearer {token_a}"}

    token_b = create_access_token(
        subject="uid_beta_owner",
        scope="OWNER",
        extra_claims={
            "uid": "uid_beta_owner",
            "email": "beta@dinely.food",
            "role": "OWNER",
            "restaurant_id": cart_b_id,
        }
    )
    headers_owner_b = {"Authorization": f"Bearer {token_b}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # TEST 1: Sold out item cannot be ordered via QR menu (HTTP 400)
        sold_out_payload = {
            "restaurantId": cart_a_id,
            "tableNumber": "PICKUP",
            "orderType": "TAKEAWAY",
            "customerName": "Guest A",
            "items": [
                {
                    "menuItemId": item_sold_id,
                    "name": "Double Truffle Burger",
                    "price": 250.0,
                    "quantity": 1,
                    "targetDestination": "KITCHEN"
                }
            ]
        }
        res_sold = await client.post("/api/v1/orders", json=sold_out_payload)
        assert res_sold.status_code == 400, f"Expected 400 for sold-out item, got {res_sold.status_code}: {res_sold.text}"
        assert "unavailable or sold out" in res_sold.text

        # TEST 2: Legitimate Customer QR Order Checkout
        order_client_id = f"ord-test-qr-{uuid.uuid4().hex[:8]}"
        qr_order_payload = {
            "id": order_client_id,
            "idempotencyKey": order_client_id,
            "restaurantId": cart_a_id,
            "tableNumber": "PICKUP",
            "orderType": "TAKEAWAY",
            "customerName": "Rohan Sharma",
            "customerPhone": "+91 98765 43210",
            "notes": "Extra crispy, no onion please",
            "paymentMethod": "CASH",
            "items": [
                {
                    "menuItemId": item_avail_id,
                    "name": "Classic Masala Burger",
                    "price": 120.0,
                    "quantity": 2,
                    "targetDestination": "KITCHEN"
                }
            ]
        }
        res_order = await client.post(
            "/api/v1/orders",
            json=qr_order_payload,
            headers={"Idempotency-Key": order_client_id}
        )
        assert res_order.status_code == 201, f"Expected 201 Created, got {res_order.status_code}: {res_order.text}"
        order_data = res_order.json()
        created_order_id = order_data["id"]
        pickup_coupon = order_data.get("pickup_code") or order_data.get("pickupCode")
        assert pickup_coupon, "Order response must include a generated pickup coupon code"
        assert order_data["status"] == "PENDING"
        assert order_data["restaurant_id"] == cart_a_id
        assert order_data["total_amount"] >= 240.0

        # TEST 3: Idempotency Protection - Double Submit Returns Same Order
        res_dup = await client.post(
            "/api/v1/orders",
            json=qr_order_payload,
            headers={"Idempotency-Key": order_client_id}
        )
        assert res_dup.status_code in [200, 201]
        dup_data = res_dup.json()
        assert dup_data["id"] == created_order_id, "Idempotency retry must return existing order ID"
        assert dup_data.get("pickup_code") == pickup_coupon

        # TEST 4: Food Cart A Order Receiving Terminal Fetches Real Order
        res_term_a = await client.get(
            f"/api/v1/orders/restaurant/{cart_a_id}",
            headers=headers_owner_a
        )
        assert res_term_a.status_code == 200, f"Terminal A failed to fetch orders: {res_term_a.text}"
        orders_a = res_term_a.json()
        matching_orders = [o for o in orders_a if o["id"] == created_order_id]
        assert len(matching_orders) == 1, f"Created QR order {created_order_id} must appear on Cart A terminal"
        card = matching_orders[0]
        assert card["pickup_code"] == pickup_coupon
        assert card["status"] == "PENDING"
        assert len(card["items"]) == 1
        assert card["items"][0]["quantity"] == 2

        # TEST 5: Cart B Terminal CANNOT View Cart A Orders (Multi-Tenant Isolation)
        res_term_b = await client.get(
            f"/api/v1/orders/restaurant/{cart_b_id}",
            headers=headers_owner_b
        )
        assert res_term_b.status_code == 200
        orders_b = res_term_b.json()
        cart_b_matching = [o for o in orders_b if o["id"] == created_order_id]
        assert len(cart_b_matching) == 0, "Cart A QR order must NEVER leak into Cart B terminal"

        # Cross-tenant query attempt is forbidden
        res_cross = await client.get(
            f"/api/v1/orders/restaurant/{cart_a_id}",
            headers=headers_owner_b
        )
        assert res_cross.status_code == 403, "Cart B owner must be forbidden from querying Cart A orders"

        # TEST 6: Terminal Advances Order Status: PENDING -> PREPARING
        res_prep = await client.put(
            f"/api/v1/orders/{created_order_id}/status",
            json={"status": "PREPARING", "kitchenStatus": "PREPARING"},
            headers=headers_owner_a
        )
        assert res_prep.status_code == 200
        assert res_prep.json()["status"] == "PREPARING"

        # TEST 7: Customer Digital Voucher Lookup Reflects PREPARING
        res_lookup_prep = await client.get(
            f"/api/v1/orders/lookup-code/{pickup_coupon}?restaurantId={cart_a_id}"
        )
        assert res_lookup_prep.status_code == 200
        assert res_lookup_prep.json()["status"] == "PREPARING"

        # Attempting redemption while PREPARING fails without force (HTTP 400)
        res_redeem_early = await client.post(
            "/api/v1/orders/redeem-code",
            json={"code": pickup_coupon, "restaurantId": cart_a_id, "force": False}
        )
        assert res_redeem_early.status_code == 400, "Early redemption before READY must be rejected"
        assert "not yet Ready" in res_redeem_early.text

        # TEST 8: Terminal Advances Order Status: PREPARING -> READY
        res_ready = await client.put(
            f"/api/v1/orders/{created_order_id}/status",
            json={"status": "READY", "kitchenStatus": "READY"},
            headers=headers_owner_a
        )
        assert res_ready.status_code == 200
        assert res_ready.json()["status"] == "READY"

        # Customer Tracking Page reflects READY
        res_lookup_ready = await client.get(
            f"/api/v1/orders/lookup-code/{pickup_coupon}?restaurantId={cart_a_id}"
        )
        assert res_lookup_ready.status_code == 200
        assert res_lookup_ready.json()["status"] == "READY"

        # TEST 9: Terminal Verifies and Redeems Coupon at Counter Handover
        # Cart B cannot redeem Cart A coupon
        res_redeem_b = await client.post(
            "/api/v1/orders/redeem-code",
            json={"code": pickup_coupon, "restaurantId": cart_b_id}
        )
        assert res_redeem_b.status_code in [403, 404], "Cart B cannot redeem Cart A coupon"

        # Cart A redeems successfully
        res_redeem_a = await client.post(
            "/api/v1/orders/redeem-code",
            json={"code": pickup_coupon, "restaurantId": cart_a_id, "redeemedBy": "Counter Staff"}
        )
        assert res_redeem_a.status_code == 200, f"Coupon redemption failed: {res_redeem_a.text}"
        redeemed_order = res_redeem_a.json()
        assert redeemed_order["status"] == "COMPLETED"
        assert redeemed_order["pickup_status"] == "REDEEMED"

        # Duplicate redemption fails (single-use coupon enforcement)
        res_redeem_dup = await client.post(
            "/api/v1/orders/redeem-code",
            json={"code": pickup_coupon, "restaurantId": cart_a_id}
        )
        assert res_redeem_dup.status_code == 400, "Duplicate redemption must fail"
        assert "already been redeemed" in res_redeem_dup.text

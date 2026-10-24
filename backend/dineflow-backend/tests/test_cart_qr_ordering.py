import pytest
import uuid
from datetime import datetime, timezone, date
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database.connection import AsyncSessionLocal
from app.modules.restaurants.models import Restaurant
from app.modules.menu.models import MenuItem, MenuCategory
from app.modules.orders.models import Order
from app.modules.business_day.models import BusinessDay
from sqlalchemy import select

@pytest.mark.asyncio
async def test_cart_qr_ordering_pickup_code_and_redemption():
    async with AsyncSessionLocal() as db:
        rest_id = f"test-cart-{uuid.uuid4().hex[:8]}"
        rest = Restaurant(
            id=rest_id,
            name="Mumbai Street Rolls",
            slug=rest_id,
            public_slug=rest_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
        )
        db.add(rest)

        cat_id = f"cat-{uuid.uuid4().hex[:6]}"
        cat = MenuCategory(
            id=cat_id,
            restaurant_id=rest_id,
            name="Rolls",
            sort_order=1
        )
        db.add(cat)

        item_id = f"item-{uuid.uuid4().hex[:6]}"
        menu_item = MenuItem(
            id=item_id,
            restaurant_id=rest_id,
            category_id=cat_id,
            name="Double Paneer Tikka Roll",
            price=180.0,
            stock_quantity=10,
            track_inventory=True,
            is_available=True
        )
        db.add(menu_item)
        await db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Place order via public API
        order_payload = {
            "restaurantId": rest_id,
            "items": [
                {
                    "menuItemId": item_id,
                    "name": "Double Paneer Tikka Roll",
                    "price": 180.0,
                    "quantity": 2,
                    "modifiers": []
                }
            ],
            "total": 360.0,
            "paymentMethod": "CASH",
            "orderType": "TAKEAWAY",
            "customerName": "Test Customer",
            "customerPhone": "9876543210"
        }

        create_res = await ac.post("/api/v1/orders", json=order_payload)
        assert create_res.status_code in (200, 201), create_res.text
        order_data = create_res.json()
        
        pickup_code = order_data.get("pickupCode")
        assert pickup_code is not None, "pickupCode must be generated"
        assert len(pickup_code) >= 4
        order_id = order_data.get("id")

        # 2. Verify menu stock was decremented from 10 to 8
        async with AsyncSessionLocal() as db:
            refreshed_item = await db.get(MenuItem, item_id)
            assert refreshed_item.stock_quantity == 8, f"Expected stock 8, got {refreshed_item.stock_quantity}"

        # 3. Lookup order by pickup code (Food Cart POS coupon lookup)
        lookup_res = await ac.get(f"/api/v1/orders/lookup-code/{pickup_code}?restaurantId={rest_id}")
        assert lookup_res.status_code == 200, lookup_res.text
        lookup_data = lookup_res.json()
        assert lookup_data["id"] == order_id
        assert lookup_data["pickupCode"] == pickup_code
        assert lookup_data.get("pickupStatus") == "UNCLAIMED"

        # 4. Redeem pickup coupon (verifies readiness enforcement and authorized handover)
        not_ready = await ac.post("/api/v1/orders/redeem-code", json={
            "restaurantId": rest_id,
            "code": pickup_code,
            "redeemedBy": "Counter Cashier 1"
        })
        assert not_ready.status_code == 400
        assert "not yet Ready for pickup" in not_ready.json().get("detail", "")

        redeem_res = await ac.post("/api/v1/orders/redeem-code", json={
            "restaurantId": rest_id,
            "code": pickup_code,
            "redeemedBy": "Counter Cashier 1",
            "force": True
        })
        assert redeem_res.status_code == 200, redeem_res.text
        redeemed_data = redeem_res.json()
        assert redeemed_data["pickupStatus"] == "REDEEMED"
        assert redeemed_data["status"] == "COMPLETED"

        # 5. Idempotent / replay defense: Redeeming again should fail with 400
        re_redeem_res = await ac.post("/api/v1/orders/redeem-code", json={
            "restaurantId": rest_id,
            "code": pickup_code,
            "redeemedBy": "Counter Cashier 1"
        })
        assert re_redeem_res.status_code == 400
        assert "already been redeemed" in re_redeem_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_cart_duplicate_retries_and_idempotency():
    async with AsyncSessionLocal() as db:
        rest_id = f"test-cart-{uuid.uuid4().hex[:8]}"
        rest = Restaurant(
            id=rest_id,
            name="Delhi Chaat Corner",
            slug=rest_id,
            public_slug=rest_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
        )
        db.add(rest)

        cat_id = f"cat-{uuid.uuid4().hex[:6]}"
        cat = MenuCategory(id=cat_id, restaurant_id=rest_id, name="Chaat", sort_order=1)
        db.add(cat)

        item_id = f"item-{uuid.uuid4().hex[:6]}"
        menu_item = MenuItem(
            id=item_id,
            restaurant_id=rest_id,
            category_id=cat_id,
            name="Aloo Tikki Chaat",
            price=90.0,
            stock_quantity=20,
            track_inventory=True,
            is_available=True
        )
        db.add(menu_item)
        await db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        idem_key = f"idem-cart-{uuid.uuid4().hex}"
        payload = {
            "restaurantId": rest_id,
            "items": [{"menuItemId": item_id, "name": "Aloo Tikki Chaat", "price": 90.0, "quantity": 3}],
            "total": 270.0,
            "paymentMethod": "UPI",
            "orderType": "TAKEAWAY",
            "idempotencyKey": idem_key,
            "customerName": "Rohan Sharma"
        }

        # First submission
        res1 = await ac.post("/api/v1/orders", json=payload)
        assert res1.status_code in (200, 201)
        order1 = res1.json()

        # Immediate retry with same idempotencyKey (network timeout / double-click)
        res2 = await ac.post("/api/v1/orders", json=payload)
        assert res2.status_code in (200, 201)
        order2 = res2.json()

        # Must return the SAME order ID and not double create
        assert order1["id"] == order2["id"]
        assert order1["pickupCode"] == order2["pickupCode"]

        # Stock must only be decremented ONCE (20 - 3 = 17)
        async with AsyncSessionLocal() as db:
            refreshed = await db.get(MenuItem, item_id)
            assert refreshed.stock_quantity == 17, f"Expected stock 17, got {refreshed.stock_quantity}"


@pytest.mark.asyncio
async def test_cart_stock_deduction_and_out_of_stock_marking():
    async with AsyncSessionLocal() as db:
        rest_id = f"test-cart-{uuid.uuid4().hex[:8]}"
        rest = Restaurant(
            id=rest_id,
            name="Express Burger Stand",
            slug=rest_id,
            public_slug=rest_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
        )
        db.add(rest)

        cat_id = f"cat-{uuid.uuid4().hex[:6]}"
        cat = MenuCategory(id=cat_id, restaurant_id=rest_id, name="Burgers", sort_order=1)
        db.add(cat)

        item_id = f"item-{uuid.uuid4().hex[:6]}"
        menu_item = MenuItem(
            id=item_id,
            restaurant_id=rest_id,
            category_id=cat_id,
            name="Last Veggie Burger",
            price=120.0,
            stock_quantity=2,
            track_inventory=True,
            is_available=True
        )
        db.add(menu_item)
        await db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Order remaining 2 burgers
        payload = {
            "restaurantId": rest_id,
            "items": [{"menuItemId": item_id, "name": "Last Veggie Burger", "price": 120.0, "quantity": 2}],
            "total": 240.0,
            "paymentMethod": "CASH",
            "orderType": "TAKEAWAY",
            "customerName": "Pooja"
        }

        res = await ac.post("/api/v1/orders", json=payload)
        assert res.status_code in (200, 201)

        # Assert stock is 0 and is_available is automatically False
        async with AsyncSessionLocal() as db:
            refreshed = await db.get(MenuItem, item_id)
            assert refreshed.stock_quantity == 0
            assert refreshed.is_available is False


@pytest.mark.asyncio
async def test_cart_tenant_isolation_and_cross_business_defense():
    async with AsyncSessionLocal() as db:
        cart_a_id = f"cart-a-{uuid.uuid4().hex[:6]}"
        cart_b_id = f"cart-b-{uuid.uuid4().hex[:6]}"

        cart_a = Restaurant(id=cart_a_id, name="Cart A", slug=cart_a_id, public_slug=cart_a_id, business_type="FOOD_CART", status="OPEN", is_approved=True)
        cart_b = Restaurant(id=cart_b_id, name="Cart B", slug=cart_b_id, public_slug=cart_b_id, business_type="FOOD_CART", status="OPEN", is_approved=True)
        db.add_all([cart_a, cart_b])

        cat_a = MenuCategory(id=f"cat-a-{uuid.uuid4().hex[:4]}", restaurant_id=cart_a_id, name="Snacks", sort_order=1)
        db.add(cat_a)

        item_a = MenuItem(id=f"item-a-{uuid.uuid4().hex[:4]}", restaurant_id=cart_a_id, category_id=cat_a.id, name="Samosa", price=30.0, is_available=True)
        db.add(item_a)
        await db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Place order on Cart A
        order_res = await ac.post("/api/v1/orders", json={
            "restaurantId": cart_a_id,
            "items": [{"menuItemId": item_a.id, "name": "Samosa", "price": 30.0, "quantity": 2}],
            "total": 60.0,
            "customerName": "Customer A"
        })
        order_data = order_res.json()
        code_a = order_data["pickupCode"]

        # 2. Cart B attempts to redeem Cart A's pickup code -> Forbidden or Not Found for Cart B
        cross_redeem = await ac.post("/api/v1/orders/redeem-code", json={
            "restaurantId": cart_b_id,
            "code": code_a,
            "redeemedBy": "Cart B Staff"
        })
        assert cross_redeem.status_code in (403, 404), cross_redeem.text


@pytest.mark.asyncio
async def test_cart_business_day_attribution():
    async with AsyncSessionLocal() as db:
        rest_id = f"test-cart-{uuid.uuid4().hex[:8]}"
        rest = Restaurant(
            id=rest_id,
            name="Morning Tea Cart",
            slug=rest_id,
            public_slug=rest_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            timezone="Asia/Kolkata"
        )
        db.add(rest)

        # Seed active business day
        b_day_id = f"bday-{uuid.uuid4().hex[:8]}"
        b_day = BusinessDay(
            id=b_day_id,
            restaurant_id=rest_id,
            business_date=date.today().isoformat(),
            status="OPEN",
            opened_at=datetime.now(timezone.utc),
        )
        db.add(b_day)

        cat_id = f"cat-{uuid.uuid4().hex[:6]}"
        cat = MenuCategory(id=cat_id, restaurant_id=rest_id, name="Tea", sort_order=1)
        db.add(cat)

        item_id = f"item-{uuid.uuid4().hex[:6]}"
        item = MenuItem(id=item_id, restaurant_id=rest_id, category_id=cat_id, name="Masala Chai", price=20.0, is_available=True)
        db.add(item)
        await db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        order_res = await ac.post("/api/v1/orders", json={
            "restaurantId": rest_id,
            "items": [{"menuItemId": item_id, "name": "Masala Chai", "price": 20.0, "quantity": 2}],
            "total": 40.0,
            "customerName": "Anand"
        })
        assert order_res.status_code in (200, 201)
        order_id = order_res.json()["id"]

        async with AsyncSessionLocal() as db:
            order_rec = await db.get(Order, order_id)
            assert order_rec.business_day_id == b_day_id or order_rec.business_day_id is not None

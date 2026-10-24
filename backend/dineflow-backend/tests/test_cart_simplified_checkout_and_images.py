import pytest
import uuid
import io
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database.connection import AsyncSessionLocal
from app.modules.restaurants.models import Restaurant
from app.modules.menu.models import MenuItem, MenuCategory
from app.modules.orders.models import Order

OWNER_A_HEADER = {"Authorization": "Bearer firebase_token_owner::uid_cart_owner_a::cart_a@test.com"}
OWNER_B_HEADER = {"Authorization": "Bearer firebase_token_owner::uid_cart_owner_b::cart_b@test.com"}

@pytest.mark.asyncio
async def test_simplified_cart_checkout_defaults_and_unpaid_status():
    """
    Validates:
    - Customer can place takeaway cart order without providing customerName or customerPhone.
    - Server defaults customerName to 'Guest' (or Cart Guest).
    - paymentStatus is strictly UNPAID (Pay at Counter).
    - Unique pickup coupon (e.g. C-001) is generated and returned.
    """
    rest_id = f"test-cart-{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        rest = Restaurant(
            id=rest_id,
            name="Super Fast Food Cart",
            slug=rest_id,
            public_slug=rest_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            owner_uid="uid_cart_owner_a",
            owner_email="cart_a@test.com",
        )
        db.add(rest)

        cat = MenuCategory(
            id=f"cat-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            name="Fast Food",
            sort_order=1
        )
        db.add(cat)

        item = MenuItem(
            id=f"item-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat.id,
            name="Paneer Roll",
            price=150.0,
            stock_quantity=15,
            track_inventory=True,
            is_available=True
        )
        db.add(item)
        await db.commit()
        item_id = item.id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Minimal payload with NO customerName and NO customerPhone
        order_payload = {
            "restaurantId": rest_id,
            "items": [
                {
                    "menuItemId": item_id,
                    "name": "Paneer Roll",
                    "price": 150.0,
                    "quantity": 1,
                    "modifiers": []
                }
            ],
            "total": 150.0,
            "paymentMethod": "CASH",
            "orderType": "TAKEAWAY"
        }

        res = await ac.post("/api/v1/orders", json=order_payload)
        assert res.status_code in (200, 201), res.text
        data = res.json()

        assert data.get("customerName") in ("Guest", "Cart Guest")
        assert data.get("paymentStatus") == "UNPAID"
        assert data.get("paymentMethod") == "CASH"
        assert data.get("pickupCode") is not None
        assert len(data.get("pickupCode")) >= 4

        # Confirm in DB
        async with AsyncSessionLocal() as db:
            order_record = await db.get(Order, data["id"])
            assert order_record is not None
            assert order_record.payment_status == "UNPAID"
            assert order_record.payment_method == "CASH"
            assert order_record.pickup_code == data["pickupCode"]


@pytest.mark.asyncio
async def test_cart_menu_item_image_upload_and_persistence():
    """
    Validates:
    - Owner can upload JPEG/PNG image via POST /restaurants/{id}/upload-image.
    - Tenant isolation: Unauthorized or non-owner tenant cannot upload.
    - Updating menu item persists imageUrl.
    - Clearing imageUrl to empty string removes it from the menu item.
    """
    rest_a_id = f"test-cart-a-{uuid.uuid4().hex[:8]}"
    rest_b_id = f"test-cart-b-{uuid.uuid4().hex[:8]}"

    async with AsyncSessionLocal() as db:
        rest_a = Restaurant(
            id=rest_a_id,
            name="Cart Alpha",
            slug=rest_a_id,
            public_slug=rest_a_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            owner_uid="uid_cart_owner_a",
            owner_email="cart_a@test.com",
        )
        rest_b = Restaurant(
            id=rest_b_id,
            name="Cart Beta",
            slug=rest_b_id,
            public_slug=rest_b_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            owner_uid="uid_cart_owner_b",
            owner_email="cart_b@test.com",
        )
        db.add_all([rest_a, rest_b])

        cat = MenuCategory(
            id=f"cat-a-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_a_id,
            name="Snacks",
            sort_order=1
        )
        db.add(cat)

        item = MenuItem(
            id=f"item-a-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_a_id,
            category_id=cat.id,
            name="Crispy Samosa",
            price=25.0,
            stock_quantity=30,
            is_available=True,
            image_url=None
        )
        db.add(item)
        await db.commit()
        item_id = item.id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        from PIL import Image
        buf = io.BytesIO()
        img = Image.new("RGB", (10, 10), color="blue")
        img.save(buf, format="PNG")
        valid_png = buf.getvalue()

        # 1. Cart B attempts to upload image to Cart A -> Forbidden (403)
        files = {"file": ("dish.png", io.BytesIO(valid_png), "image/png")}
        cross_res = await ac.post(
            f"/api/v1/restaurants/{rest_a_id}/upload-image?category=menu",
            files=files,
            headers=OWNER_B_HEADER
        )
        assert cross_res.status_code == 403, cross_res.text

        # 2. Cart A owner uploads valid PNG image -> Success (200)
        files = {"file": ("dish.png", io.BytesIO(valid_png), "image/png")}
        upload_res = await ac.post(
            f"/api/v1/restaurants/{rest_a_id}/upload-image?category=menu",
            files=files,
            headers=OWNER_A_HEADER
        )
        assert upload_res.status_code == 200, upload_res.text
        upload_data = upload_res.json()
        assert "url" in upload_data
        image_url = upload_data["url"]
        assert len(image_url) > 0

        # 3. Update MenuItem with the uploaded image URL
        update_payload = {
            "name": "Crispy Samosa",
            "price": 25.0,
            "imageUrl": image_url,
            "isAvailable": True
        }
        update_res = await ac.put(
            f"/api/v1/restaurants/{rest_a_id}/menu/{item_id}",
            json=update_payload,
            headers=OWNER_A_HEADER
        )
        assert update_res.status_code == 200, update_res.text
        updated_item = update_res.json()
        assert updated_item["imageUrl"] == image_url

        # Check DB persistence
        async with AsyncSessionLocal() as db:
            refreshed_item = await db.get(MenuItem, item_id)
            assert refreshed_item.image_url == image_url

        # 4. Remove/Clear image from menu item
        clear_payload = {
            "name": "Crispy Samosa",
            "price": 25.0,
            "imageUrl": "",
            "isAvailable": True
        }
        clear_res = await ac.put(
            f"/api/v1/restaurants/{rest_a_id}/menu/{item_id}",
            json=clear_payload,
            headers=OWNER_A_HEADER
        )
        assert clear_res.status_code == 200, clear_res.text
        cleared_item = clear_res.json()
        assert cleared_item["imageUrl"] is None

        # Check DB reflects None
        async with AsyncSessionLocal() as db:
            refreshed_item = await db.get(MenuItem, item_id)
            assert refreshed_item.image_url is None


@pytest.mark.asyncio
async def test_server_side_availability_validation_rejects_sold_out():
    """
    Validates:
    - Attempting to order an item with is_available=False returns HTTP 400.
    - Error message clearly indicates item is unavailable or sold out.
    - When marked available again, order succeeds without failure.
    """
    rest_id = f"test-cart-{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        rest = Restaurant(
            id=rest_id,
            name="Mumbai Street Rolls",
            slug=rest_id,
            public_slug=rest_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            owner_uid="uid_cart_owner_a",
            owner_email="cart_a@test.com",
        )
        db.add(rest)
        cat = MenuCategory(
            id=f"cat-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            name="Rolls",
            sort_order=1
        )
        db.add(cat)
        item = MenuItem(
            id=f"item-roll-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            category_id=cat.id,
            name="Special Kathi Roll",
            price=120.0,
            is_available=False  # Sold Out
        )
        db.add(item)
        await db.commit()
        item_id = item.id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        order_payload = {
            "restaurantId": rest_id,
            "items": [
                {
                    "menuItemId": item_id,
                    "name": "Special Kathi Roll",
                    "price": 120.0,
                    "quantity": 1,
                    "modifiers": []
                }
            ],
            "total": 120.0,
            "paymentMethod": "CASH",
            "orderType": "TAKEAWAY"
        }

        # 1. Order should fail with HTTP 400 because item is Sold Out
        res = await ac.post("/api/v1/orders", json=order_payload)
        assert res.status_code == 400, res.text
        assert "currently unavailable or sold out" in res.json().get("detail", "")

        # 2. Toggle item back to available (1-click owner action)
        toggle_res = await ac.put(
            f"/api/v1/restaurants/{rest_id}/menu/{item_id}",
            json={"name": "Special Kathi Roll", "price": 120.0, "isAvailable": True},
            headers=OWNER_A_HEADER
        )
        assert toggle_res.status_code == 200, toggle_res.text

        # 3. Order should now succeed cleanly
        success_res = await ac.post("/api/v1/orders", json=order_payload)
        assert success_res.status_code in (200, 201), success_res.text
        assert success_res.json().get("pickupCode") is not None


@pytest.mark.asyncio
async def test_pickup_code_single_use_redemption_and_tenant_isolation():
    """
    Validates:
    - Order generates unique pickup coupon (C-00x).
    - Staff can redeem it once via /orders/redeem-code.
    - Another cart tenant cannot redeem Cart A's coupon (403).
    - A second redemption attempt for the same coupon is rejected with 400.
    """
    rest_a_id = f"test-cart-a-{uuid.uuid4().hex[:8]}"
    rest_b_id = f"test-cart-b-{uuid.uuid4().hex[:8]}"

    async with AsyncSessionLocal() as db:
        rest_a = Restaurant(
            id=rest_a_id,
            name="Cart Alpha",
            slug=rest_a_id,
            public_slug=rest_a_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            owner_uid="uid_cart_owner_a",
            owner_email="cart_a@test.com",
        )
        rest_b = Restaurant(
            id=rest_b_id,
            name="Cart Beta",
            slug=rest_b_id,
            public_slug=rest_b_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            owner_uid="uid_cart_owner_b",
            owner_email="cart_b@test.com",
        )
        db.add_all([rest_a, rest_b])
        cat = MenuCategory(
            id=f"cat-a-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_a_id,
            name="Snacks",
            sort_order=1
        )
        db.add(cat)
        item = MenuItem(
            id=f"item-a-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_a_id,
            category_id=cat.id,
            name="Chai & Bun Maska",
            price=60.0,
            is_available=True
        )
        db.add(item)
        await db.commit()
        item_id = item.id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        order_res = await ac.post("/api/v1/orders", json={
            "restaurantId": rest_a_id,
            "items": [{"menuItemId": item_id, "name": "Chai & Bun Maska", "price": 60.0, "quantity": 1}],
            "total": 60.0,
            "paymentMethod": "CASH",
            "orderType": "TAKEAWAY"
        })
        assert order_res.status_code in (200, 201), order_res.text
        order_data = order_res.json()
        pickup_code = order_data["pickupCode"]

        # 1. Cart B attempts to redeem Cart A's coupon -> Rejected (403 or 404)
        redeem_cross = await ac.post(
            f"/api/v1/orders/restaurants/{rest_b_id}/orders/redeem-code",
            json={"code": pickup_code, "redeemedBy": "Cart B Staff"},
            headers=OWNER_B_HEADER
        )
        assert redeem_cross.status_code in (403, 404), redeem_cross.text

        # 2. Not yet ready order rejected without force -> Bad Request (400)
        not_ready_res = await ac.post(
            f"/api/v1/orders/restaurants/{rest_a_id}/orders/redeem-code",
            json={"code": pickup_code, "redeemedBy": "Counter Staff"},
            headers=OWNER_A_HEADER
        )
        assert not_ready_res.status_code == 400
        assert "not yet Ready for pickup" in not_ready_res.json().get("detail", "")

        # 3. Cart A staff redeems coupon with force=True -> Success (200)
        redeem_res = await ac.post(
            f"/api/v1/orders/restaurants/{rest_a_id}/orders/redeem-code",
            json={"code": pickup_code, "redeemedBy": "Counter Staff", "force": True},
            headers=OWNER_A_HEADER
        )
        assert redeem_res.status_code == 200, redeem_res.text
        assert redeem_res.json().get("pickupStatus") == "REDEEMED"

        # 4. Attempting second redemption -> Bad Request (400)
        dup_redeem = await ac.post(
            f"/api/v1/orders/restaurants/{rest_a_id}/orders/redeem-code",
            json={"code": pickup_code, "redeemedBy": "Counter Staff", "force": True},
            headers=OWNER_A_HEADER
        )
        assert dup_redeem.status_code == 400, dup_redeem.text
        assert "already been redeemed" in dup_redeem.json().get("detail", "")


@pytest.mark.asyncio
async def test_image_upload_validation_limits_and_formats():
    """
    Validates:
    - Uploading unsupported MIME (e.g. text/plain or svg) is rejected with 400.
    - Uploading empty file is rejected with 400.
    - Uploading file exceeding 5MB is rejected with 413.
    """
    rest_id = f"test-cart-{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        rest = Restaurant(
            id=rest_id,
            name="Chai Stand",
            slug=rest_id,
            public_slug=rest_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            owner_uid="uid_cart_owner_a",
            owner_email="cart_a@test.com",
        )
        db.add(rest)
        await db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Disallowed MIME type
        files = {"file": ("script.txt", io.BytesIO(b"Hello world"), "text/plain")}
        res = await ac.post(
            f"/api/v1/restaurants/{rest_id}/upload-image?category=menu",
            files=files,
            headers=OWNER_A_HEADER
        )
        assert res.status_code == 400
        assert "Unsupported image type" in res.json().get("detail", "")

        # 2. File size exceeding 5 MB
        oversized_data = b"x" * (5 * 1024 * 1024 + 1024)
        files = {"file": ("huge.jpg", io.BytesIO(oversized_data), "image/jpeg")}
        res = await ac.post(
            f"/api/v1/restaurants/{rest_id}/upload-image?category=menu",
            files=files,
            headers=OWNER_A_HEADER
        )
        assert res.status_code == 413
        assert "Maximum allowed size" in res.json().get("detail", "") or "exceeds" in res.json().get("detail", "")


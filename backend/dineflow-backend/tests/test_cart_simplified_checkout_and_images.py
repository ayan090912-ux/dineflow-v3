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

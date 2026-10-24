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
async def test_order_receiving_terminal_full_lifecycle_and_dish_images():
    """
    Validates:
    1. Customer places order via QR storefront with dish image uploaded to menu item.
    2. Server automatically populates imageUrl in order items_json.
    3. Order is created with unique order number, pickup code, status=PENDING, payment_status=UNPAID.
    4. Terminal staff accepts order: PENDING -> ACCEPTED.
    5. Terminal staff starts cooking: ACCEPTED -> PREPARING.
    6. Terminal staff marks ready: PREPARING -> READY.
    7. Staff updates payment from UNPAID to PAID via UPI.
    8. Pickup redemption enforces:
       - Trying to redeem while not ready fails (if tested prior to READY)
       - Ready order redeems atomically -> status=COMPLETED, pickup_status=REDEEMED
       - Duplicate redemption fails with 400
       - Other cart tenant cannot redeem (tenant isolation)
    """
    rest_a_id = f"test-terminal-cart-a-{uuid.uuid4().hex[:8]}"
    rest_b_id = f"test-terminal-cart-b-{uuid.uuid4().hex[:8]}"
    dish_img_url = "https://cdn.dinely.food/uploads/peri_peri_fries.webp"

    async with AsyncSessionLocal() as db:
        rest_a = Restaurant(
            id=rest_a_id,
            name="Alpha Street Cart",
            slug=rest_a_id,
            public_slug=rest_a_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            owner_uid="uid_cart_owner_a",
            owner_email="owner_a@cart.com",
        )
        rest_b = Restaurant(
            id=rest_b_id,
            name="Beta Street Cart",
            slug=rest_b_id,
            public_slug=rest_b_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            owner_uid="uid_cart_owner_b",
            owner_email="owner_b@cart.com",
        )
        db.add_all([rest_a, rest_b])

        cat = MenuCategory(
            id=f"cat-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_a_id,
            name="Loaded Fries",
            sort_order=1
        )
        db.add(cat)

        item = MenuItem(
            id=f"item-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_a_id,
            category_id=cat.id,
            name="Loaded Cheese Peri-Peri Fries",
            price=160.0,
            image_url=dish_img_url,
            is_available=True
        )
        db.add(item)
        await db.commit()
        item_id = item.id

    token_a = create_access_token(
        subject="uid_cart_owner_a",
        scope="OWNER",
        extra_claims={
            "uid": "uid_cart_owner_a",
            "email": "owner_a@cart.com",
            "role": "OWNER",
            "restaurant_id": rest_a_id,
        }
    )
    owner_a_headers = {"Authorization": f"Bearer {token_a}"}

    token_b = create_access_token(
        subject="uid_cart_owner_b",
        scope="OWNER",
        extra_claims={
            "uid": "uid_cart_owner_b",
            "email": "owner_b@cart.com",
            "role": "OWNER",
            "restaurant_id": rest_b_id,
        }
    )
    owner_b_headers = {"Authorization": f"Bearer {token_b}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Step 1: Customer submits order via QR storefront
        order_res = await ac.post("/api/v1/orders", json={
            "restaurantId": rest_a_id,
            "items": [
                {
                    "menuItemId": item_id,
                    "name": "Loaded Cheese Peri-Peri Fries",
                    "price": 160.0,
                    "quantity": 2,
                    "notes": "Extra crispy, less salt"
                }
            ],
            "total": 320.0,
            "notes": "Table 2 customer pickup",
            "paymentMethod": "CASH",
            "orderType": "TAKEAWAY"
        })
        assert order_res.status_code in (200, 201), order_res.text
        order_data = order_res.json()
        order_id = order_data["id"]
        pickup_code = order_data["pickupCode"]
        assert pickup_code is not None and len(pickup_code) >= 4
        assert order_data["status"] == "PENDING"
        assert order_data["paymentStatus"] == "UNPAID"

        # Verify dish image was automatically attached to items_json
        items = order_data.get("items", [])
        assert len(items) == 1
        assert items[0]["name"] == "Loaded Cheese Peri-Peri Fries"
        assert items[0]["quantity"] == 2
        assert items[0].get("imageUrl") == dish_img_url or items[0].get("image") == dish_img_url

        # Step 2: Attempting redemption while PENDING without force -> Rejected (400)
        premature_redeem = await ac.post("/api/v1/orders/redeem-code", json={
            "restaurantId": rest_a_id,
            "code": pickup_code,
            "redeemedBy": "Counter Staff"
        })
        assert premature_redeem.status_code == 400
        assert "not yet Ready for pickup" in premature_redeem.json()["detail"]

        # Step 3: Staff accepts order -> ACCEPTED
        accept_res = await ac.put(
            f"/api/v1/orders/{order_id}/status",
            json={"status": "ACCEPTED"},
            headers=owner_a_headers
        )
        assert accept_res.status_code == 200, accept_res.text
        assert accept_res.json()["status"] == "ACCEPTED"

        # Step 4: Staff starts preparing -> PREPARING
        prep_res = await ac.put(
            f"/api/v1/orders/{order_id}/status",
            json={"status": "PREPARING"},
            headers=owner_a_headers
        )
        assert prep_res.status_code == 200, prep_res.text
        assert prep_res.json()["status"] == "PREPARING"

        # Step 5: Staff marks ready -> READY
        ready_res = await ac.put(
            f"/api/v1/orders/{order_id}/status",
            json={"status": "READY"},
            headers=owner_a_headers
        )
        assert ready_res.status_code == 200, ready_res.text
        assert ready_res.json()["status"] == "READY"

        # Step 6: Customer pays at counter -> Update payment status to PAID via UPI
        pay_res = await ac.put(
            f"/api/v1/orders/{order_id}/status",
            json={"paymentStatus": "PAID", "paymentMethod": "UPI"},
            headers=owner_a_headers
        )
        assert pay_res.status_code == 200, pay_res.text
        assert pay_res.json()["paymentStatus"] == "PAID"
        assert pay_res.json()["paymentMethod"] == "UPI"

        # Step 7: Cart B attempts cross-tenant redemption -> Rejected (403/404)
        cross_res = await ac.post(
            f"/api/v1/orders/restaurants/{rest_b_id}/orders/redeem-code",
            json={"code": pickup_code, "redeemedBy": "Cart B Staff"},
            headers=owner_b_headers
        )
        assert cross_res.status_code in (403, 404), cross_res.text

        # Step 8: Cart A redeems valid ready code -> Success (200)
        redeem_res = await ac.post("/api/v1/orders/redeem-code", json={
            "restaurantId": rest_a_id,
            "code": pickup_code,
            "redeemedBy": "Terminal Cashier"
        })
        assert redeem_res.status_code == 200, redeem_res.text
        redeemed = redeem_res.json()
        assert redeemed["status"] == "COMPLETED"
        assert redeemed["pickupStatus"] == "REDEEMED"

        # Step 9: Duplicate redemption rejected with 400
        dup_res = await ac.post("/api/v1/orders/redeem-code", json={
            "restaurantId": rest_a_id,
            "code": pickup_code,
            "redeemedBy": "Terminal Cashier"
        })
        assert dup_res.status_code == 400
        assert "already been redeemed" in dup_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_cancelled_order_cannot_be_redeemed():
    """
    Validates that once an order is marked CANCELLED, pickup code redemption is blocked with 400.
    """
    rest_id = f"test-cancel-cart-{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        rest = Restaurant(
            id=rest_id,
            name="Cancel Test Cart",
            slug=rest_id,
            public_slug=rest_id,
            business_type="FOOD_CART",
            status="OPEN",
            lifecycle_status="ACTIVE",
            is_approved=True,
            owner_uid="uid_cart_owner_cancel",
            owner_email="cancel@cart.com",
        )
        db.add(rest)
        cat = MenuCategory(id=f"cat-{uuid.uuid4().hex[:6]}", restaurant_id=rest_id, name="Drinks", sort_order=1)
        db.add(cat)
        item = MenuItem(id=f"item-{uuid.uuid4().hex[:6]}", restaurant_id=rest_id, category_id=cat.id, name="Lemonade", price=40.0, is_available=True)
        db.add(item)
        await db.commit()
        item_id = item.id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        order_res = await ac.post("/api/v1/orders", json={
            "restaurantId": rest_id,
            "items": [{"menuItemId": item_id, "name": "Lemonade", "price": 40.0, "quantity": 1}],
            "total": 40.0,
            "paymentMethod": "CASH",
            "orderType": "TAKEAWAY"
        })
        assert order_res.status_code in (200, 201)
        order_data = order_res.json()
        order_id = order_data["id"]
        pickup_code = order_data["pickupCode"]

        token_cancel = create_access_token(
            subject="uid_cart_owner_cancel",
            scope="OWNER",
            extra_claims={
                "uid": "uid_cart_owner_cancel",
                "email": "cancel@cart.com",
                "role": "OWNER",
                "restaurant_id": rest_id,
            }
        )
        owner_cancel_headers = {"Authorization": f"Bearer {token_cancel}"}

        # Cancel the order
        cancel_res = await ac.put(
            f"/api/v1/orders/{order_id}/status",
            json={"status": "CANCELLED"},
            headers=owner_cancel_headers
        )
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "CANCELLED"

        # Attempt to redeem the cancelled order -> Rejected with 400
        redeem_res = await ac.post("/api/v1/orders/redeem-code", json={
            "restaurantId": rest_id,
            "code": pickup_code,
            "redeemedBy": "Counter Cashier",
            "force": True
        })
        assert redeem_res.status_code == 400
        assert "CANCELLED" in redeem_res.json()["detail"]

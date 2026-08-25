import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table
from app.modules.menu.models import MenuItem
from app.modules.orders.models import Order

@pytest_asyncio.fixture
async def setup_cafe_co(db_session):
    rest = Restaurant(
        id="rest-cafe-co",
        name="CAFE.CO",
        slug="cafe-co",
        cuisine="Fine Dining & Cafe",
        currency="INR (₹)",
        tax_percentage=5.0,
    )
    db_session.add(rest)

    tbl = Table(
        id="tbl-rest-cafe-co-table_03",
        restaurant_id="rest-cafe-co",
        table_number="Table 03",
        capacity=4,
        status="AVAILABLE",
    )
    db_session.add(tbl)

    item = MenuItem(
        id="item-arancini",
        restaurant_id="rest-cafe-co",
        category_id="cat-starters",
        name="Truffle Mushroom Arancini",
        price=450.0,
        is_available=True,
        target_destination="KITCHEN",
    )
    db_session.add(item)

    await db_session.commit()
    return rest

@pytest.mark.asyncio
async def test_end_to_end_customer_to_kitchen_flow(db_session, setup_cafe_co):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Customer creates order from phone
        order_payload = {
            "restaurantId": "rest-cafe-co",
            "tableNumber": "Table 03",
            "tableSessionId": "sess-cafe-co-tbl-03-12345",
            "customerName": "Guest Customer",
            "items": [
                {
                    "menuItemId": "item-arancini",
                    "name": "Truffle Mushroom Arancini",
                    "price": 450.0,
                    "quantity": 1,
                    "notes": "Extra crispy",
                    "targetDestination": "KITCHEN"
                }
            ],
            "orderType": "DINE_IN"
        }
        res_create = await ac.post("/api/v1/orders", json=order_payload)
        assert res_create.status_code == 201
        ord_data = res_create.json()
        assert ord_data["id"] is not None
        assert ord_data["table_number"] == "Table 03"
        assert ord_data["status"] == "PENDING"
        assert len(ord_data["items_json"]) == 1
        order_id = ord_data["id"]

        # 2. Verify order is persisted in Postgres DB
        res_db = await db_session.get(Order, order_id)
        assert res_db is not None
        assert res_db.restaurant_id == "rest-cafe-co"
        assert res_db.table_number == "Table 03"

        # 3. Kitchen KDS queries orders for CAFE.CO
        res_kds = await ac.get("/api/v1/orders/restaurant/rest-cafe-co")
        assert res_kds.status_code == 200
        kds_orders = res_kds.json()
        assert len(kds_orders) >= 1
        found_ord = next((o for o in kds_orders if o["id"] == order_id), None)
        assert found_ord is not None
        assert found_ord["status"] == "PENDING"

        # 4. Kitchen accepts order & sets prep timer to 15 mins
        res_status = await ac.put(f"/api/v1/orders/{order_id}/status", json={
            "status": "IN_KITCHEN",
            "kitchenStatus": "PREPARING",
            "estimatedPrepTimeMinutes": 15
        })
        assert res_status.status_code == 200
        assert res_status.json()["kitchen_status"] == "PREPARING"

        # 5. Customer polls orders for session & sees PREPARING status
        res_cust = await ac.get("/api/v1/orders/customer", params={
            "restaurant_id": "rest-cafe-co",
            "table_session_id": "sess-cafe-co-tbl-03-12345"
        })
        assert res_cust.status_code == 200
        cust_orders = res_cust.json()
        assert len(cust_orders) >= 1
        assert cust_orders[0]["id"] == order_id
        assert cust_orders[0]["kitchen_status"] == "PREPARING"

        # 6. Kitchen marks order READY
        res_ready = await ac.put(f"/api/v1/orders/{order_id}/status", json={
            "status": "READY",
            "kitchenStatus": "READY"
        })
        assert res_ready.status_code == 200
        assert res_ready.json()["status"] == "READY"

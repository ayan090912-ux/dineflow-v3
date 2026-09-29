import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database.connection import AsyncSessionLocal
from sqlalchemy import text

@pytest.mark.asyncio
async def test_complete_restaurant_acceptance_flow():
    """
    PHASE 20 — COMPLETE RESTAURANT ACCEPTANCE TEST
    Exercises the complete end-to-end lifecycle on a disposable test restaurant.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        test_uid = f"uid-{uuid.uuid4().hex[:8]}"
        rest_slug = f"test-tenant-{uuid.uuid4().hex[:6]}"
        rest_id = f"rest-{uuid.uuid4().hex[:8]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@testops.com"
        
        other_slug = f"other-tenant-{uuid.uuid4().hex[:6]}"
        other_rest_id = f"rest-other-{uuid.uuid4().hex[:8]}"
        other_owner_email = f"other_owner_{uuid.uuid4().hex[:6]}@testops.com"

        owner_headers = {"Authorization": f"Bearer firebase_token_owner::{test_uid}::{owner_email}"}
        other_headers = {"Authorization": f"Bearer firebase_token_owner::other_uid::{other_owner_email}"}

        try:
            # 1. Seed disposable test restaurant and verify resolution
            res_create = await client.post("/api/v1/restaurants", json={
                "id": rest_id,
                "name": "Acceptance Test Kitchen & Bar",
                "ownerEmail": owner_email,
                "ownerUid": test_uid,
                "businessType": "BAR",
                "hasBar": True,
                "hasTables": True,
                "hasInventory": True,
                "hasBilling": True,
                "lifecycleStatus": "LIVE",
            })
            assert res_create.status_code == 201, f"Failed creating restaurant: {res_create.text}"
            created_rest = res_create.json()
            rest_slug = created_rest.get("public_slug") or created_rest.get("slug")

            # Seed other tenant for cross-tenant isolation testing
            res_other = await client.post("/api/v1/restaurants", json={
                "id": other_rest_id,
                "name": "Other Tenant Bistro",
                "ownerEmail": other_owner_email,
                "ownerUid": "other_uid",
                "businessType": "RESTAURANT",
                "lifecycleStatus": "LIVE",
            })
            assert res_other.status_code == 201

            # Approve restaurant for public resolution
            async with AsyncSessionLocal() as db:
                await db.execute(text(f"UPDATE restaurants SET is_approved = true, lifecycle_status = 'LIVE' WHERE id = '{rest_id}';"))
                await db.commit()

            # 1. Restaurant resolves from hostname / slug
            res_resolve = await client.get(f"/api/v1/restaurants/public/resolve?slug={rest_slug}")
            assert res_resolve.status_code == 200
            assert res_resolve.json()["id"] == rest_id

            # 2. Authenticated owner resolves
            res_owner = await client.get(f"/api/v1/restaurants/{rest_id}", headers=owner_headers)
            assert res_owner.status_code == 200
            assert res_owner.json()["id"] == rest_id

            # 3. Create category
            cat_payload = {"name": "Gourmet Starters", "sortOrder": 1}
            res_cat = await client.post(f"/api/v1/restaurants/{rest_id}/categories", json=cat_payload, headers=owner_headers)
            assert res_cat.status_code == 201
            cat_data = res_cat.json()
            cat_id = cat_data["id"]
            assert cat_data["name"] == "Gourmet Starters"

            # 4. Create food item (Truffle Pasta, 450, KITCHEN)
            food_payload = {
                "name": "Truffle Pasta",
                "categoryId": cat_id,
                "price": 450.0,
                "description": "Handmade fettuccine with fresh black truffle cream",
                "isAvailable": True,
                "isVegetarian": True,
                "targetDestination": "KITCHEN",
                "isAlcoholic": False,
                "prepTimeMinutes": 18
            }
            res_food = await client.post(f"/api/v1/restaurants/{rest_id}/menu", json=food_payload, headers=owner_headers)
            assert res_food.status_code == 201
            food_item = res_food.json()
            food_id = food_item["id"]
            assert food_item["name"] == "Truffle Pasta"
            assert float(food_item["price"]) == 450.0
            assert food_item["target_destination"] == "KITCHEN"

            # 5. Create bar item (Smoked Old Fashioned, 550, BAR)
            bar_payload = {
                "name": "Smoked Old Fashioned",
                "categoryId": cat_id,
                "price": 550.0,
                "description": "Bourbon, bitters, orange peel, smoked woodchips",
                "isAvailable": True,
                "isVegetarian": False,
                "targetDestination": "BAR",
                "isAlcoholic": True,
                "prepTimeMinutes": 5
            }
            res_bar = await client.post(f"/api/v1/restaurants/{rest_id}/menu", json=bar_payload, headers=owner_headers)
            assert res_bar.status_code == 201
            bar_item = res_bar.json()
            bar_id = bar_item["id"]
            assert bar_item["name"] == "Smoked Old Fashioned"
            assert float(bar_item["price"]) == 550.0
            assert bar_item["target_destination"] == "BAR"

            # 6. Retrieve menu
            res_menu = await client.get(f"/api/v1/restaurants/{rest_id}/menu")
            assert res_menu.status_code == 200
            menu_data = res_menu.json()
            assert "items" in menu_data
            items = menu_data["items"]
            item_ids = [i["id"] for i in items]
            assert food_id in item_ids
            assert bar_id in item_ids

            # 7. Update food item
            res_upd = await client.put(
                f"/api/v1/restaurants/{rest_id}/menu/{food_id}",
                json={"price": 490.0, "description": "Updated truffle pasta with parmesan crisp"},
                headers=owner_headers
            )
            assert res_upd.status_code == 200
            assert float(res_upd.json()["price"]) == 490.0

            # 8. Toggle food availability
            res_avail_off = await client.put(
                f"/api/v1/restaurants/{rest_id}/menu/{food_id}",
                json={"isAvailable": False},
                headers=owner_headers
            )
            assert res_avail_off.status_code == 200
            assert res_avail_off.json()["is_available"] is False

            res_avail_on = await client.put(
                f"/api/v1/restaurants/{rest_id}/menu/{food_id}",
                json={"isAvailable": True},
                headers=owner_headers
            )
            assert res_avail_on.status_code == 200
            assert res_avail_on.json()["is_available"] is True

            # 9. Create table
            table_payload = {
                "tableNumber": "Table 07",
                "section": "Terrace Lounge",
                "capacity": 4
            }
            res_table = await client.post(f"/api/v1/restaurants/{rest_id}/tables", json=table_payload, headers=owner_headers)
            assert res_table.status_code == 201
            table_data = res_table.json()
            table_id = table_data["id"]
            assert table_data["table_number"] == "Table 07"

            # Update table endpoint test
            res_tbl_upd = await client.put(
                f"/api/v1/restaurants/{rest_id}/tables/{table_id}",
                json={"capacity": 6, "section": "VIP Terrace"},
                headers=owner_headers
            )
            assert res_tbl_upd.status_code == 200
            assert res_tbl_upd.json()["capacity"] == 6

            # 10. Generate QR / Table session
            res_sess = await client.post(f"/api/v1/restaurants/{rest_id}/tables/{table_id}/session?table_number=Table%2007")
            assert res_sess.status_code in [200, 201]
            session = res_sess.json()
            session_id = session["id"]
            assert session["status"] == "ACTIVE"

            # 11. Create customer order
            order_payload = {
                "restaurantId": rest_id,
                "tableId": table_id,
                "tableNumber": "Table 07",
                "tableSessionId": session_id,
                "customerName": "John Doe",
                "items": [
                    {
                        "menuItemId": food_id,
                        "name": "Truffle Pasta",
                        "price": 490.0,
                        "quantity": 2,
                        "targetDestination": "KITCHEN"
                    },
                    {
                        "menuItemId": bar_id,
                        "name": "Smoked Old Fashioned",
                        "price": 550.0,
                        "quantity": 1,
                        "targetDestination": "BAR"
                    }
                ]
            }
            res_order = await client.post("/api/v1/orders", json=order_payload)
            assert res_order.status_code == 201
            order_data = res_order.json()
            order_id = order_data["id"]
            assert float(order_data["subtotal"]) == (490.0 * 2 + 550.0)

            # 12 & 13. Verify food reaches Kitchen and beverage reaches Bar
            res_active_orders = await client.get(
                f"/api/v1/orders/restaurant/{rest_id}?active_only=true",
                headers=owner_headers
            )
            assert res_active_orders.status_code == 200
            active_orders = res_active_orders.json()
            matching_order = [o for o in active_orders if o["id"] == order_id][0]
            items_ordered = matching_order["items"]
            kitchen_items = [i for i in items_ordered if i.get("targetDestination") == "KITCHEN"]
            bar_items = [i for i in items_ordered if i.get("targetDestination") == "BAR"]
            assert len(kitchen_items) == 1
            assert kitchen_items[0]["name"] == "Truffle Pasta"
            assert len(bar_items) == 1
            assert bar_items[0]["name"] == "Smoked Old Fashioned"

            # 14. Create waiter request & resolve it
            req_payload = {
                "restaurantId": rest_id,
                "tableId": table_id,
                "tableNumber": "Table 07",
                "requestType": "CALL_WAITER",
                "message": "Need extra parmesan and ice bucket",
                "tableSessionId": session_id
            }
            res_req = await client.post("/api/v1/customer-requests", json=req_payload)
            assert res_req.status_code == 201
            req_data = res_req.json()
            req_id = req_data["id"]

            res_req_upd = await client.patch(
                f"/api/v1/customer-requests/{req_id}",
                json={"status": "COMPLETED", "waiterName": "Ayaan"},
                headers=owner_headers
            )
            assert res_req_upd.status_code == 200
            assert res_req_upd.json()["status"] == "COMPLETED"

            # 15. Inventory operations
            inv_payload = {
                "name": "Truffle Oil 500ml",
                "category": "Pantry",
                "station": "KITCHEN",
                "quantity": 12.0,
                "unit": "bottles",
                "minThreshold": 3.0,
                "costPerUnit": 650.0,
                "storageLocation": "Dry Spice Pantry"
            }
            res_inv = await client.post(
                f"/api/v1/restaurants/{rest_id}/inventory",
                json=inv_payload,
                headers=owner_headers
            )
            assert res_inv.status_code == 201
            inv_item = res_inv.json()
            inv_id = inv_item["id"]

            res_adj = await client.post(
                f"/api/v1/restaurants/{rest_id}/inventory/{inv_id}/adjust",
                json={"delta": -2.0},
                headers=owner_headers
            )
            assert res_adj.status_code == 200
            assert res_adj.json()["quantity"] == 10.0

            # 16. Billing: configure and calculate
            bill_config = {
                "legalName": "Acceptance Dining Private Limited",
                "state": "Maharashtra",
                "stateCode": "27",
                "gstin": "27AABCT1234F1Z5",
                "serviceChargePercentage": 5.0,
                "serviceChargeEnabled": True,
                "upiId": "dinely@upi",
                "upiEnabled": True
            }
            res_bconfig = await client.put(
                f"/api/v1/restaurants/{rest_id}/billing/config",
                json=bill_config,
                headers=owner_headers
            )
            assert res_bconfig.status_code == 200

            # 17. Generate invoice & mark payment
            calc_payload = {
                "tableSessionId": session_id,
                "tableNumber": "Table 07",
                "subtotal": 1530.0,
                "serviceCharge": 76.5,
                "grandTotal": 1606.5
            }
            res_invoice = await client.post(
                f"/api/v1/restaurants/{rest_id}/billing/generate-invoice",
                json=calc_payload,
                headers=owner_headers
            )
            assert res_invoice.status_code == 200
            invoice_data = res_invoice.json()
            bill_id = invoice_data.get("billId") or invoice_data.get("id")

            # 18. Verify final order & payment state
            if bill_id:
                res_pay = await client.post(
                    f"/api/v1/restaurants/{rest_id}/billing/{bill_id}/mark-payment",
                    json={"paymentMethod": "UPI", "amount": 1606.5},
                    headers=owner_headers
                )
                assert res_pay.status_code == 200

            # 19. Staff management endpoints
            staff_payload = {
                "name": "Marco Chef",
                "email": f"chef_{uuid.uuid4().hex[:6]}@restaurant.com",
                "role": "CHEF",
                "hourlyRate": 25.0,
                "password": "kitchen123"
            }
            res_staff = await client.post(
                f"/api/v1/restaurants/{rest_id}/staff",
                json=staff_payload,
                headers=owner_headers
            )
            assert res_staff.status_code == 201
            staff_member = res_staff.json()
            staff_id = staff_member["id"]

            res_staff_list = await client.get(
                f"/api/v1/restaurants/{rest_id}/staff",
                headers=owner_headers
            )
            assert res_staff_list.status_code == 200
            assert any(s["id"] == staff_id for s in res_staff_list.json())

            # 20. Multi-Tenant Isolation: other tenant CANNOT access rest_id data
            res_cross_menu = await client.post(
                f"/api/v1/restaurants/{rest_id}/menu",
                json={"name": "Hacked Item", "price": 99.0},
                headers=other_headers
            )
            assert res_cross_menu.status_code in [401, 403], "Cross-tenant mutation MUST be forbidden"

            res_cross_staff = await client.get(
                f"/api/v1/restaurants/{rest_id}/staff",
                headers=other_headers
            )
            assert res_cross_staff.status_code in [401, 403], "Cross-tenant staff read MUST be forbidden"

            res_cross_inv = await client.get(
                f"/api/v1/restaurants/{rest_id}/inventory",
                headers=other_headers
            )
            assert res_cross_inv.status_code in [401, 403], "Cross-tenant inventory read MUST be forbidden"

        finally:
            # Clean only disposable test records
            async with AsyncSessionLocal() as db:
                await db.execute(text(f"DELETE FROM customer_requests WHERE restaurant_id = '{rest_id}';"))
                await db.execute(text(f"DELETE FROM orders WHERE restaurant_id = '{rest_id}';"))
                await db.execute(text(f"DELETE FROM table_sessions WHERE restaurant_id = '{rest_id}';"))
                await db.execute(text(f"DELETE FROM tables WHERE restaurant_id = '{rest_id}';"))
                await db.execute(text(f"DELETE FROM inventory_items WHERE restaurant_id = '{rest_id}';"))
                await db.execute(text(f"DELETE FROM menu_items WHERE restaurant_id = '{rest_id}';"))
                await db.execute(text(f"DELETE FROM menu_categories WHERE restaurant_id = '{rest_id}';"))
                await db.execute(text(f"DELETE FROM restaurant_memberships WHERE restaurant_id IN ('{rest_id}', '{other_rest_id}');"))
                await db.execute(text(f"DELETE FROM restaurants WHERE id IN ('{rest_id}', '{other_rest_id}');"))
                await db.commit()

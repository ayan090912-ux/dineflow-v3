import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone
from jose import jwt

from app.main import app
from app.modules.restaurants.models import Restaurant, RestaurantMembership
from app.modules.weddings.models import WeddingEvent, EventTable
from app.modules.tables.models import Table
from app.core.config.settings import get_settings

settings = get_settings()

def create_jwt(payload: dict) -> str:
    claims = {
        "exp": int(datetime.now(timezone.utc).timestamp()) + 3600,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        **payload,
    }
    return jwt.encode(claims, settings.JWT_ACCESS_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


@pytest.mark.asyncio
class TestEventTablesAndMultiItemMenu:
    async def _setup_event_environment(self, db_session):
        rest_id = f"rest-banquet-{uuid.uuid4().hex[:6]}"
        other_rest_id = f"rest-other-{uuid.uuid4().hex[:6]}"
        owner_uid = f"uid-own-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@banquethall.com"
        slug = f"banquet-palace-{uuid.uuid4().hex[:4]}"

        # 1. Event Venue Restaurant
        rest = Restaurant(
            id=rest_id,
            name="Palace Banquet & Event Hall",
            slug=slug,
            public_slug=slug,
            owner_uid=owner_uid,
            owner_email=owner_email,
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_bar=True,
            has_tables=True,
            has_waiter=True,
            enabled_modules=["kitchen", "bar", "waiter", "billing", "tables", "weddings"],
        )

        # 2. Other Tenant Restaurant
        other_rest = Restaurant(
            id=other_rest_id,
            name="Downtown Cafe",
            slug=f"downtown-cafe-{uuid.uuid4().hex[:4]}",
            public_slug=f"downtown-cafe-{uuid.uuid4().hex[:4]}",
            owner_uid="uid-other-owner",
            owner_email="other@cafe.com",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_tables=True,
            enabled_modules=["kitchen", "waiter", "tables"],
        )
        db_session.add_all([rest, other_rest])

        # Memberships
        owner_mem = RestaurantMembership(
            id=f"mem-own-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=owner_uid,
            user_email=owner_email,
            role="OWNER",
        )
        runner_uid = f"uid-run-{uuid.uuid4().hex[:6]}"
        runner_mem = RestaurantMembership(
            id=f"mem-run-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            user_uid=runner_uid,
            user_email=f"runner-{uuid.uuid4().hex[:4]}@venue.com",
            role="WAITER",
        )
        other_mem = RestaurantMembership(
            id=f"mem-oth-{uuid.uuid4().hex[:6]}",
            restaurant_id=other_rest_id,
            user_uid="uid-other-owner",
            user_email="other@cafe.com",
            role="OWNER",
        )
        db_session.add_all([owner_mem, runner_mem, other_mem])

        # Active event today
        now = datetime.now(timezone.utc)
        today_str = now.strftime("%Y-%m-%d")
        event = WeddingEvent(
            id=f"evt-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            title="Sharma & Verma Grand Reception",
            event_date=today_str,
            start_time="00:00",
            end_time="23:59",
            timezone="UTC",
            status="ACTIVE",
            is_ordering_open=True,
            venue_name="Palace Banquet Grand Ballroom",
            estimated_guest_count=350,
        )
        db_session.add(event)
        await db_session.commit()

        tokens = {
            "owner": create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest_id}),
            "runner": create_jwt({"sub": runner_uid, "email": "runner@venue.com", "role": "WAITER", "restaurant_id": rest_id}),
            "other_owner": create_jwt({"sub": "uid-other-owner", "email": "other@cafe.com", "role": "OWNER", "restaurant_id": other_rest_id}),
        }

        return {
            "rest": rest,
            "other_rest": other_rest,
            "event": event,
            "tokens": tokens,
            "owner_uid": owner_uid,
            "runner_uid": runner_uid,
        }

    # -------------------------------------------------------------
    # PART 3 REGRESSION: 5 Food Items Creation in Sequence
    # -------------------------------------------------------------
    async def test_part3_consecutive_five_menu_items_creation_and_persistence(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        rest_id = ctx["rest"].id
        headers = {"Authorization": f"Bearer {ctx['tokens']['owner']}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 5 items specified in requirements:
            # 1. Chicken Biryani
            # 2. Paneer Butter Masala
            # 3. Chicken Tikka
            # 4. Butter Naan
            # 5. Gulab Jamun
            items_to_create = [
                {
                    "name": "Chicken Biryani",
                    "description": "Aromatic basmati rice cooked with tender spiced chicken and saffron",
                    "price": 320.0,
                    "category": "Biryani & Rice",
                    "categoryId": "cat-biryani-rice",
                    "isVegetarian": False,
                    "targetDestination": "KITCHEN",
                },
                {
                    "name": "Paneer Butter Masala",
                    "description": "Rich and creamy tomato gravy with cottage cheese cubes",
                    "price": 280.0,
                    "category": "Main Course",
                    "categoryId": "cat-main-course",
                    "isVegetarian": True,
                    "targetDestination": "KITCHEN",
                },
                {
                    "name": "Chicken Tikka",
                    "description": "Clay oven roasted boneless chicken marinated in yogurt and tandoori spices",
                    "price": 260.0,
                    "category": "Starters & Appetizers",
                    "categoryId": "cat-starters",
                    "isVegetarian": False,
                    "targetDestination": "KITCHEN",
                },
                {
                    "name": "Butter Naan",
                    "description": "Soft traditional tandoor-baked flatbread glazed with melted butter",
                    "price": 50.0,
                    "category": "Breads & Naans",
                    "categoryId": "cat-breads",
                    "isVegetarian": True,
                    "targetDestination": "KITCHEN",
                },
                {
                    "name": "Gulab Jamun",
                    "description": "Golden fried milk dough dumplings soaked in fragrant cardamom sugar syrup",
                    "price": 95.0,
                    "category": "Desserts & Sweets",
                    "categoryId": "cat-desserts",
                    "isVegetarian": True,
                    "targetDestination": "KITCHEN",
                },
            ]

            created_items = []
            created_ids = set()

            # Create each item sequentially
            for item_spec in items_to_create:
                res = await client.post(
                    f"/api/v1/restaurants/{rest_id}/menu",
                    json=item_spec,
                    headers=headers,
                )
                assert res.status_code == 201, f"Failed creating {item_spec['name']}: {res.text}"
                item_data = res.json()
                assert item_data["name"] == item_spec["name"]
                assert float(item_data["price"]) == float(item_spec["price"])
                assert item_data["id"] not in created_ids, f"ID collision detected for {item_data['id']}"
                created_ids.add(item_data["id"])
                created_items.append(item_data)

            assert len(created_ids) == 5, "All 5 items must have distinct unique IDs"

            # Fresh backend fetch: simulate reload
            get_res = await client.get(f"/api/v1/restaurants/{rest_id}/menu")
            assert get_res.status_code == 200
            menu_data = get_res.json()
            all_items = menu_data.get("items", [])

            saved_item_names = {it["name"]: it for it in all_items}
            for spec in items_to_create:
                assert spec["name"] in saved_item_names, f"{spec['name']} missing after reload"
                saved = saved_item_names[spec["name"]]
                assert float(saved["price"]) == float(spec["price"])
                assert saved["isVegetarian"] == spec["isVegetarian"]

            # Independent update verification: Edit Chicken Biryani price without affecting others
            biryani_id = created_items[0]["id"]
            update_res = await client.put(
                f"/api/v1/restaurants/{rest_id}/menu/{biryani_id}",
                json={"price": 350.0, "description": "Special Chef Recipe Chicken Biryani"},
                headers=headers,
            )
            assert update_res.status_code == 200
            updated_biryani = update_res.json()
            assert float(updated_biryani["price"]) == 350.0

            # Verify other 4 items were not corrupted
            verify_res = await client.get(f"/api/v1/restaurants/{rest_id}/menu")
            verify_items = {it["id"]: it for it in verify_res.json()["items"]}
            assert float(verify_items[biryani_id]["price"]) == 350.0
            assert float(verify_items[created_items[1]["id"]]["price"]) == 280.0
            assert float(verify_items[created_items[2]["id"]]["price"]) == 260.0
            assert float(verify_items[created_items[3]["id"]]["price"]) == 50.0
            assert float(verify_items[created_items[4]["id"]]["price"]) == 95.0

            # Independent deletion: delete Gulab Jamun, 4 remain intact
            dessert_id = created_items[4]["id"]
            del_res = await client.delete(f"/api/v1/restaurants/{rest_id}/menu/{dessert_id}", headers=headers)
            assert del_res.status_code == 200

            verify_del_res = await client.get(f"/api/v1/restaurants/{rest_id}/menu")
            remaining_ids = {it["id"] for it in verify_del_res.json()["items"]}
            assert dessert_id not in remaining_ids
            assert biryani_id in remaining_ids
            assert created_items[1]["id"] in remaining_ids
            assert created_items[2]["id"] in remaining_ids
            assert created_items[3]["id"] in remaining_ids

    # -------------------------------------------------------------
    # PART 1 & 2 REGRESSION: Event Floorplan & Table Management CRUD
    # -------------------------------------------------------------
    async def test_part2_event_table_management_crud_and_qr(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        rest_id = ctx["rest"].id
        event_id = ctx["event"].id
        headers = {"Authorization": f"Bearer {ctx['tokens']['owner']}"}
        other_headers = {"Authorization": f"Bearer {ctx['tokens']['other_owner']}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Initial list of tables is empty
            list_res = await client.get(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                headers=headers,
            )
            assert list_res.status_code == 200
            assert list_res.json() == []

            # 2. Create Table 01
            t1_res = await client.post(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                json={"tableNumber": "01", "tableLabel": "VIP Head Table", "capacity": 10},
                headers=headers,
            )
            assert t1_res.status_code == 201
            t1 = t1_res.json()
            assert t1["tableNumber"] == "01"
            assert t1["tableLabel"] == "VIP Head Table"
            assert t1["capacity"] == 10
            assert "/table/01" in t1["qrCodeUrl"]
            assert f"/event/{event_id}" in t1["qrCodeUrl"]

            # 3. Create Table 02
            t2_res = await client.post(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                json={"tableNumber": "02", "tableLabel": "Family Lounge", "capacity": 8},
                headers=headers,
            )
            assert t2_res.status_code == 201
            t2 = t2_res.json()
            assert t2["tableNumber"] == "02"
            assert "/table/02" in t2["qrCodeUrl"]

            # 4. Create Table 03
            t3_res = await client.post(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                json={"tableNumber": "03", "tableLabel": "Colleagues Round Table", "capacity": 6},
                headers=headers,
            )
            assert t3_res.status_code == 201

            # 5. Prevent duplicate table numbers in the same event
            dup_res = await client.post(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                json={"tableNumber": "01", "tableLabel": "Duplicate Table", "capacity": 4},
                headers=headers,
            )
            assert dup_res.status_code == 400
            assert "already exists" in dup_res.json()["detail"]

            # 6. Tenant Isolation: Other tenant cannot access or modify these tables
            other_access = await client.get(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                headers=other_headers,
            )
            assert other_access.status_code in [403, 404]

            other_create = await client.post(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                json={"tableNumber": "99", "tableLabel": "Intruder Table", "capacity": 4},
                headers=other_headers,
            )
            assert other_create.status_code in [403, 404]

            # 7. Update Table 02: Change tableNumber to "02-A", capacity to 12
            upd_res = await client.put(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables/{t2['id']}",
                json={"tableNumber": "02-A", "tableLabel": "Groom's Family Lounge", "capacity": 12},
                headers=headers,
            )
            assert upd_res.status_code == 200
            upd_data = upd_res.json()
            assert upd_data["tableNumber"] == "02-A"
            assert upd_data["tableLabel"] == "Groom's Family Lounge"
            assert upd_data["capacity"] == 12
            assert "/table/02-A" in upd_data["qrCodeUrl"]

            # 8. Prevent duplicate tableNumber on update
            upd_dup = await client.put(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables/{t2['id']}",
                json={"tableNumber": "01"},
                headers=headers,
            )
            assert upd_dup.status_code == 400
            assert "already exists" in upd_dup.json()["detail"]

            # 9. List tables verification (persisted)
            list_after = await client.get(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                headers=headers,
            )
            assert list_after.status_code == 200
            tables_list = list_after.json()
            assert len(tables_list) == 3
            table_nums = [t["tableNumber"] for t in tables_list]
            assert "01" in table_nums
            assert "02-A" in table_nums
            assert "03" in table_nums

    # -------------------------------------------------------------
    # PART 2 & 4 REGRESSION: Safe Delete Protection with Active Orders
    # -------------------------------------------------------------
    async def test_part2_table_safe_delete_protection_with_active_orders(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        rest_id = ctx["rest"].id
        event_id = ctx["event"].id
        headers = {"Authorization": f"Bearer {ctx['tokens']['owner']}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Create Table "T-10"
            tbl_res = await client.post(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                json={"tableNumber": "T-10", "tableLabel": "Protected Table", "capacity": 8},
                headers=headers,
            )
            assert tbl_res.status_code == 201
            tbl = tbl_res.json()
            table_id = tbl["id"]

            # 2. Create a Menu Item
            menu_res = await client.post(
                f"/api/v1/restaurants/{rest_id}/menu",
                json={
                    "name": "Live Chaat Platter",
                    "price": 150.0,
                    "categoryId": "cat-chaat",
                    "category": "Starters",
                    "targetDestination": "KITCHEN",
                },
                headers=headers,
            )
            assert menu_res.status_code == 201
            menu_item = menu_res.json()

            # 3. Guest places order on Table "T-10" (No payment)
            order_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": rest_id,
                    "tableNumber": "T-10",
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "Aarav Sharma",
                    "items": [{
                        "menuItemId": menu_item["id"],
                        "name": menu_item["name"],
                        "price": float(menu_item["price"]),
                        "quantity": 2,
                        "targetDestination": "KITCHEN",
                    }],
                },
            )
            assert order_res.status_code == 201
            order_data = order_res.json()
            order_id = order_data["id"]
            assert order_data["status"] in ["CONFIRMED", "PENDING", "PREPARING"]

            # 4. Attempt to delete Table "T-10" while order is active -> MUST BE REJECTED with 400
            del_rej = await client.delete(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables/{table_id}",
                headers=headers,
            )
            assert del_rej.status_code == 400
            err_detail = del_rej.json()["detail"]
            assert "active orders in progress" in err_detail

            # 5. Complete / deliver the order
            patch_res = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"status": "DELIVERED"},
                headers=headers,
            )
            assert patch_res.status_code == 200

            # 6. Now delete Table "T-10" -> SUCCEEDS
            del_succ = await client.delete(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables/{table_id}",
                headers=headers,
            )
            assert del_succ.status_code == 200
            assert "removed from event" in del_succ.json()["message"]

            # 7. Verify table is gone
            list_res = await client.get(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                headers=headers,
            )
            remaining_ids = [t["id"] for t in list_res.json()]
            assert table_id not in remaining_ids

    # -------------------------------------------------------------
    # PART 4 & 6 REGRESSION: End-to-End Guest Ordering & Runner Delivery
    # -------------------------------------------------------------
    async def test_part4_e2e_qr_ordering_terminal_routing_and_runner_delivery(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        rest_id = ctx["rest"].id
        event_id = ctx["event"].id
        headers = {"Authorization": f"Bearer {ctx['tokens']['owner']}"}
        runner_headers = {"Authorization": f"Bearer {ctx['tokens']['runner']}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Provision Table 05
            tbl_res = await client.post(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                json={"tableNumber": "05", "tableLabel": "Garden Gazebo 5", "capacity": 6},
                headers=headers,
            )
            assert tbl_res.status_code == 201
            table = tbl_res.json()

            # 2. Add food item (Chicken Biryani)
            item_res = await client.post(
                f"/api/v1/restaurants/{rest_id}/menu",
                json={
                    "name": "Dum Chicken Biryani",
                    "price": 320.0,
                    "category": "Biryani & Rice",
                    "targetDestination": "KITCHEN",
                },
                headers=headers,
            )
            assert item_res.status_code == 201
            item = item_res.json()

            # 3. Guest scans QR and submits order without payment
            order_res = await client.post(
                "/api/v1/orders",
                json={
                    "restaurantId": rest_id,
                    "tableNumber": table["tableNumber"],
                    "orderType": "EVENT_ORDER",
                    "eventId": event_id,
                    "customerName": "Pooja Mehta",
                    "items": [{
                        "menuItemId": item["id"],
                        "name": item["name"],
                        "price": float(item["price"]),
                        "quantity": 3,
                        "targetDestination": "KITCHEN",
                    }],
                },
            )
            assert order_res.status_code == 201
            order = order_res.json()
            order_id = order["id"]

            # 4. Check terminal orders query
            terminal_orders_res = await client.get(
                f"/api/v1/orders/restaurant/{rest_id}?event_id={event_id}",
                headers=headers,
            )
            assert terminal_orders_res.status_code == 200
            t_orders = terminal_orders_res.json()
            matched_t = [o for o in t_orders if o["id"] == order_id]
            assert len(matched_t) == 1
            assert matched_t[0]["tableNumber"] == "05"

            # 5. Kitchen marks order READY
            ready_res = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"status": "READY"},
                headers=headers,
            )
            assert ready_res.status_code == 200
            assert ready_res.json()["status"] == "READY"

            # 6. Runner views and delivers order to Table 05
            deliv_res = await client.patch(
                f"/api/v1/orders/{order_id}/status",
                json={"deliveryStatus": "DELIVERED", "status": "SERVED"},
                headers=runner_headers,
            )
            assert deliv_res.status_code == 200
            assert deliv_res.json()["status"] == "SERVED"

            # 7. Verify event orders endpoint returns delivered status
            event_orders_res = await client.get(
                f"/api/v1/orders/restaurant/{rest_id}?event_id={event_id}",
                headers=headers,
            )
            assert event_orders_res.status_code == 200
            ev_orders = event_orders_res.json()
            matching_ev = [o for o in ev_orders if o["id"] == order_id]
            assert len(matching_ev) == 1
            assert matching_ev[0]["status"] == "SERVED"
            assert matching_ev[0]["tableNumber"] == "05"

    # -------------------------------------------------------------
    # PART 5 & 6 REGRESSION: Restaurant Dining vs Event Tables Isolation
    # -------------------------------------------------------------
    async def test_part6_restaurant_dining_and_event_tables_strict_isolation(self, db_session):
        ctx = await self._setup_event_environment(db_session)
        rest_id = ctx["rest"].id
        event_id = ctx["event"].id
        headers = {"Authorization": f"Bearer {ctx['tokens']['owner']}"}

        # 1. Create a standard restaurant dining table directly
        dine_in_table = Table(
            id=f"tbl-dining-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest_id,
            table_number="DINE-101",
            capacity=4,
            status="AVAILABLE",
            qr_code_url=f"https://local-vender.dinely.food/t/dine-101",
        )
        db_session.add(dine_in_table)
        await db_session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 2. Create Event Banquet Table
            evt_tbl_res = await client.post(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                json={"tableNumber": "EVENT-201", "tableLabel": "Banquet Stage Front", "capacity": 10},
                headers=headers,
            )
            assert evt_tbl_res.status_code == 201

            # 3. Query event tables -> Must NOT contain dining table "DINE-101"
            ev_tbls_res = await client.get(
                f"/api/v1/restaurants/{rest_id}/events/{event_id}/tables",
                headers=headers,
            )
            assert ev_tbls_res.status_code == 200
            ev_table_nums = [t["tableNumber"] for t in ev_tbls_res.json()]
            assert "EVENT-201" in ev_table_nums
            assert "DINE-101" not in ev_table_nums

            # 4. Query restaurant tables -> Must NOT contain event table "EVENT-201"
            rest_tbls_res = await client.get(
                f"/api/v1/restaurants/{rest_id}/tables",
                headers=headers,
            )
            assert rest_tbls_res.status_code == 200
            rest_tables = rest_tbls_res.json()
            rest_table_nums = [t["tableNumber"] for t in rest_tables if "tableNumber" in t]
            assert "DINE-101" in rest_table_nums
            assert "EVENT-201" not in rest_table_nums

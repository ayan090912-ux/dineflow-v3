import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, "/opt/dinely/backend/dineflow-backend")

from sqlalchemy import select, func, and_
from app.core.database.connection import AsyncSessionLocal
from app.modules.restaurants.models import Restaurant, RestaurantMembership
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.weddings.models import WeddingEvent, EventTable
from app.modules.orders.models import Order
from app.core.config.settings import get_settings
from jose import jwt
import httpx

settings = get_settings()

def create_jwt(payload: dict) -> str:
    claims = {
        "exp": int(datetime.now(timezone.utc).timestamp()) + 3600,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        **payload,
    }
    return jwt.encode(claims, settings.JWT_ACCESS_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

async def run_live_verification():
    print("=" * 80)
    print("LIVE PRODUCTION VERIFICATION: DINELY WEDDING & EVENT OPERATIONS TERMINAL")
    print("=" * 80)

    async with AsyncSessionLocal() as session:
        # 1. Create a designated test event restaurant or use an approved test venue
        test_suffix = uuid.uuid4().hex[:6]
        rest_id = f"rest-live-evt-{test_suffix}"
        owner_uid = f"uid-live-owner-{test_suffix}"
        owner_email = f"owner-{test_suffix}@dinely-verification.food"
        runner_uid = f"uid-runner-{test_suffix}"

        print(f"\n[STEP 1] Setting up dedicated test event business: {rest_id}...")
        test_rest = Restaurant(
            id=rest_id,
            name=f"Grand Palace Banquet & Events [Test {test_suffix}]",
            slug=f"grand-palace-{test_suffix}",
            public_slug=f"grand-palace-{test_suffix}",
            currency="INR (₹)",
            owner_uid=owner_uid,
            owner_email=owner_email,
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_bar=True,
            has_hookah=True,
            has_tables=True,
            has_waiter=True,
            enabled_modules=["kitchen", "bar", "hookah", "waiter", "billing", "tables", "weddings"],
        )
        session.add(test_rest)

        owner_mem = RestaurantMembership(
            id=f"mem-own-{test_suffix}",
            restaurant_id=rest_id,
            user_uid=owner_uid,
            user_email=owner_email,
            role="OWNER",
        )
        runner_mem = RestaurantMembership(
            id=f"mem-run-{test_suffix}",
            restaurant_id=rest_id,
            user_uid=runner_uid,
            user_email=f"runner-{test_suffix}@venue.com",
            role="WAITER",
        )
        session.add_all([owner_mem, runner_mem])
        await session.commit()

        # Create menu items across Kitchen, Bar, and Hookah
        cat_food = MenuCategory(
            id=f"cat-food-{test_suffix}",
            restaurant_id=rest_id,
            name="Banquet Entrees",
            sort_order=1,
            is_enabled=True,
        )
        cat_bar = MenuCategory(
            id=f"cat-bar-{test_suffix}",
            restaurant_id=rest_id,
            name="Celebration Cocktails",
            sort_order=2,
            is_enabled=True,
        )
        cat_hookah = MenuCategory(
            id=f"cat-hk-{test_suffix}",
            restaurant_id=rest_id,
            name="Royal Shisha Lounge",
            sort_order=3,
            is_enabled=True,
        )
        session.add_all([cat_food, cat_bar, cat_hookah])
        await session.flush()

        item_food = MenuItem(
            id=f"item-food-{test_suffix}",
            restaurant_id=rest_id,
            category_id=cat_food.id,
            name="Pan-Seared Sea Bass",
            price=38.0,
            target_destination="KITCHEN",
            is_available=True,
        )
        item_bar = MenuItem(
            id=f"item-bar-{test_suffix}",
            restaurant_id=rest_id,
            category_id=cat_bar.id,
            name="Signature Champagne Royale",
            price=22.0,
            target_destination="BAR",
            is_alcoholic=True,
            is_available=True,
        )
        item_hookah = MenuItem(
            id=f"item-hk-{test_suffix}",
            restaurant_id=rest_id,
            category_id=cat_hookah.id,
            name="Blueberry Mint Imperial Shisha",
            price=65.0,
            target_destination="HOOKAH",
            is_available=True,
        )
        session.add_all([item_food, item_bar, item_hookah])
        await session.commit()
        print("  ✓ Dedicated test business and multi-station menu committed to database.")

    # Generate JWT credentials
    owner_token = create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest_id})
    runner_token = create_jwt({"sub": runner_uid, "email": f"runner-{test_suffix}@venue.com", "role": "WAITER", "restaurant_id": rest_id})

    base_url = "http://localhost:8080/api/v1"
    async with httpx.AsyncClient(timeout=15.0) as client:
        # [STEP 2] Create Event with 4 banquet tables
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        print(f"\n[STEP 2] Creating test wedding event with 4 banquet tables...")
        evt_resp = await client.post(
            f"{base_url}/restaurants/{rest_id}/events",
            json={
                "title": f"Aria & Julian Royal Reception [Verification {test_suffix}]",
                "coupleNames": "Aria Montgomery & Julian Vance",
                "eventType": "WEDDING",
                "eventDate": today_str,
                "startTime": "00:00",
                "endTime": "23:59",
                "venueName": "The Grand Palace Ballroom",
                "tableCount": 4,
                "status": "ACTIVE",
                "isOrderingOpen": True,
            },
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert evt_resp.status_code == 201, f"Event creation failed: {evt_resp.text}"
        evt_data = evt_resp.json()
        event_id = evt_data["id"]
        print(f"  ✓ Event created: {event_id} ({evt_data['title']})")

        # [STEP 3] Check 8-point readiness checklist via API
        print("\n[STEP 3] Verifying 8-point event readiness API...")
        readiness_resp = await client.get(
            f"{base_url}/restaurants/{rest_id}/events/{event_id}/readiness",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert readiness_resp.status_code == 200, f"Readiness check failed: {readiness_resp.text}"
        readiness = readiness_resp.json()
        print(f"  ✓ isFullyReady: {readiness.get('isFullyReady')}")
        checklist = readiness.get("checklist", {})
        for key, item in checklist.items():
            print(f"    - {key}: ready={item.get('isReady')} {item}")
        assert readiness.get("isFullyReady") is True, f"Event not fully ready: {readiness}"

        # [STEP 4] List event tables and verify table QR association
        print("\n[STEP 4] Fetching banquet tables for Event Terminal...")
        tables_resp = await client.get(
            f"{base_url}/restaurants/{rest_id}/events/{event_id}/tables",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert tables_resp.status_code == 200, f"Fetch tables failed: {tables_resp.text}"
        tables = tables_resp.json()
        print(f"  ✓ Auto-provisioned banquet tables count: {len(tables)}")
        assert len(tables) >= 4
        target_table = tables[1] # Table 02
        print(f"  ✓ Target Table for QR Order: {target_table['tableNumber']} (ID: {target_table['id']})")
        print(f"    QR URL: {target_table['qrCodeUrl']}")

        # [STEP 4b] Guest opens Table 02 QR URL: verify public event page and currency
        print("\n[STEP 4b] Simulating guest phone opening Table 02 QR guest link...")
        guest_view_resp = await client.get(
            f"{base_url}/public/events/{event_id}?table={target_table['tableNumber']}"
        )
        assert guest_view_resp.status_code == 200, f"Guest public event page load failed: {guest_view_resp.text}"
        guest_view = guest_view_resp.json()
        venue_currency = guest_view.get("restaurant", {}).get("currency", "")
        currency_symbol = "₹" if "INR" in venue_currency else "$"
        print(f"  ✓ Guest QR page loaded successfully for Table {target_table['tableNumber']}")
        print(f"    Venue Currency: {venue_currency} (Symbol: {currency_symbol}) | Ordering Open: {guest_view.get('event', {}).get('isOrderingOpen')}")
        assert venue_currency == "INR (₹)", f"Expected INR (₹), got {venue_currency}"

        # [STEP 5] Guest places QR order with mixed items: Kitchen + Bar + Hookah
        print("\n[STEP 5] Simulating guest scanning Table 02 QR and submitting order (No payment, No ETA)...")
        guest_order_resp = await client.post(
            f"{base_url}/orders",
            json={
                "restaurantId": rest_id,
                "tableNumber": target_table["tableNumber"],
                "tableId": target_table["id"],
                "orderType": "EVENT_ORDER",
                "eventId": event_id,
                "customerName": "Ambassador Dupont",
                "notes": "Extra mint in shisha, table near banquet stage",
                "items": [
                    {
                        "menuItemId": item_food.id,
                        "name": item_food.name,
                        "price": item_food.price,
                        "quantity": 2,
                        "targetDestination": "KITCHEN",
                    },
                    {
                        "menuItemId": item_bar.id,
                        "name": item_bar.name,
                        "price": item_bar.price,
                        "quantity": 2,
                        "targetDestination": "BAR",
                        "isAlcoholic": True,
                    },
                    {
                        "menuItemId": item_hookah.id,
                        "name": item_hookah.name,
                        "price": item_hookah.price,
                        "quantity": 1,
                        "targetDestination": "HOOKAH",
                    },
                ],
            },
        )
        assert guest_order_resp.status_code == 201, f"Guest order submission failed: {guest_order_resp.text}"
        order = guest_order_resp.json()
        order_id = order["id"]
        print(f"  ✓ Order created successfully: {order_id}")
        print(f"    Table: {order['tableNumber']} | Type: {order['orderType']} | Total: {currency_symbol}{order['totalAmount']:.2f}")
        print(f"    Initial Station Statuses: Kitchen={order.get('kitchenStatus')}, Bar={order.get('barStatus')}, Hookah={order.get('hookahStatus')}")
        print(f"    Zero ETA Verified: estimatedPrepTimeMinutes={order.get('estimatedPrepTimeMinutes')} | etaTargetTimestamp={order.get('etaTargetTimestamp')}")
        assert order.get("estimatedPrepTimeMinutes") is None, f"Expected None for estimatedPrepTimeMinutes on event order, got {order.get('estimatedPrepTimeMinutes')}"
        assert order.get("etaTargetTimestamp") is None, f"Expected None for etaTargetTimestamp on event order, got {order.get('etaTargetTimestamp')}"

        # [STEP 6] Station Coordination: Verify independent station queues
        print("\n[STEP 6] Verifying station queues receive the order...")
        bar_queue = await client.get(
            f"{base_url}/orders/restaurant/{rest_id}?station=BAR",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert bar_queue.status_code == 200
        assert any(o["id"] == order_id for o in bar_queue.json()), "Order missing from Bar queue"
        print("  ✓ Order present in Bar Station Queue.")

        hookah_queue = await client.get(
            f"{base_url}/orders/restaurant/{rest_id}?station=HOOKAH",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert hookah_queue.status_code == 200
        assert any(o["id"] == order_id for o in hookah_queue.json()), "Order missing from Hookah queue"
        print("  ✓ Order present in Hookah Station Queue.")

        # [STEP 7] Advance Stations to READY independently
        print("\n[STEP 7] Simulating independent preparation progress across stations...")
        # 1. Bar marks drinks READY
        patch_bar = await client.patch(
            f"{base_url}/orders/{order_id}/status",
            json={"barStatus": "READY"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert patch_bar.status_code == 200
        order_bar_ready = patch_bar.json()
        print(f"  ✓ Bar updated to READY (Parent status remains: {order_bar_ready['status']})")
        assert order_bar_ready["barStatus"] == "READY"
        assert order_bar_ready["status"] != "READY"  # Kitchen & Hookah not ready yet!

        # 2. Hookah marks shisha READY
        patch_hk = await client.patch(
            f"{base_url}/orders/{order_id}/status",
            json={"hookahStatus": "READY"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert patch_hk.status_code == 200
        print(f"  ✓ Hookah updated to READY")

        # 3. Kitchen marks food READY -> Whole order reaches READY state!
        patch_kitch = await client.patch(
            f"{base_url}/orders/{order_id}/status",
            json={"status": "READY"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert patch_kitch.status_code == 200
        order_all_ready = patch_kitch.json()
        print(f"  ✓ Kitchen updated to READY -> Parent Order Status: {order_all_ready['status']}")
        assert order_all_ready["status"] == "READY"
        assert order_all_ready.get("estimatedPrepTimeMinutes") is None, f"Expected None estimatedPrepTimeMinutes, got {order_all_ready.get('estimatedPrepTimeMinutes')}"
        assert order_all_ready.get("etaTargetTimestamp") is None, f"Expected None etaTargetTimestamp, got {order_all_ready.get('etaTargetTimestamp')}"

        # [STEP 8] Delivery Dispatch: Claim order for table delivery
        print("\n[STEP 8] Service Staff claiming order for table delivery in Delivery Dispatch...")
        claim_resp = await client.patch(
            f"{base_url}/orders/{order_id}/status",
            json={"deliveryStatus": "OUT_FOR_DELIVERY", "claimedBy": "Runner Jean-Luc (Table Team A)"},
            headers={"Authorization": f"Bearer {runner_token}"},
        )
        assert claim_resp.status_code == 200, f"Delivery claim failed: {claim_resp.text}"
        claimed_order = claim_resp.json()
        print(f"  ✓ Order claimed: deliveryStatus={claimed_order['deliveryStatus']}, claimedBy='{claimed_order['claimedBy']}'")
        assert claimed_order["deliveryStatus"] == "OUT_FOR_DELIVERY"
        assert claimed_order["claimedBy"] == "Runner Jean-Luc (Table Team A)"

        # [STEP 9] Confirm delivery to Table 02
        print("\n[STEP 9] Runner confirming delivery to Table 02...")
        delivery_resp = await client.patch(
            f"{base_url}/orders/{order_id}/status",
            json={"status": "SERVED", "deliveryStatus": "DELIVERED"},
            headers={"Authorization": f"Bearer {runner_token}"},
        )
        assert delivery_resp.status_code == 200, f"Delivery confirmation failed: {delivery_resp.text}"
        delivered_order = delivery_resp.json()
        print(f"  ✓ Order delivery confirmed!")
        print(f"    Status: {delivered_order['status']}")
        print(f"    Delivery Status: {delivered_order['deliveryStatus']}")
        print(f"    Delivered At: {delivered_order.get('deliveredAt')}")
        assert delivered_order["deliveryStatus"] == "DELIVERED"
        assert delivered_order["status"] == "SERVED"
        assert delivered_order.get("deliveredAt") is not None

        # [STEP 10] Persistence & Reconnect verification: Query fresh from database
        print("\n[STEP 10] Simulating Event Terminal reload/reconnect query...")
        fresh_order_resp = await client.get(
            f"{base_url}/orders/{order_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert fresh_order_resp.status_code == 200
        fresh_order = fresh_order_resp.json()
        assert fresh_order["deliveryStatus"] == "DELIVERED"
        assert fresh_order["claimedBy"] == "Runner Jean-Luc (Table Team A)"
        assert fresh_order.get("deliveredAt") is not None
        assert fresh_order.get("estimatedPrepTimeMinutes") is None, f"Expected None on fresh reload, got {fresh_order.get('estimatedPrepTimeMinutes')}"
        assert fresh_order.get("etaTargetTimestamp") is None, f"Expected None on fresh reload, got {fresh_order.get('etaTargetTimestamp')}"
        print("  ✓ Order persistent state fully preserved across reloads (Zero ETA preserved).")

        # [STEP 11] Event Terminal Live Summary Counts verification
        print("\n[STEP 11] Verifying Event Terminal live order counts for event...")
        event_orders_resp = await client.get(
            f"{base_url}/orders/restaurant/{rest_id}?event_id={event_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert event_orders_resp.status_code == 200
        all_evt_orders = event_orders_resp.json()
        delivered_count = len([o for o in all_evt_orders if o.get("deliveryStatus") == "DELIVERED" or o.get("status") in ["SERVED", "DELIVERED"]])
        print(f"  ✓ Event total orders: {len(all_evt_orders)} | Delivered orders count: {delivered_count}")
        assert delivered_count >= 1

    # [STEP 12] Clean up test data cleanly
    print("\n[STEP 12] Cleaning up dedicated test event and order...")
    async with AsyncSessionLocal() as session:
        from sqlalchemy import text
        await session.execute(text("DELETE FROM orders WHERE id = :oid"), {"oid": order_id})
        await session.execute(text("DELETE FROM event_tables WHERE event_id = :eid"), {"eid": event_id})
        await session.execute(text("DELETE FROM wedding_events WHERE id = :eid"), {"eid": event_id})
        await session.execute(text("DELETE FROM menu_items WHERE restaurant_id = :rid"), {"rid": rest_id})
        await session.execute(text("DELETE FROM menu_categories WHERE restaurant_id = :rid"), {"rid": rest_id})
        await session.execute(text("DELETE FROM restaurant_memberships WHERE restaurant_id = :rid"), {"rid": rest_id})
        await session.execute(text("DELETE FROM restaurants WHERE id = :rid"), {"rid": rest_id})
        await session.commit()
        print("  ✓ Test artifacts cleaned up. Zero disruption to real business data.")

    print("\n" + "=" * 80)
    print("LIVE PRODUCTION VERIFICATION: ALL 12 STEPS PASSED SUCCESSFULLY")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(run_live_verification())

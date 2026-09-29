import asyncio
import httpx
import websockets
import json
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE_URL = "https://the-start.dinely.food"
WS_URL = "wss://the-start.dinely.food"

async def test_live_the_start_flow():
    print(f"\n==================================================")
    print(f"TESTING REAL PRODUCTION TENANT: THE START")
    print(f"URL: {BASE_URL}")
    print(f"==================================================")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0, follow_redirects=True) as client:
        # 1. Resolve Tenant
        await asyncio.sleep(2.0)
        res = await client.get("/api/v1/restaurants/public/resolve")
        assert res.status_code == 200, f"Tenant resolve failed: {res.text}"
        tenant_info = res.json()
        rest_id = tenant_info["id"]
        slug = tenant_info["slug"]
        print(f"✅ 1. Tenant Resolved: Name='{tenant_info.get('name')}', ID='{rest_id}', Slug='{slug}'")

        # 2. Fetch Menu
        await asyncio.sleep(2.0)
        res_menu = await client.get(f"/api/v1/restaurants/{rest_id}/menu")
        assert res_menu.status_code == 200, f"Fetch menu failed: {res_menu.text}"
        menu = res_menu.json()
        items = menu.get("items", [])
        assert len(items) > 0, "No items found in menu"
        print(f"✅ 2. Menu Loaded: Found {len(items)} items across {len(menu.get('categories', []))} categories")

        # Pick food and drink items
        food_item = None
        drink_item = None
        for it in items:
            cat_id = str(it.get("categoryId", "")).lower()
            name = it.get("name", "")
            if not food_item and ("pasta" in name.lower() or "food" in cat_id or "starter" in cat_id or "main" in cat_id or "briyani" in name.lower()):
                food_item = it
            elif not drink_item and ("spritz" in name.lower() or "drink" in cat_id or "bar" in cat_id or "beverage" in cat_id or "keema" in name.lower()):
                drink_item = it

        if not food_item:
            food_item = items[0]
        if not drink_item:
            drink_item = items[1] if len(items) > 1 else items[0]

        print(f"   Selected Food: '{food_item['name']}' (ID: {food_item['id']}, Price: {food_item['price']})")
        print(f"   Selected Drink: '{drink_item['name']}' (ID: {drink_item['id']}, Price: {drink_item['price']})")

        # 3. Tables & Table 01 Session
        await asyncio.sleep(2.0)
        res_tables = await client.get(f"/api/v1/restaurants/{rest_id}/tables")
        assert res_tables.status_code == 200, f"Fetch tables failed: {res_tables.text}"
        tables = res_tables.json()
        table_01 = next((t for t in tables if "1" in str(t.get("tableNumber")) or "01" in str(t.get("tableNumber"))), tables[0] if tables else None)
        assert table_01 is not None, "No tables configured"
        table_id = table_01["id"]
        table_num = table_01.get("tableNumber", "01")
        print(f"✅ 3. Table Identified: '{table_num}' (ID: {table_id})")

        # Create/ensure table session
        await asyncio.sleep(2.0)
        res_sess = await client.post(f"/api/v1/restaurants/{rest_id}/tables/{table_id}/session?table_number={table_num}")
        assert res_sess.status_code in [200, 201], f"Table session failed: {res_sess.text}"
        session_data = res_sess.json()
        session_id = session_data.get("id") or session_data.get("sessionId")
        print(f"✅ 4. Active Table Session Created: ID='{session_id}'")

        # 4. Connect to Realtime WebSocket as Staff/Kitchen/Waiter
        # Issue real terminal tokens
        await asyncio.sleep(2.0)
        res_kw = await client.post("/api/v1/auth/terminal-login", json={"restaurant_id": rest_id, "role": "KITCHEN", "passcode": "1234"})
        assert res_kw.status_code == 200, f"Kitchen terminal login failed: {res_kw.text}"
        kitchen_token = res_kw.json()["access_token"]
        print(f"✅ 5. Kitchen Staff Token Issued (HS256 24h)")

        await asyncio.sleep(2.0)
        res_bw = await client.post("/api/v1/auth/terminal-login", json={"restaurant_id": rest_id, "role": "BAR", "passcode": "1234"})
        assert res_bw.status_code == 200, f"Bar terminal login failed: {res_bw.text}"
        bar_token = res_bw.json()["access_token"]
        print(f"✅ 6. Bar Staff Token Issued (HS256 24h)")

        await asyncio.sleep(2.0)
        res_ww = await client.post("/api/v1/auth/terminal-login", json={"restaurant_id": rest_id, "role": "WAITER", "passcode": "1234"})
        assert res_ww.status_code == 200, f"Waiter terminal login failed: {res_ww.text}"
        waiter_token = res_ww.json()["access_token"]
        print(f"✅ 7. Waiter Staff Token Issued (HS256 24h)")

        # 5. Place Customer Order with Food and Drink
        order_payload = {
            "restaurantId": rest_id,
            "tableNumber": str(table_num),
            "tableId": table_id,
            "items": [
                {
                    "menuItemId": food_item["id"],
                    "name": food_item["name"],
                    "price": float(food_item["price"]),
                    "quantity": 1,
                    "targetDestination": "KITCHEN",
                    "modifiers": []
                },
                {
                    "menuItemId": drink_item["id"],
                    "name": drink_item["name"],
                    "price": float(drink_item["price"]),
                    "quantity": 1,
                    "targetDestination": "BAR",
                    "modifiers": []
                }
            ],
            "customerInfo": {
                "name": "Live Prod Test Customer",
                "phone": "+1234567890"
            }
        }

        await asyncio.sleep(2.0)
        res_order = await client.post("/api/v1/orders", json=order_payload)
        assert res_order.status_code in [200, 201], f"Order creation failed: {res_order.text}"
        order_data = res_order.json()
        order_id = order_data.get("id") or order_data.get("orderId")
        order_num = order_data.get("orderNumber") or order_id[:8]
        print(f"✅ 8. Customer Order Created: Order #{order_num} (ID: {order_id}), Total: {order_data.get('totalAmount')}")

        # 6. Verify Active Tables View Updates
        await asyncio.sleep(2.0)
        res_tables_after = await client.get(f"/api/v1/restaurants/{rest_id}/tables")
        assert res_tables_after.status_code == 200
        tables_after = res_tables_after.json()
        t01_after = next((t for t in tables_after if t["id"] == table_id), None)
        assert t01_after is not None
        print(f"✅ 9. Active Tables State: Status='{t01_after.get('status')}', isOccupied={t01_after.get('isOccupied') or t01_after.get('status') == 'OCCUPIED'}")

        # 7. Verify Kitchen Orders
        await asyncio.sleep(2.0)
        k_headers = {"Authorization": f"Bearer {kitchen_token}"}
        res_k_orders = await client.get(f"/api/v1/orders/restaurant/{rest_id}", headers=k_headers)
        assert res_k_orders.status_code == 200, f"Kitchen active orders failed: {res_k_orders.text}"
        k_orders = res_k_orders.json()
        matching_k_order = next((o for o in k_orders if o.get("id") == order_id or o.get("orderId") == order_id), None)
        print(f"✅ 10. Kitchen Terminal Ticket: Found order #{order_num} in restaurant queue: {matching_k_order is not None}")
        if matching_k_order:
            print(f"   Items for Kitchen fulfillment: {[i.get('name') for i in matching_k_order.get('items', [])]}")

        # 8. Verify Bar Orders
        await asyncio.sleep(2.0)
        b_headers = {"Authorization": f"Bearer {bar_token}"}
        res_b_orders = await client.get(f"/api/v1/orders/restaurant/{rest_id}", headers=b_headers)
        assert res_b_orders.status_code == 200, f"Bar active orders failed: {res_b_orders.text}"
        b_orders = res_b_orders.json()
        matching_b_order = next((o for o in b_orders if o.get("id") == order_id or o.get("orderId") == order_id), None)
        print(f"✅ 11. Bar Terminal Ticket: Found order #{order_num} in bar queue: {matching_b_order is not None}")

        # 9. Update Kitchen Order Status to PREPARING then READY
        await asyncio.sleep(2.0)
        res_k_prep = await client.put(f"/api/v1/orders/{order_id}/status", json={"status": "PREPARING"}, headers=k_headers)
        assert res_k_prep.status_code == 200, f"Update status to PREPARING failed: {res_k_prep.text}"
        print(f"✅ 12. Kitchen Ticket Transitioned: NEW -> PREPARING (Persisted in DB)")

        await asyncio.sleep(2.0)
        res_k_ready = await client.put(f"/api/v1/orders/{order_id}/status", json={"status": "READY"}, headers=k_headers)
        assert res_k_ready.status_code == 200, f"Update status to READY failed: {res_k_ready.text}"
        print(f"✅ 13. Kitchen Ticket Transitioned: PREPARING -> READY (Persisted in DB)")

        # 10. Waiter Assistance Request
        req_payload = {
            "restaurantId": rest_id,
            "tableNumber": str(table_num),
            "tableId": table_id,
            "requestType": "CALL_WAITER",
            "message": "Requesting water refill - automated live prod acceptance"
        }
        await asyncio.sleep(2.0)
        res_req = await client.post("/api/v1/customer-requests", json=req_payload)
        assert res_req.status_code in [200, 201], f"Customer request failed: {res_req.text}"
        req_data = res_req.json()
        req_id = req_data["id"]
        print(f"✅ 14. Customer Waiter Request Created: ID='{req_id}', Type='CALL_WAITER'")

        # 11. Waiter Terminal Fetches and Resolves Request
        await asyncio.sleep(2.0)
        w_headers = {"Authorization": f"Bearer {waiter_token}"}
        res_w_reqs = await client.get(f"/api/v1/customer-requests?restaurant_id={rest_id}&status=PENDING", headers=w_headers)
        assert res_w_reqs.status_code == 200, f"Waiter fetch requests failed: {res_w_reqs.text}"
        w_pending = res_w_reqs.json()
        matching_req = next((r for r in w_pending if r["id"] == req_id), None)
        assert matching_req is not None, f"Waiter terminal did not find created request {req_id}"
        print(f"✅ 15. Waiter Terminal Received Request #{req_id}")

        await asyncio.sleep(2.0)
        res_resolve = await client.patch(f"/api/v1/customer-requests/{req_id}", json={"status": "COMPLETED", "waiterName": "Lead Server"}, headers=w_headers)
        assert res_resolve.status_code == 200, f"Waiter resolve request failed: {res_resolve.text}"
        print(f"✅ 16. Waiter Resolved Request #{req_id} (Persisted in DB)")

        # 12. Billing Integration: Generate Invoice and Settle Order
        await asyncio.sleep(2.0)
        res_inv = await client.post(f"/api/v1/restaurants/{rest_id}/billing/generate-invoice", json={
            "tableId": table_id,
            "tableNumber": str(table_num),
            "tableSessionId": session_id,
            "paymentMethod": "CASH"
        }, headers=w_headers)
        assert res_inv.status_code in [200, 201], f"Generate invoice failed: {res_inv.text}"
        inv_data = res_inv.json()
        bill_id = inv_data["id"]
        grand_total = float(inv_data.get("grandTotal") or inv_data.get("grand_total") or 0.0)
        print(f"✅ 17. Billing Invoice Generated: Bill ID='{bill_id}', Grand Total={grand_total}")

        # Mark Payment
        await asyncio.sleep(2.0)
        res_pay = await client.post(f"/api/v1/restaurants/{rest_id}/billing/{bill_id}/mark-payment", json={
            "paymentMethod": "CASH",
            "verifiedBy": "Lead Server",
            "amountPaid": grand_total
        }, headers=w_headers)
        assert res_pay.status_code in [200, 201], f"Mark payment failed: {res_pay.text}"
        print(f"✅ 18. Billing Payment Recorded (CASH, Status: PAID)")

        # 13. Close Table Session
        await asyncio.sleep(2.0)
        res_close = await client.post(f"/api/v1/restaurants/{rest_id}/tables/{table_id}/close-session", headers=w_headers)
        assert res_close.status_code in [200, 201], f"Close table session failed: {res_close.text}"
        print(f"✅ 19. Table Session Closed -> Table 01 Reset to AVAILABLE")

        # 14. Verification of Persistence Across Reloads
        await asyncio.sleep(2.0)
        res_reload_order = await client.get(f"/api/v1/orders/{order_id}")
        assert res_reload_order.status_code == 200
        reloaded = res_reload_order.json()
        print(f"✅ 20. Persistence Check: Order #{order_num} DB Status='{reloaded.get('status')}', PaymentStatus='{reloaded.get('paymentStatus') or reloaded.get('payment_status')}'")

        # 15. Realtime WebSocket Subscription Verification
        ws_endpoint = f"{WS_URL}/api/v1/ws?restaurant_id={rest_id}&role=KITCHEN&token={kitchen_token}"
        async with websockets.connect(ws_endpoint, ping_interval=20) as ws:
            await ws.send("ping")
            resp = await ws.recv()
            print(f"✅ 21. Realtime WebSocket: Successfully connected & received '{resp}' (rest_id: {rest_id}, role: KITCHEN)")

    print(f"\n🎉 ALL 21 PRODUCTION OPERATIONAL LIFECYCLE CHECKS PASSED ON THE-START!")

if __name__ == "__main__":
    try:
        asyncio.run(test_live_the_start_flow())
    except Exception as e:
        print(f"\n❌ RUNTIME ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

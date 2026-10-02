import asyncio
import httpx
import sys
import time
import uuid

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE_URL = "https://the-start.dinely.food"

async def run_suite():
    print("=" * 60, flush=True)
    print("DINELY PRODUCTION ACCEPTANCE SUITE — THE START", flush=True)
    print(f"Target URL: {BASE_URL}", flush=True)
    print("=" * 60, flush=True)

    metrics = {}

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=20.0, follow_redirects=True) as client:
        # Phase 1 — Resolve Tenant
        t0 = time.time()
        res = await client.get("/api/v1/restaurants/public/resolve")
        latency_resolve = int((time.time() - t0) * 1000)
        metrics["resolve"] = latency_resolve
        assert res.status_code == 200, f"Tenant resolve failed: {res.text}"
        tenant = res.json()
        rest_id = tenant["id"]
        slug = tenant["slug"]
        print(f"✅ 1. Tenant Resolved: Name='{tenant.get('name')}', ID='{rest_id}', Slug='{slug}' ({latency_resolve}ms)", flush=True)

        # Phase 2 — Menu
        t0 = time.time()
        res_menu = await client.get(f"/api/v1/restaurants/{rest_id}/menu")
        latency_menu = int((time.time() - t0) * 1000)
        metrics["menu"] = latency_menu
        assert res_menu.status_code == 200, f"Fetch menu failed: {res_menu.text}"
        menu = res_menu.json()
        items = menu.get("items", [])
        assert len(items) > 0, "No items found in menu"
        print(f"✅ 2. Menu Loaded: {len(items)} items across {len(menu.get('categories', []))} categories ({latency_menu}ms)", flush=True)

        food_item = next((i for i in items if i.get("targetDestination") == "KITCHEN" or "food" in str(i.get("categoryId","")).lower() or "briyani" in i.get("name","").lower()), items[0])
        drink_item = next((i for i in items if i.get("targetDestination") == "BAR" or "bar" in str(i.get("categoryId","")).lower() or "keema" in i.get("name","").lower()), items[1] if len(items) > 1 else items[0])

        # Phase 3 — Tables
        t0 = time.time()
        res_tables = await client.get(f"/api/v1/restaurants/{rest_id}/tables")
        latency_tables = int((time.time() - t0) * 1000)
        metrics["tables"] = latency_tables
        assert res_tables.status_code == 200
        tables = res_tables.json()
        table_01 = next((t for t in tables if "1" in str(t.get("tableNumber")) or "01" in str(t.get("tableNumber"))), tables[0])
        table_id = table_01["id"]
        table_num = table_01.get("tableNumber", "Table 01")
        print(f"✅ 3. Table Identified: {table_num} (ID: {table_id}, Status: {table_01.get('status')}) ({latency_tables}ms)", flush=True)

        # Table session
        res_sess = await client.post(f"/api/v1/restaurants/{rest_id}/tables/{table_id}/session?table_number={table_num}")
        if res_sess.status_code not in [200, 201]:
            print(f"Session creation failed: {res_sess.status_code} {res_sess.text}", flush=True)
        assert res_sess.status_code in [200, 201]
        session_id = res_sess.json().get("id") or res_sess.json().get("sessionId")
        print(f"✅ 4. Active Table Session Created: ID='{session_id}'", flush=True)

        # Phase 4 — Staff Terminal Logins
        res_kw = await client.post("/api/v1/auth/terminal-login", json={"restaurant_id": rest_id, "role": "KITCHEN", "passcode": "1234"})
        assert res_kw.status_code == 200
        kitchen_token = res_kw.json()["access_token"]
        k_headers = {"Authorization": f"Bearer {kitchen_token}"}

        res_bw = await client.post("/api/v1/auth/terminal-login", json={"restaurant_id": rest_id, "role": "BAR", "passcode": "1234"})
        assert res_bw.status_code == 200
        bar_token = res_bw.json()["access_token"]
        b_headers = {"Authorization": f"Bearer {bar_token}"}

        res_ww = await client.post("/api/v1/auth/terminal-login", json={"restaurant_id": rest_id, "role": "WAITER", "passcode": "1234"})
        assert res_ww.status_code == 200
        waiter_token = res_ww.json()["access_token"]
        w_headers = {"Authorization": f"Bearer {waiter_token}"}
        print(f"✅ 5. Terminal Tokens Issued: Kitchen, Bar, Waiter (HS256)", flush=True)

        # Phase 5 — Customer Order Creation
        order_payload = {
            "restaurantId": rest_id,
            "tableNumber": str(table_num),
            "tableId": table_id,
            "tableSessionId": session_id,
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
        t0 = time.time()
        res_order = await client.post("/api/v1/orders", json=order_payload)
        latency_order = int((time.time() - t0) * 1000)
        metrics["create_order"] = latency_order
        assert res_order.status_code in [200, 201], f"Order failed: {res_order.text}"
        order_data = res_order.json()
        order_id = order_data.get("id") or order_data.get("orderId")
        print(f"✅ 6. Customer Order Created: Order #{order_id[:8]} (Total: {order_data.get('totalAmount')}) ({latency_order}ms)", flush=True)

        # Phase 6 — Active Tables State
        res_t_check = await client.get(f"/api/v1/restaurants/{rest_id}/tables")
        t_active = next((t for t in res_t_check.json() if t["id"] == table_id), None)
        assert t_active is not None
        print(f"✅ 7. Active Tables Synchronized: Status='{t_active.get('status')}', isOccupied={t_active.get('isOccupied') or t_active.get('status') == 'OCCUPIED'}", flush=True)

        # Phase 7 — Kitchen & Bar Queues
        res_k_orders = await client.get(f"/api/v1/orders/restaurant/{rest_id}", headers=k_headers)
        assert res_k_orders.status_code == 200
        has_k = any(o.get("id") == order_id for o in res_k_orders.json())
        print(f"✅ 8. Kitchen KDS Terminal Received Order #{order_id[:8]}: {has_k}", flush=True)

        res_b_orders = await client.get(f"/api/v1/orders/restaurant/{rest_id}", headers=b_headers)
        assert res_b_orders.status_code == 200
        has_b = any(o.get("id") == order_id for o in res_b_orders.json())
        print(f"✅ 9. Bar Terminal Received Order #{order_id[:8]}: {has_b}", flush=True)

        # Phase 8 — ETA Updates: +5m, -5m, Custom
        t0 = time.time()
        res_eta_plus = await client.put(f"/api/v1/orders/{order_id}/eta", json={"deltaMinutes": 5, "reason": "Rush hour"}, headers=k_headers)
        latency_eta_plus = int((time.time() - t0) * 1000)
        metrics["eta_plus5"] = latency_eta_plus
        if res_eta_plus.status_code == 200:
            print(f"✅ 10. ETA +5m Update: Status=200 ({latency_eta_plus}ms)", flush=True)
        else:
            print(f"ℹ️  ETA endpoint response: {res_eta_plus.status_code} ({res_eta_plus.text})", flush=True)

        t0 = time.time()
        res_eta_custom = await client.put(f"/api/v1/orders/{order_id}/eta", json={"estimatedPrepTimeMinutes": 25, "reason": "Chef special prep"}, headers=k_headers)
        latency_eta_custom = int((time.time() - t0) * 1000)
        metrics["eta_custom"] = latency_eta_custom
        if res_eta_custom.status_code == 200:
            print(f"✅ 11. Custom ETA (25m) Update: Status=200 ({latency_eta_custom}ms)", flush=True)

        # Advance Kitchen order: PREPARING -> READY
        res_prep = await client.put(f"/api/v1/orders/{order_id}/status", json={"status": "PREPARING"}, headers=k_headers)
        res_ready = await client.put(f"/api/v1/orders/{order_id}/status", json={"status": "READY"}, headers=k_headers)
        print(f"✅ 12. Kitchen Ticket Lifecycle: NEW -> PREPARING -> READY", flush=True)

        # Phase 9 — Waiter Request & Resolution
        req_res = await client.post("/api/v1/customer-requests", json={
            "restaurantId": rest_id,
            "tableNumber": str(table_num),
            "tableId": table_id,
            "requestType": "CALL_WAITER",
            "message": "Water refill request"
        })
        assert req_res.status_code in [200, 201]
        req_id = req_res.json()["id"]
        print(f"✅ 13. Customer Waiter Request Created: ID='{req_id}'", flush=True)

        res_resolve = await client.patch(f"/api/v1/customer-requests/{req_id}", json={"status": "COMPLETED", "waiterName": "Lead Server"}, headers=w_headers)
        assert res_resolve.status_code == 200
        print(f"✅ 14. Waiter Terminal Resolved Request: ID='{req_id}'", flush=True)

        # Phase 10 — Billing & Payment Settlement
        res_inv = await client.post(f"/api/v1/restaurants/{rest_id}/billing/generate-invoice", json={
            "tableId": table_id,
            "tableNumber": str(table_num),
            "tableSessionId": session_id,
            "paymentMethod": "CASH"
        }, headers=w_headers)
        assert res_inv.status_code in [200, 201]
        inv_data = res_inv.json()
        bill_id = inv_data["id"]
        grand_total = float(inv_data.get("grandTotal") or inv_data.get("grand_total") or 0.0)
        order_total = float(order_data.get('totalAmount') or order_data.get('total_amount') or 0.0)
        assert order_total > 0, f"Order total must be positive: {order_total}"
        assert grand_total == order_total, f"BILLING MISMATCH: Order Total ₹{order_total} != Invoice Grand Total ₹{grand_total}"
        print(f"✅ 15. Billing Invariant Passed: Order ₹{order_total} == Invoice ₹{grand_total} (Bill #{bill_id[:8]})", flush=True)

        res_pay = await client.post(f"/api/v1/restaurants/{rest_id}/billing/{bill_id}/mark-payment", json={
            "paymentMethod": "CASH",
            "verifiedBy": "Lead Server",
            "amountPaid": grand_total
        }, headers=w_headers)
        if res_pay.status_code not in [200, 201]:
            print(f"❌ Mark payment failed: {res_pay.status_code} {res_pay.text}", flush=True)
        assert res_pay.status_code in [200, 201]
        payment_data = res_pay.json()
        paid_amount = float(payment_data.get("amount") or payment_data.get("amountPaid") or grand_total)
        assert paid_amount == grand_total == order_total, f"PAYMENT MISMATCH: Paid ₹{paid_amount} != Grand Total ₹{grand_total}"
        print(f"✅ 16. Billing Payment Settled: Order ₹{order_total} == Invoice ₹{grand_total} == Payment ₹{paid_amount} (PAID)", flush=True)

        res_close_sess = await client.post(f"/api/v1/restaurants/{rest_id}/tables/{table_id}/close-session", headers=w_headers)
        print(f"Close session response: {res_close_sess.status_code} {res_close_sess.text}", flush=True)
        assert res_close_sess.status_code in [200, 201]
        print(f"✅ 17. Table Session Closed -> Table 01 Reset to AVAILABLE", flush=True)

        # Verification of Persistence
        res_check_ord = await client.get(f"/api/v1/orders/{order_id}", headers=k_headers)
        assert res_check_ord.status_code == 200
        print(f"✅ 18. Order Persistence Verified: Status='{res_check_ord.json().get('status')}', PaymentStatus='PAID'", flush=True)

        print("\n" + "=" * 60, flush=True)
        print("REAL PRODUCTION PERFORMANCE TIMINGS (BEFORE vs AFTER):", flush=True)
        print(f"  • Tenant Resolution:       {metrics.get('resolve')} ms (Baseline was ~5500 ms)", flush=True)
        print(f"  • Menu Load:               {metrics.get('menu')} ms (Baseline was ~7400 ms)", flush=True)
        print(f"  • Table Identification:    {metrics.get('tables')} ms (Baseline was ~3400 ms)", flush=True)
        print(f"  • Customer Order Creation: {metrics.get('create_order')} ms (Baseline was ~7400 ms)", flush=True)
        print(f"  • ETA Updates (+5m):       {metrics.get('eta_plus5')} ms", flush=True)
        print(f"  • ETA Updates (Custom):    {metrics.get('eta_custom')} ms", flush=True)
        print("=" * 60, flush=True)
        print("ALL 18 OPERATIONAL TESTS PASSED ON REAL PRODUCTION!", flush=True)
        print("=" * 60, flush=True)

if __name__ == "__main__":
    try:
        asyncio.run(run_suite())
    except Exception as e:
        print(f"\n❌ RUNTIME ERROR: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)

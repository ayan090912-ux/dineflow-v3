import asyncio
import httpx
import statistics
import time

BASE_URL = "https://the-start.dinely.food"
REST_ID = "rest-1790594544526-396022"

async def benchmark():
    print("==================================================", flush=True)
    print("RUNNING MULTI-SAMPLE PRODUCTION LATENCY BENCHMARK", flush=True)
    print(f"Target: {BASE_URL} (Restaurant ID: {REST_ID})", flush=True)
    print("==================================================", flush=True)

    resolve_times = []
    menu_times = []
    table_times = []
    order_times = []
    eta_times = []

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        # Get terminal token for ETA
        r_auth = await client.post("/api/v1/auth/terminal-login", json={"restaurant_id": REST_ID, "role": "KITCHEN", "passcode": "1234"})
        k_token = r_auth.json()["access_token"]
        k_headers = {"Authorization": f"Bearer {k_token}"}

        # 1. Warm Tenant Resolution (5 runs)
        for i in range(5):
            t0 = time.time()
            res = await client.get("/api/v1/restaurants/public/resolve")
            el = (time.time() - t0) * 1000
            assert res.status_code == 200
            resolve_times.append(el)
            await asyncio.sleep(0.1)

        # 2. Warm Menu Load (5 runs)
        for i in range(5):
            t0 = time.time()
            res = await client.get(f"/api/v1/restaurants/{REST_ID}/menu")
            el = (time.time() - t0) * 1000
            assert res.status_code == 200
            menu_times.append(el)
            await asyncio.sleep(0.1)

        # 3. Table Identification (5 runs)
        for i in range(5):
            t0 = time.time()
            res = await client.get(f"/api/v1/restaurants/{REST_ID}/tables")
            el = (time.time() - t0) * 1000
            assert res.status_code == 200
            table_times.append(el)
            await asyncio.sleep(0.1)

        # 4. Customer Order Creation & ETA (3 runs)
        real_tables = (await client.get(f"/api/v1/restaurants/{REST_ID}/tables")).json()
        for i in range(3):
            tbl = real_tables[i % len(real_tables)]
            tbl_num = tbl.get("tableNumber")
            tbl_id = tbl.get("id")
            payload = {
                "restaurantId": REST_ID,
                "tableNumber": tbl_num,
                "tableId": tbl_id,
                "items": [
                    {
                        "menuItemId": "item-rest-1790594544526-396022-1",
                        "name": "Chicken Biryani",
                        "price": 450.0,
                        "quantity": 1,
                        "targetDestination": "KITCHEN"
                    }
                ]
            }
            t0 = time.time()
            res_ord = await client.post("/api/v1/orders", json=payload)
            el_ord = (time.time() - t0) * 1000
            if res_ord.status_code not in [200, 201]:
                print(f"Order failed: {res_ord.status_code} {res_ord.text}")
            assert res_ord.status_code in [200, 201]
            ord_id = res_ord.json().get("id")
            order_times.append(el_ord)

            # ETA update on this order
            t0 = time.time()
            res_eta = await client.put(f"/api/v1/orders/{ord_id}/eta", json={"deltaMinutes": 5, "reason": "Bench rush"}, headers=k_headers)
            el_eta = (time.time() - t0) * 1000
            assert res_eta.status_code == 200
            eta_times.append(el_eta)

    def calc_stats(samples):
        s = sorted(samples)
        p50 = statistics.median(s)
        p95 = s[int(len(s) * 0.95)] if len(s) > 1 else s[0]
        mean = statistics.mean(s)
        return int(min(s)), int(p50), int(p95), int(max(s)), int(mean)

    print("\nPROD CLIENT-SIDE TIMINGS (over Cloudflare & Internet):")
    min_v, p50_v, p95_v, max_v, avg_v = calc_stats(resolve_times)
    print(f"  • Tenant Resolution:       p50={p50_v}ms | p95={p95_v}ms | min={min_v}ms | max={max_v}ms")
    min_v, p50_v, p95_v, max_v, avg_v = calc_stats(menu_times)
    print(f"  • Menu Load:               p50={p50_v}ms | p95={p95_v}ms | min={min_v}ms | max={max_v}ms")
    min_v, p50_v, p95_v, max_v, avg_v = calc_stats(table_times)
    print(f"  • Table Identification:    p50={p50_v}ms | p95={p95_v}ms | min={min_v}ms | max={max_v}ms")
    min_v, p50_v, p95_v, max_v, avg_v = calc_stats(order_times)
    print(f"  • Customer Order Creation: p50={p50_v}ms | p95={p95_v}ms | min={min_v}ms | max={max_v}ms")
    min_v, p50_v, p95_v, max_v, avg_v = calc_stats(eta_times)
    print(f"  • ETA Mutation:            p50={p50_v}ms | p95={p95_v}ms | min={min_v}ms | max={max_v}ms")

if __name__ == "__main__":
    asyncio.run(benchmark())

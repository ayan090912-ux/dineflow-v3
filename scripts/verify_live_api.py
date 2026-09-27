import urllib.request
import urllib.error
import json
import time

def test_resolve(identifier, is_host=True):
    param = "hostname" if is_host else "slug"
    url = f"https://dineflow-v3.onrender.com/api/v1/restaurants/public/resolve?{param}={identifier}"
    start = time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            elapsed = time.time() - start
            body = resp.read().decode()
            try:
                data = json.loads(body)
            except:
                data = body
            return resp.status, elapsed, data
    except urllib.error.HTTPError as e:
        elapsed = time.time() - start
        try:
            data = json.loads(e.read().decode())
        except:
            data = str(e)
        return e.code, elapsed, data
    except Exception as e:
        elapsed = time.time() - start
        return 500, elapsed, str(e)

print("=== 1. LIVE TENANT RESOLUTION: THE FLY ===")
st, el, data = test_resolve("the-fly.dinely.food", is_host=True)
print(f"Status: {st} ({el:.2f}s) -> Name: {data.get('name') if isinstance(data, dict) else data}, ID: {data.get('id') if isinstance(data, dict) else ''}")

print("\n=== 2. LIVE TENANT RESOLUTION: PIZZA HOUSE ===")
st, el, data = test_resolve("pizza-house.dinely.food", is_host=True)
print(f"Status: {st} ({el:.2f}s) -> Name: {data.get('name') if isinstance(data, dict) else data}, ID: {data.get('id') if isinstance(data, dict) else ''}")

print("\n=== 3. LIVE UNKNOWN TENANT: DOES-NOT-EXIST ===")
st, el, data = test_resolve("does-not-exist.dinely.food", is_host=True)
print(f"Status: {st} ({el:.2f}s) -> Detail: {data}")

print("\n=== 4. LIVE MENU API: THE FLY ===")
url = "https://dineflow-v3.onrender.com/api/v1/restaurants/rest-1788659067434/menu"
start = time.time()
try:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = json.loads(resp.read().decode())
        items = body.get('items', body) if isinstance(body, dict) else body
        print(f"Status: {resp.status} ({time.time()-start:.2f}s) -> Found {len(items)} menu items for THE Fly")
        for i in items[:3]:
            print(f"   - {i.get('name')}: ${i.get('price')}")
except Exception as e:
    print(f"Failed: {e}")

print("\n=== 5. LIVE MENU API: PIZZA HOUSE ===")
url = "https://dineflow-v3.onrender.com/api/v1/restaurants/rest-pizza-house/menu"
start = time.time()
try:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = json.loads(resp.read().decode())
        items = body.get('items', body) if isinstance(body, dict) else body
        print(f"Status: {resp.status} ({time.time()-start:.2f}s) -> Found {len(items)} menu items for Pizza House")
        for i in items[:3]:
            print(f"   - {i.get('name')}: ${i.get('price')}")
except Exception as e:
    print(f"Failed: {e}")

print("\n=== 6. LIVE TABLES API: THE FLY ===")
url = "https://dineflow-v3.onrender.com/api/v1/restaurants/rest-1788659067434/tables"
start = time.time()
try:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        tbls = json.loads(resp.read().decode())
        print(f"Status: {resp.status} ({time.time()-start:.2f}s) -> Found {len(tbls)} tables for THE Fly")
        print("   Sample:", tbls[0].get('table_number'), "-> QR:", tbls[0].get('qr_code_url'))
except Exception as e:
    print(f"Failed: {e}")

print("\n=== 7. LIVE TABLES API: PIZZA HOUSE ===")
url = "https://dineflow-v3.onrender.com/api/v1/restaurants/rest-pizza-house/tables"
start = time.time()
try:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        tbls = json.loads(resp.read().decode())
        print(f"Status: {resp.status} ({time.time()-start:.2f}s) -> Found {len(tbls)} tables for Pizza House")
        print("   Sample:", tbls[0].get('table_number'), "-> QR:", tbls[0].get('qr_code_url'))
except Exception as e:
    print(f"Failed: {e}")

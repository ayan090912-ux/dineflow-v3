import os
import sys
import time
import json
import urllib.request
import urllib.error

PROD_URL = "https://dinely.food"
REST_ID = "rest-1792151659078-4f1d79" # local-vender
OTHER_REST_ID = "rest-1790594544526-396022"
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def http_req(url, method="GET", data=None, headers=None):
    hdrs = {
        "User-Agent": BROWSER_UA,
        **(headers or {})
    }
    encoded_data = json.dumps(data).encode() if data is not None else None
    if encoded_data and "Content-Type" not in hdrs:
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=encoded_data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode()
            try:
                return resp.status, json.loads(body)
            except:
                return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except:
            return e.code, body

def main():
    print("==========================================================")
    print(" 🛡️  LIVE PRODUCTION SECURITY AUDIT — HOOKAH TERMINAL")
    print(" Target: " + PROD_URL)
    print(" Tenant: " + REST_ID)
    print("==========================================================")

    # -------------------------------------------------------------
    # 1. Requests without valid authentication MUST return 401
    # -------------------------------------------------------------
    print("\n[CHECK 1] Testing unauthenticated request to Hookah queue...")
    status, body = http_req(f"{PROD_URL}/api/v1/orders/restaurant/{REST_ID}?station=HOOKAH")
    print(f"  Response: HTTP {status} -> {body}")
    assert status == 401, f"Expected 401, got {status}"
    print("  ✓ PASS: Unauthenticated request rejected with HTTP 401")

    # -------------------------------------------------------------
    # 2. Forging X-Staff-Role: HOOKAH cannot grant terminal access
    # -------------------------------------------------------------
    print("\n[CHECK 2] Testing forged X-Staff-Role: HOOKAH header spoofing attack...")
    forged_headers = {
        "X-Staff-Role": "HOOKAH",
        "X-Staff-Restaurant-Id": REST_ID,
        "X-Staff-Id": "spoofed-intruder-01"
    }
    status, body = http_req(
        f"{PROD_URL}/api/v1/orders/restaurant/{REST_ID}?station=HOOKAH",
        headers=forged_headers
    )
    print(f"  Response: HTTP {status} -> {body}")
    assert status == 401, f"Expected 401 for forged header, got {status}"
    print("  ✓ PASS: Forged X-Staff-Role rejected with HTTP 401")

    # -------------------------------------------------------------
    # 3. Legitimate Hookah Staff Terminal Authentication
    # -------------------------------------------------------------
    print("\n[CHECK 3] Logging in as legitimate Hookah Staff via /api/v1/auth/terminal-login...")
    status, login_body = http_req(
        f"{PROD_URL}/api/v1/auth/terminal-login",
        method="POST",
        data={
            "restaurant_id": REST_ID,
            "role": "HOOKAH",
            "passcode": "1234",
            "identifier": "terrace_hookah_lounge"
        }
    )
    print(f"  Login Response: HTTP {status} (Role: {login_body.get('role') if isinstance(login_body, dict) else ''})")
    assert status == 200, f"Hookah login failed: {login_body}"
    hookah_token = login_body["access_token"]
    assert hookah_token, "Must return signed JWT access token"
    hookah_auth_headers = {"Authorization": f"Bearer {hookah_token}"}
    print("  ✓ PASS: Authenticated successfully, signed JWT issued")

    # Log in Bar Staff for cross-station mutation checks
    print("\n[CHECK 3b] Logging in as legitimate Bar Staff...")
    status, bar_login = http_req(
        f"{PROD_URL}/api/v1/auth/terminal-login",
        method="POST",
        data={
            "restaurant_id": REST_ID,
            "role": "BAR",
            "passcode": "1234",
            "identifier": "main_bar_station"
        }
    )
    assert status == 200
    bar_token = bar_login["access_token"]
    bar_auth_headers = {"Authorization": f"Bearer {bar_token}"}
    print("  ✓ PASS: Bar staff authenticated")

    # -------------------------------------------------------------
    # 4. Cross-Tenant Attack: Changing X-Staff-Restaurant-Id
    # -------------------------------------------------------------
    print("\n[CHECK 4] Testing Cross-Tenant Attack: Hookah token for REST_ID accessing OTHER_REST_ID...")
    status, body = http_req(
        f"{PROD_URL}/api/v1/orders/restaurant/{OTHER_REST_ID}?station=HOOKAH",
        headers={
            **hookah_auth_headers,
            "X-Staff-Restaurant-Id": OTHER_REST_ID
        }
    )
    print(f"  Response: HTTP {status} -> {body}")
    assert status == 403, f"Expected 403 for cross-tenant attack, got {status}"
    print("  ✓ PASS: Cross-tenant access rejected with HTTP 403 Forbidden")

    # -------------------------------------------------------------
    # 5. Station Isolation: Hookah staff accessing Kitchen/Bar queues
    # -------------------------------------------------------------
    print("\n[CHECK 5a] Testing Cross-Station Query: Hookah staff attempting to query KITCHEN queue...")
    status, body = http_req(
        f"{PROD_URL}/api/v1/orders/restaurant/{REST_ID}?station=KITCHEN",
        headers=hookah_auth_headers
    )
    print(f"  Response: HTTP {status} -> {body}")
    assert status == 403, f"Expected 403, got {status}"
    print("  ✓ PASS: Hookah staff query to Kitchen queue rejected with HTTP 403")

    print("\n[CHECK 5b] Testing Cross-Station Query: Hookah staff attempting to query BAR queue...")
    status, body = http_req(
        f"{PROD_URL}/api/v1/orders/restaurant/{REST_ID}?station=BAR",
        headers=hookah_auth_headers
    )
    print(f"  Response: HTTP {status} -> {body}")
    assert status == 403, f"Expected 403, got {status}"
    print("  ✓ PASS: Hookah staff query to Bar queue rejected with HTTP 403")

    print("\n[CHECK 5c] Testing Cross-Station Query: Bar staff attempting to query HOOKAH queue...")
    status, body = http_req(
        f"{PROD_URL}/api/v1/orders/restaurant/{REST_ID}?station=HOOKAH",
        headers=bar_auth_headers
    )
    print(f"  Response: HTTP {status} -> {body}")
    assert status == 403, f"Expected 403, got {status}"
    print("  ✓ PASS: Bar staff query to Hookah queue rejected with HTTP 403")

    # -------------------------------------------------------------
    # 6. Customer Order Submission & Authoritative Station Override
    # -------------------------------------------------------------
    print("\n[CHECK 6] Fetching catalog and placing live order with client station tampering...")
    status, menu_data = http_req(f"{PROD_URL}/api/v1/restaurants/{REST_ID}/menu")
    assert status == 200
    hookah_items = [it for it in menu_data.get("items", []) if it.get("targetDestination") == "HOOKAH"]
    assert len(hookah_items) >= 1
    selected_hookah = hookah_items[0]

    order_payload = {
        "restaurantId": REST_ID,
        "tableNumber": "Table 05",
        "customerNotes": "Live audit order, 18+ verified",
        "items": [
            {
                "menuItemId": selected_hookah["id"],
                "name": selected_hookah["name"],
                "price": selected_hookah["price"],
                "quantity": 1,
                "targetDestination": "BAR", # Client tampered to BAR
                "guestNotes": "Extra ice base"
            }
        ]
    }
    status, ord_res = http_req(f"{PROD_URL}/api/v1/orders", method="POST", data=order_payload)
    assert status == 201, f"Failed order creation: {ord_res}"
    order_id = ord_res["id"]
    assigned_station = ord_res["items"][0]["targetDestination"]
    print(f"  Order ID: {order_id}")
    print(f"  Assigned Station: {assigned_station} (Expected HOOKAH, client submitted BAR)")
    assert assigned_station == "HOOKAH", "Backend must authoritatively enforce HOOKAH station"
    print("  ✓ PASS: Authoritative station routing enforced")

    # -------------------------------------------------------------
    # 7. Station Status Mutation RBAC: Bar cannot update Hookah status
    # -------------------------------------------------------------
    print("\n[CHECK 7a] Testing Cross-Station Mutation: Bar staff attempting to update hookahStatus...")
    status, body = http_req(
        f"{PROD_URL}/api/v1/orders/{order_id}/status",
        method="PUT",
        headers=bar_auth_headers,
        data={"hookahStatus": "PREPARING"}
    )
    print(f"  Response: HTTP {status} -> {body}")
    assert status == 403, f"Expected 403, got {status}"
    print("  ✓ PASS: Bar staff mutation of hookahStatus rejected with HTTP 403")

    print("\n[CHECK 7b] Testing Cross-Station Mutation: Hookah staff attempting to update barStatus...")
    status, body = http_req(
        f"{PROD_URL}/api/v1/orders/{order_id}/status",
        method="PUT",
        headers=hookah_auth_headers,
        data={"barStatus": "PREPARING"}
    )
    print(f"  Response: HTTP {status} -> {body}")
    assert status == 403, f"Expected 403, got {status}"
    print("  ✓ PASS: Hookah staff mutation of barStatus rejected with HTTP 403")

    print("\n[CHECK 7c] Testing Table Delivery: Hookah staff attempting overall DELIVERED status...")
    status, body = http_req(
        f"{PROD_URL}/api/v1/orders/{order_id}/status",
        method="PUT",
        headers=hookah_auth_headers,
        data={"status": "DELIVERED"}
    )
    print(f"  Response: HTTP {status} -> {body}")
    assert status == 403, f"Expected 403, got {status}"
    print("  ✓ PASS: Hookah staff delivery attempt rejected with HTTP 403")

    # -------------------------------------------------------------
    # 8. Legitimate Hookah Workflow & Database Persistence (Zero ETA)
    # -------------------------------------------------------------
    print("\n[CHECK 8] Testing legitimate Hookah staff workflow (Zero ETA)...")
    # Hookah marks PREPARING
    status, st1 = http_req(
        f"{PROD_URL}/api/v1/orders/{order_id}/status",
        method="PUT",
        headers=hookah_auth_headers,
        data={"hookahStatus": "PREPARING"}
    )
    assert status == 200
    print(f"  Hookah status updated: {st1.get('hookahStatus')}")
    assert st1.get("hookahStatus") == "PREPARING"

    # Hookah marks READY
    status, st2 = http_req(
        f"{PROD_URL}/api/v1/orders/{order_id}/status",
        method="PUT",
        headers=hookah_auth_headers,
        data={"hookahStatus": "READY"}
    )
    assert status == 200
    print(f"  Hookah status updated: {st2.get('hookahStatus')}")
    assert st2.get("hookahStatus") == "READY"

    # Hookah marks COMPLETED
    status, st3 = http_req(
        f"{PROD_URL}/api/v1/orders/{order_id}/status",
        method="PUT",
        headers=hookah_auth_headers,
        data={"hookahStatus": "COMPLETED"}
    )
    assert status == 200
    print(f"  Hookah status updated: {st3.get('hookahStatus')}")
    assert st3.get("hookahStatus") == "COMPLETED"

    # Refresh queue verification
    print("\n[CHECK 9] Verifying persistence on terminal refresh...")
    status, queue_data = http_req(
        f"{PROD_URL}/api/v1/orders/restaurant/{REST_ID}?station=HOOKAH",
        headers=hookah_auth_headers
    )
    assert status == 200
    persisted_ord = next((o for o in queue_data if o["id"] == order_id), None)
    assert persisted_ord is not None
    print(f"  Persisted Status on Refresh: {persisted_ord.get('hookahStatus')}")
    assert persisted_ord.get("hookahStatus") == "COMPLETED"
    print("  ✓ PASS: Order status persisted in Postgres database across terminal reload")

    print("\n==========================================================")
    print(" 🎉 ALL PRODUCTION SECURITY AUDIT CHECKS PASSED (100%)!")
    print("==========================================================")

if __name__ == "__main__":
    main()

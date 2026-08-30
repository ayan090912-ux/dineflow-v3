import urllib.request
import json
import time

BASE_URL = "https://dineflow-v3.onrender.com/api/v1"
REST_ID = "rest-1787446097984"
TABLE_NUM = "Table 08"
TABLE_ID = "tbl-rest-1787446097984-table_08"

def http_req(url, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode())

def run_matrix():
    print("==================================================")
    print("TEST 1: OWNER SAVES BILLING & UPI CONFIG TO NEON")
    print("==================================================")
    owner_config = {
        "legal_name": "CAFE.CO Fine Dining Pvt Ltd",
        "state": "Maharashtra",
        "state_code": "27",
        "gstin": "27AAACB2418L1Z2",
        "pan": "AAACB2418L",
        "invoice_prefix": "INV-",
        "invoice_starting_number": 1001,
        "service_charge_percentage": 0.0,
        "service_charge_enabled": False,
        "upi_id": "7488933071@ybl",
        "upi_merchant_name": "CAFE.CO",
        "upi_enabled": True
    }
    status, res = http_req(f"{BASE_URL}/restaurants/{REST_ID}/billing/config", method="PUT", payload=owner_config)
    assert status == 200
    print(f"[PASS] Status: {status} | Saved UPI ID: {res['config']['upiId']}")

    print("\n==================================================")
    print("TEST 2: OWNER REFRESH (FETCH FROM NEON DB)")
    print("==================================================")
    status, refreshed = http_req(f"{BASE_URL}/restaurants/{REST_ID}/billing/config")
    assert status == 200
    assert refreshed["upiId"] == "7488933071@ybl"
    assert refreshed["upiEnabled"] is True
    assert refreshed["legalName"] == "CAFE.CO Fine Dining Pvt Ltd"
    print(f"[PASS] Neon Persistence Verified: upiId={refreshed['upiId']}, legalName={refreshed['legalName']}")

    print("\n==================================================")
    print("TEST 3: OWNER UPLOADS REAL QR IMAGE TO NEON DB")
    print("==================================================")
    qr_payload = {
        "qrDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "merchantName": "CAFE.CO",
        "upiId": "7488933071@ybl"
    }
    status, qr_res = http_req(f"{BASE_URL}/restaurants/{REST_ID}/billing/qr-upload", method="POST", payload=qr_payload)
    assert status == 200
    print(f"[PASS] QR Upload Status: {status} | upiQrUrl saved: {qr_res['upiQrUrl'][:40]}...")

    print("\n==================================================")
    print("TEST 4: CUSTOMER GETS ACTIVE TABLE SESSION (TABLE 08)")
    print("==================================================")
    sess_url = f"{BASE_URL}/restaurants/{REST_ID}/tables/{TABLE_ID}/session?table_number=Table%2008"
    status, sess = http_req(sess_url)
    session_id = sess["id"]
    assert sess["status"] == "ACTIVE"
    print(f"[PASS] Active Session ID: {session_id} for Table 08")

    print("\n==================================================")
    print("TEST 5: CUSTOMER FETCHES AUTHORITATIVE SERVER CONFIG")
    print("==================================================")
    status, cust_cfg = http_req(f"{BASE_URL}/restaurants/{REST_ID}/billing/config")
    assert status == 200
    assert cust_cfg["upiId"] == "7488933071@ybl"
    assert cust_cfg["upiMerchantName"] == "CAFE.CO"
    assert cust_cfg["upiEnabled"] is True
    assert cust_cfg["upiQrUrl"] == qr_payload["qrDataUrl"]
    print(f"[PASS] Customer Receives Same Server Config: upiId={cust_cfg['upiId']}, QR Length={len(cust_cfg['upiQrUrl'])}")

    print("\n==================================================")
    print("TEST 6: CUSTOMER CLICKS I HAVE PAID -> WAITER ALERTS")
    print("==================================================")
    pay_req = {
        "restaurantId": REST_ID,
        "tableNumber": "Table 08",
        "tableId": TABLE_ID,
        "tableSessionId": session_id,
        "requestType": "BILL",
        "customTitle": "UPI Payment Verification ⚡",
        "message": "Customer at Table 08 has paid Rs.397.32 via UPI (7488933071@ybl). Please verify & confirm.",
        "customerNotes": "UPI ID: 7488933071@ybl | Amount: Rs.397.32",
        "priority": "HIGH"
    }
    status, created_req = http_req(f"{BASE_URL}/customer-requests", method="POST", payload=pay_req)
    assert status == 201
    req_id = created_req["id"]
    print(f"[PASS] Created Request ID: {req_id} (Status: {created_req['status']})")

    print("\n==================================================")
    print("TEST 7: WAITER RECEIVES PAYMENT REQUEST & ACCEPTS")
    print("==================================================")
    status, active_reqs = http_req(f"{BASE_URL}/customer-requests?restaurant_id={REST_ID}&active_only=true")
    matched = next((r for r in active_reqs if r["id"] == req_id), None)
    assert matched is not None, "Request not found in active queue"
    print(f"[PASS] Waiter Queue Retrieved: {matched['id']} | Table: {matched['tableNumber']} | Title: {matched['customTitle']}")

    # Waiter accepts
    status, accepted_req = http_req(f"{BASE_URL}/customer-requests/{req_id}", method="PATCH", payload={"status": "ACCEPTED", "waiterName": "Ayaan"})
    assert status == 200
    assert accepted_req["status"] == "IN_PROGRESS"
    print(f"[PASS] Waiter Accepted Request -> Status: {accepted_req['status']}")

    # Waiter completes
    status, completed_req = http_req(f"{BASE_URL}/customer-requests/{req_id}", method="PATCH", payload={"status": "COMPLETED", "waiterName": "Ayaan"})
    assert status == 200
    assert completed_req["status"] == "COMPLETED"
    print(f"[PASS] Waiter Completed Request -> Status: {completed_req['status']}")

    print("\n==================================================")
    print("TEST 8: CLOSE TABLE SESSION")
    print("==================================================")
    close_url = f"{BASE_URL}/restaurants/{REST_ID}/tables/{TABLE_ID}/close-session?table_session_id={session_id}"
    status, close_res = http_req(close_url, method="POST", payload={"table_session_id": session_id, "waiter_name": "Ayaan"})
    assert status == 200
    print(f"[PASS] Session Closed: {close_res['message']}")

    # Verify Table is now AVAILABLE and unoccupied
    status, tables = http_req(f"{BASE_URL}/restaurants/{REST_ID}/tables")
    tbl = next((t for t in tables if t["id"] == TABLE_ID), None)
    assert tbl is not None
    assert tbl["status"] == "AVAILABLE"
    assert tbl["is_occupied"] is False
    print(f"[PASS] Table 08 Status is AVAILABLE (is_occupied={tbl['is_occupied']})")

    print("\n==================================================")
    print("TEST 9: MULTI-TENANT ISOLATION")
    print("==================================================")
    status, cfg_a = http_req(f"{BASE_URL}/restaurants/rest-demo/billing/config")
    assert cfg_a["restaurantId"] == "rest-demo"
    assert cfg_a["upiId"] != "7488933071@ybl"
    print(f"[PASS] rest-demo isolated: upiId=\"{cfg_a['upiId']}\"")

    print("\n==================================================")
    print(">>> ALL 9 PRODUCTION MATRIX TESTS PASSED (100% PASS) <<<")
    print("==================================================")

if __name__ == "__main__":
    run_matrix()

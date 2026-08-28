import urllib.request
import urllib.parse
import json

BASE_URL = "https://dineflow-v3.onrender.com/api/v1"
REST_ID = "rest-1787446097984" # CAFE.CO
REST_SLUG = "cafe-co"
TABLE_NUM = "Table 03"
TABLE_ID = "tbl-rest-1787446097984-table_03"

def http_get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def http_post(url, payload=None):
    data = json.dumps(payload).encode() if payload else b"{}"
    req = urllib.request.Request(url, method="POST", headers={"Content-Type": "application/json", "Accept": "application/json"}, data=data)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

def run_verification():
    print("=== STARTING PRODUCTION API FLOW VERIFICATION ===")
    print(f"Target Server: {BASE_URL}")
    print(f"Restaurant: {REST_ID} ({REST_SLUG}) | Table: {TABLE_NUM} ({TABLE_ID})")

    # Step 1: Ensure Table 03 has an ACTIVE session
    print("\n--- STEP 1: Get or Create Active Session for Table 03 ---")
    sess_url = f"{BASE_URL}/restaurants/{REST_ID}/tables/{TABLE_ID}/session?table_number={urllib.parse.quote(TABLE_NUM)}"
    sess_data = http_get(sess_url)
    session_id = sess_data.get("id")
    print(f"Active Session ID: {session_id} | Status: {sess_data.get('status')}")
    assert sess_data.get("status") == "ACTIVE", f"Expected ACTIVE session, got {sess_data}"

    # Verify GET active-sessions returns Table 03
    active_sessions = http_get(f"{BASE_URL}/restaurants/{REST_ID}/active-sessions")
    active_ids = [s["id"] for s in active_sessions]
    print(f"GET /active-sessions count: {len(active_sessions)}")
    assert session_id in active_ids, f"Session {session_id} not found in active sessions list"

    # Step 2: Simulate Waiter clicking CLOSE TABLE
    print("\n--- STEP 2: Waiter clicks CLOSE TABLE ---")
    close_url = f"{BASE_URL}/restaurants/{REST_ID}/tables/{TABLE_ID}/close-session?table_session_id={session_id}"
    close_res = http_post(close_url, {"table_session_id": session_id, "waiter_name": "Ayaan"})
    print(f"POST close-session response: {close_res}")
    assert close_res.get("status") == "success", f"Close table failed: {close_res}"

    # Step 3: Verify GET active-sessions = Table 03 ABSENT
    print("\n--- STEP 3: Verify GET /active-sessions (Table 03 MUST BE ABSENT) ---")
    active_sessions_after = http_get(f"{BASE_URL}/restaurants/{REST_ID}/active-sessions")
    active_ids_after = [s["id"] for s in active_sessions_after]
    print(f"Active sessions after closure: {active_ids_after}")
    assert session_id not in active_ids_after, f"Session {session_id} STILL present in active sessions!"

    # Step 4: Verify GET tables = Table 03 status is AVAILABLE
    print("\n--- STEP 4: Verify GET /tables (Table 03 status MUST BE AVAILABLE) ---")
    tables_after = http_get(f"{BASE_URL}/restaurants/{REST_ID}/tables")
    tbl_03 = next((t for t in tables_after if t["id"] == TABLE_ID or t["table_number"] == TABLE_NUM), None)
    print(f"Table 03 DB State: {tbl_03}")
    assert tbl_03 is not None, "Table 03 not found in tables list"
    assert tbl_03.get("status") == "AVAILABLE", f"Expected AVAILABLE, got {tbl_03.get('status')}"
    assert tbl_03.get("is_occupied") is False, f"Expected is_occupied=False, got {tbl_03.get('is_occupied')}"

    # Step 5: Scan Table 03 QR / Open new customer session
    print("\n--- STEP 5: Scan Table 03 QR Code / Open NEW Customer Session ---")
    new_sess_data = http_get(sess_url)
    new_session_id = new_sess_data.get("id")
    print(f"New Session ID: {new_session_id} | Status: {new_sess_data.get('status')}")
    assert new_session_id != session_id, f"Expected NEW session ID, but got old session ID {session_id}"
    assert new_sess_data.get("status") == "ACTIVE", f"Expected ACTIVE status for new session, got {new_sess_data}"

    # Step 6: Verify GET active-sessions returns NEW session
    print("\n--- STEP 6: Verify GET /active-sessions returns NEW session ---")
    active_sessions_final = http_get(f"{BASE_URL}/restaurants/{REST_ID}/active-sessions")
    final_ids = [s["id"] for s in active_sessions_final]
    print(f"Final active session IDs: {final_ids}")
    assert new_session_id in final_ids, f"New session {new_session_id} not found in active sessions!"

    # Clean up: Close the temporary new session to leave DB clean
    http_post(f"{BASE_URL}/restaurants/{REST_ID}/tables/{TABLE_ID}/close-session?table_session_id={new_session_id}", {"table_session_id": new_session_id, "waiter_name": "Test Cleanup"})

    print("\n==================================================")
    print("ALL PRODUCTION API STEPS PASSED PERFECTLY (100% PASS)")
    print("==================================================")

if __name__ == "__main__":
    run_verification()

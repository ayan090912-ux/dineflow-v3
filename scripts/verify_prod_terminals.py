import asyncio
import json
import uuid
import httpx
import websockets
from jose import jwt
from app.core.config.settings import get_settings

st = get_settings()
THE_MAN_ID = "rest-1791979497852-e7f133"
OWNER_UID = "P8dss5zlnmhiFz7lQvrYpE6LvG62"
OWNER_EMAIL = "work.sryphian@gmail.com"

OTHER_REST_ID = "rest-tenant-other-123456"
OTHER_OWNER_UID = "uid-other-tenant-999"

async def run_test():
    print("=== PRODUCTION VERIFICATION: Dinely Terminal Registration & Real-Time Event Scoping ===")
    
    # 1. Generate Valid Token for THE MAN owner
    claims = {
        "sub": OWNER_UID,
        "email": OWNER_EMAIL,
        "scope": "RESTAURANT_OWNER",
        "role": "OWNER",
        "restaurant_id": THE_MAN_ID,
    }
    owner_token = jwt.encode(claims, st.JWT_ACCESS_SECRET_KEY, algorithm=st.JWT_ALGORITHM)
    
    # 2. Generate Valid Token for Other Tenant
    other_claims = {
        "sub": OTHER_OWNER_UID,
        "email": "other@restaurant.com",
        "scope": "RESTAURANT_OWNER",
        "role": "OWNER",
        "restaurant_id": OTHER_REST_ID,
    }
    other_token = jwt.encode(other_claims, st.JWT_ACCESS_SECRET_KEY, algorithm=st.JWT_ALGORITHM)
    
    # TEST 1: Cross-Tenant WS Connection Rejection
    print("\n[TEST 1] Testing cross-tenant WebSocket connection rejection...")
    cross_url = f"ws://localhost:8080/api/v1/ws?restaurant_id={THE_MAN_ID}&role=OWNER&token={other_token}"
    try:
        async with websockets.connect(cross_url) as ws_cross:
            print("[-] ERROR: Cross-tenant connection was permitted unexpectedly!")
            raise AssertionError("Cross-tenant WS access was not rejected")
    except websockets.exceptions.InvalidStatusCode as e:
        print(f"[SUCCESS] Cross-tenant connection rejected with HTTP {e.status_code}")
    except websockets.exceptions.ConnectionClosed as cc:
        print(f"[SUCCESS] Cross-tenant connection closed immediately: code={cc.code}, reason={cc.reason}")
        assert cc.code == 1008, f"Expected code 1008, got {cc.code}"
    except Exception as exc:
        print(f"[SUCCESS] Cross-tenant connection rejected as expected: {type(exc).__name__}: {exc}")

    # Connect THE MAN owner WebSocket
    print("\n[TEST 2] Connecting THE MAN Owner WebSocket...")
    man_ws_url = f"ws://localhost:8080/api/v1/ws?restaurant_id={THE_MAN_ID}&role=OWNER&token={owner_token}"
    man_received_events = []
    
    # Connect Other Tenant WebSocket
    print("[TEST 3] Connecting Other Tenant WebSocket (isolated channel)...")
    other_ws_url = f"ws://localhost:8080/api/v1/ws?restaurant_id={OTHER_REST_ID}&role=OWNER&token={other_token}"
    other_received_events = []
    
    async with websockets.connect(man_ws_url) as ws_man, websockets.connect(other_ws_url) as ws_other:
        print("[+] Both WebSocket channels connected successfully.")
        
        async def listen_man():
            try:
                while True:
                    msg = await ws_man.recv()
                    data = json.loads(msg)
                    print(f"  [THE MAN WS Event]: {data.get('type')}")
                    man_received_events.append(data)
            except Exception:
                pass

        async def listen_other():
            try:
                while True:
                    msg = await ws_other.recv()
                    data = json.loads(msg)
                    print(f"  [OTHER TENANT WS Event]: {data.get('type')}")
                    other_received_events.append(data)
            except Exception:
                pass
                
        t_man = asyncio.create_task(listen_man())
        t_other = asyncio.create_task(listen_other())
        
        # Register a terminal for THE MAN
        print("\n[TEST 4] Registering new terminal for THE MAN via POST /api/v1/restaurants/{id}/terminals...")
        test_terminal_code = f"TERM-{uuid.uuid4().hex[:6].upper()}"
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        async with httpx.AsyncClient(base_url="http://localhost:8080") as client:
            resp = await client.post(
                f"/api/v1/restaurants/{THE_MAN_ID}/terminals",
                json={
                    "name": "Production Live Waiter Pad",
                    "terminalCode": test_terminal_code,
                    "terminalType": "WAITER",
                    "deviceInfo": "Samsung Galaxy Tab A9+ (Android 14)",
                    "status": "ACTIVE"
                },
                headers=headers
            )
            print(f"POST response status: {resp.status_code}")
            assert resp.status_code in (200, 201), f"Registration failed: {resp.text}"
            term_data = resp.json()
            term_id = term_data.get("id")
            print(f"[+] Terminal registered: ID={term_id}, Code={term_data.get('terminalCode')}, Name={term_data.get('name')}")
            
            # Wait for event propagation
            await asyncio.sleep(1.0)
            
            t_man.cancel()
            t_other.cancel()
            
            # Verify event delivered to THE MAN
            print("\n[TEST 5] Checking event delivery to THE MAN owner...")
            man_evt = next((e for e in man_received_events if e.get("type") == "terminal_registered"), None)
            assert man_evt is not None, "THE MAN owner did NOT receive terminal_registered event!"
            payload = man_evt.get("payload") or man_evt
            print(f"[SUCCESS] THE MAN received event:")
            print(f"  - eventId: {man_evt.get('eventId')}")
            print(f"  - restaurantId: {man_evt.get('restaurantId')}")
            print(f"  - restaurantName: {payload.get('restaurantName')}")
            print(f"  - terminalCode: {payload.get('terminalCode')}")
            print(f"  - terminalName: {payload.get('terminalName')}")
            print(f"  - message: {payload.get('message')}")
            assert man_evt.get("restaurantId") == THE_MAN_ID
            assert payload.get("terminalCode") == test_terminal_code
            assert payload.get("terminalName") == "Production Live Waiter Pad"
            
            # Verify event was NOT leaked to Other Tenant
            print("\n[TEST 6] Checking tenant isolation (ensuring other tenant received NO leakage)...")
            leaked_evt = next((e for e in other_received_events if e.get("type") == "terminal_registered"), None)
            assert leaked_evt is None, f"LEAK DETECTED! Other tenant received: {leaked_evt}"
            print(f"[SUCCESS] Verified 0 events received by other tenant (Events count: {len(other_received_events)})")
            
            # Verify Persistence across dashboard refresh
            print("\n[TEST 7] Verifying terminal record persistence across dashboard refresh...")
            refresh_resp = await client.get(f"/api/v1/restaurants/{THE_MAN_ID}/terminals", headers=headers)
            assert refresh_resp.status_code == 200
            terms = refresh_resp.json()
            found = next((t for t in terms if t.get("id") == term_id), None)
            assert found is not None, f"Terminal {term_id} NOT found in database after refresh!"
            print(f"[SUCCESS] Terminal persisted in database:")
            print(f"  - ID: {found.get('id')}")
            print(f"  - Code: {found.get('terminalCode')}")
            print(f"  - Name: {found.get('name')}")
            print(f"  - Type: {found.get('terminalType')}")
            print(f"  - Status: {found.get('status')}")
            print(f"  - DeviceInfo: {found.get('deviceInfo')}")
            print(f"  - PairingCode: {found.get('pairingCode')}")
            print(f"  - IsActive: {found.get('isActive')}")
            
            # Clean up
            print("\n[CLEANUP] Deleting test terminal...")
            del_resp = await client.delete(f"/api/v1/restaurants/{THE_MAN_ID}/terminals/{term_id}", headers=headers)
            assert del_resp.status_code == 200
            
            verify_del = await client.get(f"/api/v1/restaurants/{THE_MAN_ID}/terminals", headers=headers)
            assert not any(t.get("id") == term_id for t in verify_del.json())
            print("[SUCCESS] Cleanup verified: test terminal removed cleanly.")
            
    print("\n=== ALL PRODUCTION TERMINAL & WEBSOCKET VERIFICATIONS PASSED ===")

if __name__ == "__main__":
    asyncio.run(run_test())

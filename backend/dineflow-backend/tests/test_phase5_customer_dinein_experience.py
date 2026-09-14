"""
DINELY PHASE 5 TEST SUITE — DYNAMIC QR & CUSTOMER DINE-IN EXPERIENCE (MODULAR)

Independent Test Functions:
1. test_phase5_table_session_creation_and_idempotent_rescan: Table session creation on first scan & idempotent companion binding.
2. test_phase5_multi_round_ordering_bound_to_session: Multi-round ordering preserving tableSessionId across rounds.
3. test_phase5_customer_waiter_call_dispatch_and_resolution: Waiter call dispatch with session binding & terminal resolution.
4. test_phase5_multi_tenant_cross_contamination_security: Strict 403 on cross-tenant data exfiltration & table hijacking.
5. test_phase5_table_session_closure_and_table_release: Session closure, table vacancy release, and fresh session generation.
"""

import time
import json
import base64
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

def create_fake_jwt(claims: dict) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"{header}.{payload}.fake_signature"

async def _setup_restaurant_with_tables(client: AsyncClient, name_prefix: str, table_count: int = 5):
    t_stamp = int(time.time() * 1000)
    owner_token = create_fake_jwt({
        "uid": f"uid_p5_{name_prefix}_{t_stamp}",
        "email": f"{name_prefix}_{t_stamp}@dinely.test",
        "role": "RESTAURANT_OWNER"
    })
    admin_token = create_fake_jwt({
        "uid": f"uid_p5_admin_{t_stamp}",
        "email": "ayan090912@gmail.com",
        "role": "PLATFORM_ADMIN",
        "admin": True
    })

    res_create = await client.post(
        "/api/v1/restaurants",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "name": f"{name_prefix} {t_stamp}",
            "cuisine": "Contemporary",
            "businessType": "RESTAURANT",
            "hasTables": True,
            "tableCount": table_count,
            "hasWaiter": True,
            "hasKitchen": True,
            "hasBar": True,
        }
    )
    assert res_create.status_code == 201
    rest_data = res_create.json()
    rest_id = rest_data["id"]

    # Approve to LIVE
    await client.post(
        "/api/v1/admin/restaurants/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"restaurantId": rest_id, "restaurant_id": rest_id}
    )

    # Fetch tables
    res_tbls = await client.get(f"/api/v1/restaurants/{rest_id}/tables")
    assert res_tbls.status_code == 200
    tables = res_tbls.json()

    return rest_data, tables, owner_token


# =============================================================================
# GUARANTEE 1: SESSION CREATION & IDEMPOTENT RE-SCAN
# =============================================================================
@pytest.mark.asyncio
async def test_phase5_table_session_creation_and_idempotent_rescan():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest, tables, _ = await _setup_restaurant_with_tables(client, "SessionRest")
        target_tbl = tables[0]
        tbl_id = target_tbl["id"]
        tbl_num = target_tbl["table_number"]

        # Initial state: table is AVAILABLE
        assert target_tbl.get("status") in ["AVAILABLE", None]

        # 1. Customer scans QR -> POST session creates active session in PostgreSQL
        res_sess = await client.post(
            f"/api/v1/restaurants/{rest['id']}/tables/{tbl_id}/session?table_number={tbl_num}"
        )
        assert res_sess.status_code in [200, 201]
        sess_data = res_sess.json()
        session_id = sess_data["id"]
        assert session_id.startswith("sess-")
        assert sess_data["status"] == "ACTIVE"
        assert sess_data["restaurant_id"] == rest["id"]

        # 2. Verify Table is now OCCUPIED with active_session_id in DB
        res_tbl_check = await client.get(f"/api/v1/restaurants/{rest['id']}/tables")
        tbl_state = [t for t in res_tbl_check.json() if t["id"] == tbl_id][0]
        assert tbl_state["status"] == "OCCUPIED"
        assert tbl_state["is_occupied"] is True
        assert tbl_state["active_session_id"] == session_id

        # 3. Companion re-scan at same table reuses identical session ID (idempotent, no duplicates)
        res_rescan = await client.post(
            f"/api/v1/restaurants/{rest['id']}/tables/{tbl_id}/session?table_number={tbl_num}"
        )
        assert res_rescan.status_code in [200, 201]
        assert res_rescan.json()["id"] == session_id

        # 4. Read-only GET returns the same active session
        res_get_sess = await client.get(
            f"/api/v1/restaurants/{rest['id']}/tables/{tbl_id}/session?table_number={tbl_num}"
        )
        assert res_get_sess.status_code == 200
        assert res_get_sess.json()["id"] == session_id


# =============================================================================
# GUARANTEE 2: MULTI-ROUND ORDERING BOUND TO SESSION
# =============================================================================
@pytest.mark.asyncio
async def test_phase5_multi_round_ordering_bound_to_session():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest, tables, _ = await _setup_restaurant_with_tables(client, "OrderRest")
        target_tbl = tables[1]
        tbl_id = target_tbl["id"]
        tbl_num = target_tbl["table_number"]

        # Start session
        res_sess = await client.post(
            f"/api/v1/restaurants/{rest['id']}/tables/{tbl_id}/session?table_number={tbl_num}"
        )
        session_id = res_sess.json()["id"]

        # Round 1: Food items placed
        ord1_payload = {
            "restaurantId": rest["id"],
            "tableId": tbl_id,
            "tableNumber": tbl_num,
            "tableSessionId": session_id,
            "customerName": "Guest Table",
            "items": [{"id": "item-starter", "menuItemId": "item-starter", "name": "Bruschetta", "price": 10.0, "quantity": 1}],
            "totalAmount": 10.0,
            "status": "PENDING",
            "orderType": "DINE_IN",
            "targetDestination": "KITCHEN"
        }
        res_ord1 = await client.post("/api/v1/orders", json=ord1_payload)
        assert res_ord1.status_code == 201
        ord1_data = res_ord1.json()
        assert ord1_data["tableSessionId"] == session_id

        # Round 2: Drinks placed 20 minutes later by same table
        ord2_payload = {
            "restaurantId": rest["id"],
            "tableId": tbl_id,
            "tableNumber": tbl_num,
            "tableSessionId": session_id,
            "customerName": "Guest Table",
            "items": [{"id": "item-drink", "menuItemId": "item-drink", "name": "Spritz", "price": 8.0, "quantity": 2, "targetDestination": "BAR", "isAlcoholic": True}],
            "totalAmount": 16.0,
            "status": "PENDING",
            "orderType": "DINE_IN",
            "targetDestination": "BAR"
        }
        res_ord2 = await client.post("/api/v1/orders", json=ord2_payload)
        assert res_ord2.status_code == 201
        ord2_data = res_ord2.json()

        # Both orders must share identical tableSessionId, but have distinct order IDs
        assert ord2_data["tableSessionId"] == session_id
        assert ord2_data["id"] != ord1_data["id"]


# =============================================================================
# GUARANTEE 3: WAITER CALL DISPATCH & RESOLUTION
# =============================================================================
@pytest.mark.asyncio
async def test_phase5_customer_waiter_call_dispatch_and_resolution():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest, tables, _ = await _setup_restaurant_with_tables(client, "CallRest")
        target_tbl = tables[2]
        tbl_id = target_tbl["id"]
        tbl_num = target_tbl["table_number"]

        # Start session
        res_sess = await client.post(
            f"/api/v1/restaurants/{rest['id']}/tables/{tbl_id}/session?table_number={tbl_num}"
        )
        session_id = res_sess.json()["id"]

        # Customer dispatches request ("Call Waiter")
        waiter_call_payload = {
            "restaurantId": rest["id"],
            "tableId": tbl_id,
            "tableNumber": tbl_num,
            "tableSessionId": session_id,
            "requestType": "WATER",
            "customTitle": "Still Water",
            "customerNotes": "With lemon",
            "priority": "MEDIUM"
        }
        res_call = await client.post("/api/v1/customer-requests", json=waiter_call_payload)
        assert res_call.status_code == 201
        call_data = res_call.json()
        req_id = call_data["id"]
        assert call_data["tableSessionId"] == session_id
        assert call_data["status"] == "PENDING"

        # Waiter terminal fetches requests for this restaurant
        waiter_headers = {
            "X-Staff-Role": "WAITER",
            "X-Staff-Restaurant-Id": rest["id"],
            "X-Staff-Id": "waiter-luca"
        }
        res_waiter_list = await client.get(
            f"/api/v1/customer-requests?restaurant_id={rest['id']}",
            headers=waiter_headers
        )
        assert res_waiter_list.status_code == 200
        active_calls = res_waiter_list.json()
        assert any(c["id"] == req_id for c in active_calls)

        # Waiter completes request
        res_comp_call = await client.patch(
            f"/api/v1/customer-requests/{req_id}",
            headers=waiter_headers,
            json={"status": "COMPLETED", "waiterName": "Luca"}
        )
        assert res_comp_call.status_code == 200
        assert res_comp_call.json()["status"] == "COMPLETED"


# =============================================================================
# GUARANTEE 4: MULTI-TENANT CROSS-CONTAMINATION SECURITY
# =============================================================================
@pytest.mark.asyncio
async def test_phase5_multi_tenant_cross_contamination_security():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Create Tenant A
        rest_a, tables_a, _ = await _setup_restaurant_with_tables(client, "TenantA")
        tbl_a = tables_a[0]

        # Create Tenant B (Competitor)
        rest_b, tables_b, _ = await _setup_restaurant_with_tables(client, "TenantB")

        # Attack 1: Tenant B staff attempts to read Tenant A's customer requests
        waiter_b_headers = {
            "X-Staff-Role": "WAITER",
            "X-Staff-Restaurant-Id": rest_b["id"],
            "X-Staff-Id": "waiter-attacker"
        }
        res_b_bleed = await client.get(
            f"/api/v1/customer-requests?restaurant_id={rest_a['id']}",
            headers=waiter_b_headers
        )
        assert res_b_bleed.status_code == 403, f"Expected 403 Forbidden on cross-tenant data exfiltration, got {res_b_bleed.status_code}"
        assert "Access denied" in res_b_bleed.text or "not authorized" in res_b_bleed.text

        # Attack 2: Tenant B attempts to start a table session on Tenant A's table
        res_cross_sess = await client.post(
            f"/api/v1/restaurants/{rest_b['id']}/tables/{tbl_a['id']}/session"
        )
        assert res_cross_sess.status_code == 403, f"Expected 403 Forbidden on cross-tenant table hijacking, got {res_cross_sess.status_code}"
        assert "does not belong" in res_cross_sess.text or "Cross-tenant" in res_cross_sess.text


# =============================================================================
# GUARANTEE 5: TABLE SESSION CLOSURE & VACANCY RELEASE
# =============================================================================
@pytest.mark.asyncio
async def test_phase5_table_session_closure_and_table_release():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest, tables, _ = await _setup_restaurant_with_tables(client, "CloseRest")
        target_tbl = tables[0]
        tbl_id = target_tbl["id"]
        tbl_num = target_tbl["table_number"]

        # Start active session
        res_sess = await client.post(
            f"/api/v1/restaurants/{rest['id']}/tables/{tbl_id}/session?table_number={tbl_num}"
        )
        session_id = res_sess.json()["id"]

        waiter_headers = {
            "X-Staff-Role": "WAITER",
            "X-Staff-Restaurant-Id": rest["id"],
            "X-Staff-Id": "waiter-close"
        }

        # Waiter closes table session
        res_close = await client.post(
            f"/api/v1/restaurants/{rest['id']}/tables/{tbl_id}/close-session?table_session_id={session_id}",
            headers=waiter_headers,
            json={"table_session_id": session_id, "waiter_name": "Staff"}
        )
        assert res_close.status_code in [200, 201]

        # Verify Table occupancy in DB reverts to AVAILABLE with active_session_id=None
        res_tbl_after = await client.get(f"/api/v1/restaurants/{rest['id']}/tables")
        tbl_after = [t for t in res_tbl_after.json() if t["id"] == tbl_id][0]
        assert tbl_after["status"] == "AVAILABLE"
        assert tbl_after["is_occupied"] is False
        assert tbl_after["active_session_id"] is None

        # Next guest scan receives a BRAND NEW fresh session ID
        res_new_sess = await client.post(
            f"/api/v1/restaurants/{rest['id']}/tables/{tbl_id}/session?table_number={tbl_num}"
        )
        assert res_new_sess.status_code in [200, 201]
        new_session_id = res_new_sess.json()["id"]
        assert new_session_id != session_id

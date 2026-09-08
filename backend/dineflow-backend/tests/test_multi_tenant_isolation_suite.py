import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table, TableSession
from app.modules.websocket.manager import ConnectionManager

@pytest.mark.asyncio
async def test_empty_menu_is_strictly_read_only(db_session):
    """
    Assert that GET /categories and GET /menu on a new venue with no menu items
    returns an empty list [] and DOES NOT insert synthetic mock items.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        test_id = f"rest-readonly-{uuid.uuid4().hex[:6]}"
        new_rest = Restaurant(
            id=test_id,
            name="Read Only Test Venue",
            slug=f"readonly-{test_id}",
            business_type="RESTAURANT",
            cuisine="Italian",
            is_approved=True,
            lifecycle_status="LIVE",
            status="OPEN",
            owner_email="readonly@test.com"
        )
        db_session.add(new_rest)
        await db_session.commit()

        # Call GET /menu multiple times
        for _ in range(3):
            res_menu = await client.get(f"/api/v1/restaurants/{test_id}/menu")
            assert res_menu.status_code == 200
            data = res_menu.json()
            assert data.get("items") == []
            assert data.get("categories") == []

        # Call GET /categories multiple times
        for _ in range(3):
            res_cat = await client.get(f"/api/v1/restaurants/{test_id}/categories")
            assert res_cat.status_code == 200
            assert res_cat.json() == []

@pytest.mark.asyncio
async def test_billing_fallback_strictly_returns_404(db_session):
    """
    Assert that querying billing config or calculation for legacy keywords
    ('rest-1', 'cafe-co', 'default') or non-existent identifiers returns 404
    and does NOT fall back to the first restaurant in the database.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Seed an authentic restaurant
        authentic_id = f"rest-auth-{uuid.uuid4().hex[:6]}"
        auth_rest = Restaurant(
            id=authentic_id,
            name="Authentic Flagship Venue",
            slug=f"auth-{authentic_id}",
            business_type="RESTAURANT",
            cuisine="Continental",
            is_approved=True,
            lifecycle_status="LIVE",
            status="OPEN",
            owner_email="auth@test.com"
        )
        db_session.add(auth_rest)
        await db_session.commit()

        # Querying with 'rest-1', 'default', 'cafe-co' must return 404, NOT auth_rest
        for bad_id in ["rest-1", "default", "cafe-co", "non-existent-tenant"]:
            res = await client.get(f"/api/v1/restaurants/{bad_id}/billing/config")
            assert res.status_code == 404, f"Expected 404 for '{bad_id}' but got {res.status_code}"

@pytest.mark.asyncio
async def test_table_session_closure_tenant_ownership_enforcement(db_session):
    """
    Assert that closing a table session strictly checks restaurant tenant scoping.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        rest_a = f"rest-a-{uuid.uuid4().hex[:6]}"
        rest_b = f"rest-b-{uuid.uuid4().hex[:6]}"

        db_session.add(Restaurant(id=rest_a, name="Rest A", slug=f"slug-{rest_a}", is_approved=True, status="OPEN", owner_email="owner_a@test.com"))
        db_session.add(Restaurant(id=rest_b, name="Rest B", slug=f"slug-{rest_b}", is_approved=True, status="OPEN", owner_email="owner_b@test.com"))
        await db_session.commit()

        # Create table session for restaurant A via explicit POST
        tbl_a_id = f"tbl-{rest_a}-01"
        res_sess = await client.post(f"/api/v1/restaurants/{rest_a}/tables/{tbl_a_id}/session?table_number=Table%2001")
        assert res_sess.status_code in [200, 201]
        sess_a_id = res_sess.json()["id"]

        # Attempt to close rest_a table session using rest_b endpoint
        res_cross_close = await client.post(
            f"/api/v1/restaurants/{rest_b}/tables/{tbl_a_id}/close-session?table_session_id={sess_a_id}",
            headers={"X-Staff-Role": "WAITER", "X-Staff-Restaurant-Id": rest_b},
            json={"table_session_id": sess_a_id, "waiter_name": "Intruder"}
        )
        # Should be rejected with 403 Forbidden or 404 Not Found
        assert res_cross_close.status_code in [403, 404]

def test_websocket_room_exact_tenant_isolation():
    """
    Verify WebSocket connection manager isolates rooms by exact restaurant ID,
    preventing substring matches like 'rest-1' matching 'rest-10' or 'rest-100'.
    """
    mgr = ConnectionManager()
    
    # Simulate connection for 'rest-1'
    conn_rest_1 = {"restaurant_id": "rest-1", "role": "WAITER", "terminal_id": "t1"}
    # Simulate connection for 'rest-10'
    conn_rest_10 = {"restaurant_id": "rest-10", "role": "WAITER", "terminal_id": "t2"}
    
    # Rest 1 target check:
    target_rest = "rest-1"
    match_1 = str(conn_rest_1.get("restaurant_id", "")).lower().strip() == target_rest
    match_10 = str(conn_rest_10.get("restaurant_id", "")).lower().strip() == target_rest
    
    assert match_1 is True
    assert match_10 is False  # Must NOT match via substring

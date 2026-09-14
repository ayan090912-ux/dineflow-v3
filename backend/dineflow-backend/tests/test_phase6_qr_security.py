import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database.connection import get_db
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table
from app.core.tenant.qr import generate_canonical_qr_url

@pytest.mark.asyncio
async def test_canonical_qr_generator_format():
    """Verify ONE canonical generator produces strict https://<slug>.dinely.food/customer?table=01&tableId=<id>"""
    url = generate_canonical_qr_url(slug="restaurant-a", table_number_or_clean="Table 01", table_id="tbl-rest-a-01")
    assert url == "https://restaurant-a.dinely.food/customer?table=01&tableId=tbl-rest-a-01"
    assert "?tenant=" not in url
    assert ".dinely.app" not in url
    assert "workspace" not in url

    # Variations
    assert generate_canonical_qr_url("the-dunk", "01", "tbl-1") == "https://the-dunk.dinely.food/customer?table=01&tableId=tbl-1"
    assert generate_canonical_qr_url("the-dunk", "1", "tbl-1") == "https://the-dunk.dinely.food/customer?table=01&tableId=tbl-1"
    assert generate_canonical_qr_url("the-dunk", "COUNTER", "tbl-c") == "https://the-dunk.dinely.food/customer?table=COUNTER&tableId=tbl-c"


@pytest.mark.asyncio
async def test_qr_security_hostname_restaurant_id_mismatch_returns_403(db_session):
    """
    Verify security gate:
    hostname.restaurant_id == table.restaurant_id
    If mismatch: strict 403 Forbidden
    """
    # 1. Seed two distinct live restaurants
    rest_a = Restaurant(
        id="rest-live-alpha",
        name="Restaurant Alpha",
        slug="rest-alpha",
        public_slug="rest-alpha",
        lifecycle_status="LIVE",
        is_approved=True
    )
    rest_b = Restaurant(
        id="rest-live-beta",
        name="Restaurant Beta",
        slug="rest-beta",
        public_slug="rest-beta",
        lifecycle_status="LIVE",
        is_approved=True
    )
    db_session.add_all([rest_a, rest_b])
    await db_session.flush()

    # 2. Seed Table 01 in Restaurant Alpha & Table 01 in Restaurant Beta
    table_a = Table(
        id="tbl-alpha-01",
        restaurant_id=rest_a.id,
        table_number="Table 01",
        status="AVAILABLE"
    )
    table_b = Table(
        id="tbl-beta-01",
        restaurant_id=rest_b.id,
        table_number="Table 01",
        status="AVAILABLE"
    )
    db_session.add_all([table_a, table_b])
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # A) Authorized lookup: Alpha queries its own Table 01 -> 200 OK
        res_valid = await ac.get(f"/api/v1/restaurants/{rest_a.id}/tables/{table_a.id}")
        assert res_valid.status_code == 200
        data_valid = res_valid.json()
        assert data_valid["restaurant_id"] == rest_a.id
        assert data_valid["id"] == table_a.id
        assert data_valid["qr_code_url"] == "https://rest-alpha.dinely.food/customer?table=01&tableId=tbl-alpha-01"

        # B) Cross-tenant breach attempt: Alpha queries Beta's Table -> 403 FORBIDDEN
        res_mismatch = await ac.get(f"/api/v1/restaurants/{rest_a.id}/tables/{table_b.id}")
        assert res_mismatch.status_code == 403
        assert f"Table '{table_b.id}' does not belong to restaurant '{rest_a.id}'" in res_mismatch.json()["detail"]

        # C) Cross-tenant session claim: Alpha tries to open session on Beta's Table -> 403 FORBIDDEN
        res_sess_mismatch = await ac.post(f"/api/v1/restaurants/{rest_a.id}/tables/{table_b.id}/session")
        assert res_sess_mismatch.status_code == 403
        assert f"Table '{table_b.id}' does not belong to restaurant '{rest_a.id}'" in res_sess_mismatch.json()["detail"]

        # D) Non-existent table -> 404 NOT FOUND
        res_nonexistent = await ac.get(f"/api/v1/restaurants/{rest_a.id}/tables/tbl-non-existent-999")
        assert res_nonexistent.status_code == 404

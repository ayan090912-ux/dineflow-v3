import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_close_table_session_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        rest_id = "rest-test-table-close"
        tbl_num = "Table 05"
        tbl_id = f"tbl-{rest_id}-table_05"

        # 1. Create table & active session
        res_sess = await client.get(f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/session?table_number={tbl_num}")
        assert res_sess.status_code == 200
        sess_data = res_sess.json()
        assert sess_data["status"] == "ACTIVE"

        # 2. Close table session
        res_close = await client.post(f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}/close-session")
        assert res_close.status_code == 200
        close_data = res_close.json()
        assert close_data["status"] == "success"
        assert tbl_id in close_data["table_id"] or tbl_num in close_data["message"]

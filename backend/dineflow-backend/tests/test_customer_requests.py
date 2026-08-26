import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_create_and_update_customer_request_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Create Customer Request (Water)
        payload = {
            "restaurantId": "rest-test-100",
            "tableId": "tbl-test-03",
            "tableNumber": "Table 03",
            "requestType": "WATER",
            "message": "Water requested for Table 03",
            "priority": "MEDIUM"
        }
        res_create = await client.post("/api/v1/customer-requests", json=payload)
        assert res_create.status_code == 201
        data = res_create.json()
        req_id = data["id"]
        assert data["restaurantId"] == "rest-test-100"
        assert data["tableNumber"] == "Table 03"
        assert data["requestType"] == "WATER"
        assert data["status"] == "PENDING"

        # 2. Update status: PENDING -> ACCEPTED (IN_PROGRESS)
        res_accept = await client.patch(f"/api/v1/customer-requests/{req_id}", json={"status": "ACCEPTED", "waiterName": "Ayaan"})
        assert res_accept.status_code == 200
        accept_data = res_accept.json()
        assert accept_data["status"] == "IN_PROGRESS"
        assert accept_data["waiterName"] == "Ayaan"

        # 3. Update status: IN_PROGRESS -> COMPLETED
        res_complete = await client.patch(f"/api/v1/customer-requests/{req_id}", json={"status": "COMPLETED", "waiterName": "Ayaan"})
        assert res_complete.status_code == 200
        complete_data = res_complete.json()
        assert complete_data["status"] == "COMPLETED"

        # 4. Attempt invalid transition: COMPLETED -> PENDING (Must fail with 400)
        res_invalid = await client.patch(f"/api/v1/customer-requests/{req_id}", json={"status": "PENDING"})
        assert res_invalid.status_code == 400
        assert "Invalid state transition" in res_invalid.json()["detail"]

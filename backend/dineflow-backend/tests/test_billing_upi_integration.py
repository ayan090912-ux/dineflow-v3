import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.modules.restaurants.models import Restaurant
from app.core.database.connection import AsyncSessionLocal

@pytest.mark.asyncio
async def test_billing_and_upi_save_and_customer_fetch_pipeline():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Seed or ensure CAFE.CO exists
        rest_id = "rest-test-cafeco-101"
        async with AsyncSessionLocal() as db:
            rest = Restaurant(
                id=rest_id,
                name="CAFE.CO",
                slug="cafe-co-test",
                is_approved=True,
                status="OPEN",
                currency="INR (₹)",
                tax_percentage=5.0,
            )
            db.add(rest)
            await db.commit()

        # 2. Owner fetches initial billing config
        res_get_init = await ac.get(f"/api/v1/restaurants/{rest_id}/billing/config")
        assert res_get_init.status_code == 200
        init_config = res_get_init.json()
        assert init_config["restaurantId"] == rest_id
        assert init_config["name"] == "CAFE.CO"

        # 3. Owner saves UPI configuration (Screenshot 1 simulation)
        payload = {
            "legal_name": "CAFE.CO Fine Dining Private Limited",
            "state": "Maharashtra",
            "state_code": "27",
            "gstin": "27AAACB2418L1Z2",
            "pan": "AAACB2418L",
            "invoice_prefix": "INV-",
            "invoice_starting_number": 1001,
            "service_charge_percentage": 5.0,
            "service_charge_enabled": True,
            "upi_id": "7488933071@ybl",
            "upi_merchant_name": "CAFE.CO",
            "upi_qr_url": "https://storage.googleapis.com/dinely-cd6cd.appspot.com/qr/standee.png",
            "upi_enabled": True
        }
        res_put = await ac.put(f"/api/v1/restaurants/{rest_id}/billing/config", json=payload)
        assert res_put.status_code == 200, f"PUT failed: {res_put.text}"
        saved_data = res_put.json()
        assert saved_data["status"] == "success"
        assert saved_data["config"]["upiId"] == "7488933071@ybl"
        assert saved_data["config"]["upiEnabled"] is True
        assert saved_data["config"]["upiMerchantName"] == "CAFE.CO"

        # 4. Customer on mobile device fetches billing / payment config for CAFE.CO
        res_customer_get = await ac.get(f"/api/v1/restaurants/{rest_id}/billing/config")
        assert res_customer_get.status_code == 200
        cust_config = res_customer_get.json()
        assert cust_config["upiId"] == "7488933071@ybl"
        assert cust_config["upiMerchantName"] == "CAFE.CO"
        assert cust_config["upiEnabled"] is True
        assert cust_config["upiQrUrl"] == "https://storage.googleapis.com/dinely-cd6cd.appspot.com/qr/standee.png"

        # 5. Customer fetches restaurant details directly
        res_rest_details = await ac.get(f"/api/v1/restaurants/{rest_id}")
        assert res_rest_details.status_code == 200
        rest_details = res_rest_details.json()
        assert rest_details["id"] == rest_id
        assert rest_details["name"] == "CAFE.CO"

@pytest.mark.asyncio
async def test_multi_tenant_upi_isolation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        rest_a = "rest-tenant-a"
        rest_b = "rest-tenant-b"

        async with AsyncSessionLocal() as db:
            db.add(Restaurant(id=rest_a, name="Restaurant A", slug="rest-a", is_approved=True, status="OPEN"))
            db.add(Restaurant(id=rest_b, name="Restaurant B", slug="rest-b", is_approved=True, status="OPEN"))
            await db.commit()

        # Save UPI for Restaurant A
        await ac.put(f"/api/v1/restaurants/{rest_a}/billing/config", json={
            "upi_id": "restaurantA@okhdfc",
            "upi_merchant_name": "Restaurant A",
            "upi_enabled": True
        })

        # Save UPI for Restaurant B
        await ac.put(f"/api/v1/restaurants/{rest_b}/billing/config", json={
            "upi_id": "restaurantB@icici",
            "upi_merchant_name": "Restaurant B",
            "upi_enabled": True
        })

        # Verify A gets ONLY A
        res_a = await ac.get(f"/api/v1/restaurants/{rest_a}/billing/config")
        assert res_a.json()["upiId"] == "restaurantA@okhdfc"

        # Verify B gets ONLY B
        res_b = await ac.get(f"/api/v1/restaurants/{rest_b}/billing/config")
        assert res_b.json()["upiId"] == "restaurantB@icici"

import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from jose import jwt

from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table
from app.core.config.settings import get_settings

settings = get_settings()

def create_jwt(payload: dict) -> str:
    claims = {
        "exp": int(datetime.now(timezone.utc).timestamp()) + 3600,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "email_verified": True,
        **payload,
    }
    return jwt.encode(claims, settings.JWT_ACCESS_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

@pytest.mark.asyncio
class TestTableOnboardingAndApprovalPersistence:
    async def test_table_creation_with_visual_layout_and_qr(self, db_session: AsyncSession):
        owner_uid = f"uid-tbl-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@test.com"
        rest_id = f"rest-tbl-{uuid.uuid4().hex[:6]}"
        slug = f"tbl-slug-{uuid.uuid4().hex[:6]}"

        rest = Restaurant(
            id=rest_id,
            name="Table Test Bistro",
            slug=slug,
            public_slug=slug,
            has_tables=True,
            has_kitchen=True,
            has_waiter=True,
            enabled_modules=["kitchen", "waiter", "billing", "tables"],
            owner_uid=owner_uid,
            owner_email=owner_email,
            is_approved=True,
            lifecycle_status="LIVE",
            status="OPEN",
        )
        db_session.add(rest)
        await db_session.commit()

        token = create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest_id})
        headers = {"Authorization": f"Bearer {token}"}
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Create table with shape, isVip, positionX, positionY, rotation
            create_res = await client.post(
                f"/api/v1/restaurants/{rest_id}/tables",
                headers=headers,
                json={
                    "tableNumber": "Table 42",
                    "capacity": 6,
                    "section": "VIP Lounge",
                    "shape": "ROUND",
                    "isVip": True,
                    "positionX": 150.5,
                    "positionY": 280.0,
                    "rotation": 45.0,
                }
            )
            assert create_res.status_code in (200, 201), f"Error: {create_res.text}"
            data = create_res.json()
            assert data["table_number"] == "Table 42"
            assert data["shape"] == "ROUND"
            assert data["is_vip"] is True
            assert data["position_x"] == 150.5
            assert data["position_y"] == 280.0
            assert data["rotation"] == 45.0
            assert "qr_code_url" in data
            tbl_id = data["id"]

            # 2. Update table layout properties
            update_res = await client.put(
                f"/api/v1/restaurants/{rest_id}/tables/{tbl_id}",
                headers=headers,
                json={
                    "shape": "SQUARE",
                    "isVip": False,
                    "positionX": 300.0,
                    "positionY": 400.0,
                    "rotation": 90.0,
                }
            )
            assert update_res.status_code == 200, f"Error: {update_res.text}"
            updated_data = update_res.json()
            assert updated_data["shape"] == "SQUARE"
            assert updated_data["is_vip"] is False
            assert updated_data["position_x"] == 300.0
            assert updated_data["position_y"] == 400.0
            assert updated_data["rotation"] == 90.0

            # 3. GET /tables returns all layout fields
            list_res = await client.get(f"/api/v1/restaurants/{rest_id}/tables", headers=headers)
            assert list_res.status_code == 200
            tables_list = list_res.json()
            matched = [t for t in tables_list if t["id"] == tbl_id]
            assert len(matched) == 1
            assert matched[0]["shape"] == "SQUARE"
            assert matched[0]["position_x"] == 300.0

    async def test_onboarding_and_approval_preserves_tables_module(self, db_session: AsyncSession):
        owner_uid = f"uid-onb-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@test.com"
        admin_email = "ayan090912@gmail.com"

        owner_token = create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER"})
        admin_token = create_jwt({"sub": "admin-1", "email": admin_email, "role": "PLATFORM_ADMIN"})

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Create restaurant
            create_res = await client.post(
                "/api/v1/restaurants",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={
                    "name": "Auto Table Onboarding Rest",
                    "businessType": "RESTAURANT",
                    "hasTables": True,
                    "tableCount": 10,
                    "hasKitchen": True,
                    "hasWaiter": True,
                    "phone": "+919876543210",
                    "address": "123 High Street, MG Road, Bangalore",
                }
            )
            assert create_res.status_code in (200, 201), f"Error: {create_res.text}"
            rest_data = create_res.json()
            rest_id = rest_data["id"]

            # Verify 'tables' is already present in enabled_modules
            assert "tables" in rest_data["enabled_modules"]

            # 2. Submit restaurant for approval without explicit 'tables' in payload
            submit_res = await client.post(
                f"/api/v1/restaurants/{rest_id}/submit",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={
                    "totalTablesCount": 10,
                    "enabledModules": ["kitchen", "waiter", "billing"]  # intentionally missing tables
                }
            )
            assert submit_res.status_code == 200, f"Error: {submit_res.text}"
            submitted_data = submit_res.json()
            assert "tables" in submitted_data["enabled_modules"]

            # 3. Platform Admin approves the restaurant
            approve_res = await client.post(
                "/api/v1/admin/restaurants/approve",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"restaurantId": rest_id, "comment": "Approved for live operations"}
            )
            assert approve_res.status_code == 200, f"Error: {approve_res.text}"
            approved_data = approve_res.json()
            assert approved_data["is_approved"] is True
            assert approved_data["lifecycle_status"] == "LIVE"
            assert "tables" in approved_data["enabled_modules"]

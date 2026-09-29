import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.orders.models import Order
from app.modules.inventory.models import InventoryItemModel
from app.core.config.settings import get_settings
from jose import jwt
from datetime import datetime, timezone

settings = get_settings()

def create_test_jwt(payload: dict) -> str:
    claims = {
        "exp": int(datetime.now(timezone.utc).timestamp()) + 3600,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        **payload,
    }
    return jwt.encode(claims, settings.JWT_ACCESS_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


@pytest.mark.asyncio
class TestWorkspaceModulesConfiguration:
    async def _create_test_restaurant(self, db: AsyncSession, slug: str, owner_uid: str, owner_email: str) -> Restaurant:
        rest_id = f"rest-cfg-{slug}-{uuid.uuid4().hex[:6]}"
        rest = Restaurant(
            id=rest_id,
            name=f"Config Test {slug.title()}",
            slug=slug,
            public_slug=slug,
            cuisine="Italian",
            business_type="RESTAURANT",
            has_kitchen=True,
            has_bar=True,
            has_waiter=True,
            has_inventory=True,
            has_billing=True,
            has_tables=True,
            enabled_modules=["kitchen", "bar", "waiter", "inventory", "billing"],
            owner_uid=owner_uid,
            owner_email=owner_email,
            is_approved=True,
            lifecycle_status="LIVE",
            status="OPEN",
        )
        db.add(rest)
        await db.commit()
        await db.refresh(rest)
        return rest

    async def test_get_workspace_modules(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"slug-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(f"/api/v1/restaurants/{rest.id}/workspace-modules")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "success"
            assert data["restaurantId"] == rest.id
            assert data["hasKitchen"] is True
            assert data["hasBar"] is True
            assert "bar" in data["enabledModules"]

    async def test_unauthenticated_patch_workspace_modules_rejected(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"slug-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.patch(
                f"/api/v1/restaurants/{rest.id}/workspace-modules",
                json={"enabledModules": ["kitchen"]}
            )
            assert resp.status_code in (401, 403)

    async def test_unauthorized_staff_cannot_modify_workspace_modules(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"slug-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        # Cook / Kitchen staff token
        staff_token = create_test_jwt({
            "uid": f"cook_{uuid.uuid4().hex[:6]}",
            "email": "cook@staff.dinely.internal",
            "role": "CHEF",
            "restaurant_id": rest.id
        })

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.patch(
                f"/api/v1/restaurants/{rest.id}/workspace-modules",
                headers={"Authorization": f"Bearer {staff_token}"},
                json={"enabledModules": ["kitchen"]}
            )
            # Staff role CHEF is forbidden from modifying workspace configuration
            assert resp.status_code == 403

    async def test_owner_can_toggle_modules_and_persists_in_db(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"slug-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        owner_token = create_test_jwt({
            "uid": owner_uid,
            "email": owner_email,
            "role": "OWNER",
            "restaurant_id": rest.id
        })

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Disable BAR and WAITER
            patch_resp = await ac.patch(
                f"/api/v1/restaurants/{rest.id}/workspace-modules",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={
                    "enabledModules": ["kitchen", "inventory", "billing"],
                    "hasBar": False,
                    "hasWaiter": False,
                    "hasKitchen": True,
                    "hasInventory": True,
                    "hasBilling": True
                }
            )
            assert patch_resp.status_code == 200
            data = patch_resp.json()
            assert data["status"] == "success"
            assert data["hasBar"] is False
            assert data["hasWaiter"] is False
            assert "bar" not in data["enabledModules"]

            # Verify in PostgreSQL
            db_res = await db_session.execute(select(Restaurant).where(Restaurant.id == rest.id))
            refreshed = db_res.scalar_one()
            assert refreshed.has_bar is False
            assert refreshed.has_waiter is False
            assert refreshed.has_kitchen is True
            assert "bar" not in refreshed.enabled_modules

            # Re-enable BAR
            patch_resp2 = await ac.patch(
                f"/api/v1/restaurants/{rest.id}/workspace-modules",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={
                    "enabledModules": ["kitchen", "bar", "inventory", "billing"],
                    "hasBar": True,
                    "hasWaiter": False,
                    "hasKitchen": True,
                    "hasInventory": True,
                    "hasBilling": True
                }
            )
            assert patch_resp2.status_code == 200
            data2 = patch_resp2.json()
            assert data2["hasBar"] is True
            assert "bar" in data2["enabledModules"]

    async def test_operational_action_blocked_when_terminal_disabled(self, db_session: AsyncSession):
        owner_uid = f"uid_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@test.com"
        rest = await self._create_test_restaurant(db_session, f"slug-{uuid.uuid4().hex[:6]}", owner_uid, owner_email)

        # 1. Disable Bar & Waiter & Inventory
        rest.has_bar = False
        rest.has_waiter = False
        rest.has_inventory = False
        rest.enabled_modules = ["kitchen", "billing"]
        await db_session.commit()

        owner_token = create_test_jwt({
            "uid": owner_uid,
            "email": owner_email,
            "role": "OWNER",
            "restaurant_id": rest.id
        })

        # Create an order
        order_id = f"ord-test-{uuid.uuid4().hex[:6]}"
        test_order = Order(
            id=order_id,
            restaurant_id=rest.id,
            table_number="Table 01",
            status="PENDING",
            kitchen_status="PENDING",
            bar_status="PENDING",
            subtotal=100.0,
            total_amount=100.0,
            tax_amount=0.0,
            order_number="#999"
        )
        db_session.add(test_order)
        await db_session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Bar action when bar is disabled -> should be rejected with 400
            bar_status_resp = await ac.patch(
                f"/api/v1/orders/{order_id}/status",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={"barStatus": "PREPARING"}
            )
            assert bar_status_resp.status_code == 400
            assert "Bar terminal is disabled" in bar_status_resp.text

            # Waiter customer request when waiter is disabled -> should be rejected with 400
            waiter_req_resp = await ac.post(
                "/api/v1/customer-requests",
                json={
                    "restaurantId": rest.id,
                    "tableNumber": "01",
                    "requestType": "WATER"
                }
            )
            assert waiter_req_resp.status_code == 400
            assert "Waiter service is disabled" in waiter_req_resp.text

            # Inventory item creation when inventory is disabled -> should be rejected with 400
            inv_resp = await ac.post(
                f"/api/v1/restaurants/{rest.id}/inventory",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={
                    "name": "Barley Malt",
                    "category": "Grain",
                    "station": "KITCHEN",
                    "quantity": 10.0,
                    "unit": "kg",
                    "minThreshold": 2.0,
                    "costPerUnit": 50.0
                }
            )
            assert inv_resp.status_code == 400
            assert "Inventory module is disabled" in inv_resp.text

            # Table creation when tables is disabled -> should be rejected with 400
            rest.has_tables = False
            await db_session.commit()
            tbl_resp = await ac.post(
                f"/api/v1/restaurants/{rest.id}/tables",
                headers={"Authorization": f"Bearer {owner_token}"},
                json={
                    "tableNumber": "Table 99",
                    "capacity": 4,
                    "section": "Main Dining"
                }
            )
            assert tbl_resp.status_code == 400
            assert "Tables & Floorplan feature is currently disabled" in tbl_resp.text

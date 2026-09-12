import json
import base64
import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.modules.restaurants.models import Restaurant, RestaurantMembership
from app.modules.inventory.models import InventoryItemModel, SupplierModel


def create_fake_jwt(claims: dict) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_test_signature"
    return f"{header}.{payload}.{signature}"


@pytest.mark.asyncio
class TestInventoryModule:

    async def _create_test_restaurant(self, db: AsyncSession, suffix: str, owner_uid: str, owner_email: str):
        rest_id = f"rest-inv-{suffix}-{uuid.uuid4().hex[:6]}"
        rest = Restaurant(
            id=rest_id,
            name=f"Inventory Bistro {suffix}",
            slug=f"inv-bistro-{suffix}",
            public_slug=f"inv-bistro-{suffix}",
            owner_uid=owner_uid,
            owner_email=owner_email,
            status="ACTIVE",
            lifecycle_status="LIVE",
        )
        db.add(rest)
        mem = RestaurantMembership(
            id=f"mem-{uuid.uuid4().hex[:8]}",
            restaurant_id=rest_id,
            user_uid=owner_uid,
            user_email=owner_email,
            role="OWNER",
        )
        db.add(mem)
        await db.commit()
        await db.refresh(rest)
        return rest

    async def test_inventory_crud_lifecycle(self, db_session: AsyncSession):
        owner_uid = f"uid_inv_{uuid.uuid4().hex[:6]}"
        owner_email = f"owner_{uuid.uuid4().hex[:6]}@example.com"
        rest = await self._create_test_restaurant(db_session, "alpha", owner_uid, owner_email)

        token = create_fake_jwt({"uid": owner_uid, "email": owner_email, "role": "RESTAURANT_OWNER"})
        headers = {
            "Authorization": f"Bearer {token}",
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Create inventory item
            create_resp = await ac.post(
                f"/api/v1/restaurants/{rest.id}/inventory",
                headers=headers,
                json={
                    "name": "Organic Cheddar",
                    "category": "Dairy & Cheese",
                    "station": "KITCHEN",
                    "quantity": 15.5,
                    "unit": "kg",
                    "minThreshold": 5.0,
                    "costPerUnit": 450.0,
                    "storageLocation": "Walk-in Cooler #2",
                }
            )
            assert create_resp.status_code == 201, create_resp.text
            item_data = create_resp.json()
            assert item_data["name"] == "Organic Cheddar"
            assert item_data["quantity"] == 15.5
            assert item_data["status"] == "IN_STOCK"
            item_id = item_data["id"]

            # 2. List inventory items
            list_resp = await ac.get(f"/api/v1/restaurants/{rest.id}/inventory", headers=headers)
            assert list_resp.status_code == 200
            items = list_resp.json()
            assert len(items) == 1
            assert items[0]["id"] == item_id

            # 3. Adjust stock (decrement by 12kg -> quantity becomes 3.5 <= minThreshold 5.0 -> LOW_STOCK)
            adjust_resp = await ac.post(
                f"/api/v1/restaurants/{rest.id}/inventory/{item_id}/adjust",
                headers=headers,
                json={"delta": -12.0}
            )
            assert adjust_resp.status_code == 200
            adj_data = adjust_resp.json()
            assert adj_data["quantity"] == 3.5
            assert adj_data["status"] == "LOW_STOCK"

            # 4. Update item metadata
            patch_resp = await ac.patch(
                f"/api/v1/restaurants/{rest.id}/inventory/{item_id}",
                headers=headers,
                json={
                    "name": "Aged Organic Cheddar",
                    "storageLocation": "Walk-in Cooler #1"
                }
            )
            assert patch_resp.status_code == 200
            patched_data = patch_resp.json()
            assert patched_data["name"] == "Aged Organic Cheddar"
            assert patched_data["storageLocation"] == "Walk-in Cooler #1"

            # 5. Delete item
            del_resp = await ac.delete(f"/api/v1/restaurants/{rest.id}/inventory/{item_id}", headers=headers)
            assert del_resp.status_code == 204

            # Verify empty list
            list_resp2 = await ac.get(f"/api/v1/restaurants/{rest.id}/inventory", headers=headers)
            assert list_resp2.status_code == 200
            assert len(list_resp2.json()) == 0

    async def test_inventory_multi_tenant_isolation(self, db_session: AsyncSession):
        uid_a = f"uid_a_{uuid.uuid4().hex[:6]}"
        email_a = f"owner_a_{uuid.uuid4().hex[:6]}@example.com"
        rest_a = await self._create_test_restaurant(db_session, "tenant_a", uid_a, email_a)

        uid_b = f"uid_b_{uuid.uuid4().hex[:6]}"
        email_b = f"owner_b_{uuid.uuid4().hex[:6]}@example.com"
        rest_b = await self._create_test_restaurant(db_session, "tenant_b", uid_b, email_b)

        token_a = create_fake_jwt({"uid": uid_a, "email": email_a, "role": "RESTAURANT_OWNER"})
        token_b = create_fake_jwt({"uid": uid_b, "email": email_b, "role": "RESTAURANT_OWNER"})
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Unauthenticated request returns 401
            unauth_resp = await ac.get(f"/api/v1/restaurants/{rest_a.id}/inventory")
            assert unauth_resp.status_code == 401

            # 2. Owner A creates inventory item in Restaurant A
            create_resp = await ac.post(
                f"/api/v1/restaurants/{rest_a.id}/inventory",
                headers=headers_a,
                json={"name": "Whiskey Single Malt", "station": "BAR", "quantity": 10.0}
            )
            assert create_resp.status_code == 201
            item_a_id = create_resp.json()["id"]

            # 3. Owner B tries to access Restaurant A inventory -> 403 FORBIDDEN
            cross_get = await ac.get(f"/api/v1/restaurants/{rest_a.id}/inventory", headers=headers_b)
            assert cross_get.status_code == 403

            # 4. Owner B tries to adjust Restaurant A item -> 403 FORBIDDEN
            cross_adj = await ac.post(
                f"/api/v1/restaurants/{rest_a.id}/inventory/{item_a_id}/adjust",
                headers=headers_b,
                json={"delta": -5.0}
            )
            assert cross_adj.status_code == 403

            # 5. Owner B tries to delete Restaurant A item -> 403 FORBIDDEN
            cross_del = await ac.delete(
                f"/api/v1/restaurants/{rest_a.id}/inventory/{item_a_id}",
                headers=headers_b
            )
            assert cross_del.status_code == 403

    async def test_supplier_crud_and_isolation(self, db_session: AsyncSession):
        uid_a = f"uid_sup_a_{uuid.uuid4().hex[:6]}"
        email_a = f"owner_sup_a_{uuid.uuid4().hex[:6]}@example.com"
        rest_a = await self._create_test_restaurant(db_session, "sup_a", uid_a, email_a)

        uid_b = f"uid_sup_b_{uuid.uuid4().hex[:6]}"
        email_b = f"owner_sup_b_{uuid.uuid4().hex[:6]}@example.com"
        rest_b = await self._create_test_restaurant(db_session, "sup_b", uid_b, email_b)

        token_a = create_fake_jwt({"uid": uid_a, "email": email_a, "role": "RESTAURANT_OWNER"})
        token_b = create_fake_jwt({"uid": uid_b, "email": email_b, "role": "RESTAURANT_OWNER"})
        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Create supplier for Restaurant A
            sup_resp = await ac.post(
                f"/api/v1/restaurants/{rest_a.id}/suppliers",
                headers=headers_a,
                json={
                    "name": "Dairy Express Ltd",
                    "contactPerson": "Ramesh Kumar",
                    "phone": "+91 9876543210",
                    "email": "ramesh@dairyexpress.in",
                    "supplyCategory": "Dairy & Cheese",
                    "address": "Warehouse 4B, Food Park",
                }
            )
            assert sup_resp.status_code == 201
            sup_data = sup_resp.json()
            sup_id = sup_data["id"]

            # 2. List suppliers for Restaurant A
            list_resp = await ac.get(f"/api/v1/restaurants/{rest_a.id}/suppliers", headers=headers_a)
            assert list_resp.status_code == 200
            assert len(list_resp.json()) == 1

            # 3. Cross-tenant access: Owner B accessing Restaurant A suppliers -> 403 FORBIDDEN
            cross_resp = await ac.get(f"/api/v1/restaurants/{rest_a.id}/suppliers", headers=headers_b)
            assert cross_resp.status_code == 403

            # 4. Cross-tenant delete: Owner B deleting Restaurant A supplier -> 403 FORBIDDEN
            cross_del = await ac.delete(f"/api/v1/restaurants/{rest_a.id}/suppliers/{sup_id}", headers=headers_b)
            assert cross_del.status_code == 403

            # 5. Owner A deletes supplier -> 204
            del_resp = await ac.delete(f"/api/v1/restaurants/{rest_a.id}/suppliers/{sup_id}", headers=headers_a)
            assert del_resp.status_code == 204

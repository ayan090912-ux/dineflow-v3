import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from jose import jwt

from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.terminals.models import Terminal
from app.core.config.settings import get_settings

settings = get_settings()

def create_jwt(payload: dict) -> str:
    claims = {
        "exp": int(datetime.now(timezone.utc).timestamp()) + 3600,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        **payload,
    }
    return jwt.encode(claims, settings.JWT_ACCESS_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

@pytest.mark.asyncio
class TestTerminalsLifecycleAndSecurity:
    async def _setup_restaurant(self, db_session: AsyncSession, name: str):
        owner_uid = f"uid-term-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@test.com"
        rest_id = f"rest-trm-{uuid.uuid4().hex[:6]}"
        slug = f"trm-slug-{uuid.uuid4().hex[:6]}"

        rest = Restaurant(
            id=rest_id,
            name=name,
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
        return rest, owner_uid, owner_email

    async def test_terminal_crud_and_conflict_handling(self, db_session: AsyncSession):
        rest, owner_uid, owner_email = await self._setup_restaurant(db_session, "Terminal Test Kitchen")
        token = create_jwt({"sub": owner_uid, "email": owner_email, "role": "OWNER", "restaurant_id": rest.id})
        headers = {"Authorization": f"Bearer {token}"}
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Create Terminal
            create_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/terminals",
                headers=headers,
                json={
                    "name": "Terrace Waiter Tablet 1",
                    "terminalCode": "WAITER-01",
                    "terminalType": "WAITER",
                    "deviceInfo": "Samsung Galaxy Tab A8",
                }
            )
            assert create_res.status_code == 201, f"Error: {create_res.text}"
            term = create_res.json()
            assert term["terminalCode"] == "WAITER-01"
            assert term["name"] == "Terrace Waiter Tablet 1"
            assert term["terminalType"] == "WAITER"
            assert term["isActive"] is True
            term_id = term["id"]

            # 2. Reject Duplicate Terminal Code with 409 Conflict
            dup_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/terminals",
                headers=headers,
                json={
                    "name": "Another Tablet with Same Code",
                    "terminalCode": "WAITER-01",
                    "terminalType": "WAITER",
                }
            )
            assert dup_res.status_code == 409
            assert "already registered" in dup_res.json()["detail"]

            # 3. GET /terminals
            list_res = await client.get(f"/api/v1/restaurants/{rest.id}/terminals", headers=headers)
            assert list_res.status_code == 200
            terminals = list_res.json()
            assert len(terminals) >= 1
            assert any(t["id"] == term_id for t in terminals)

            # 4. Heartbeat
            hb_res = await client.post(
                f"/api/v1/restaurants/{rest.id}/terminals/{term_id}/heartbeat",
                headers=headers
            )
            assert hb_res.status_code == 200
            assert hb_res.json()["status"] == "success"

            # 5. Delete Terminal
            del_res = await client.delete(
                f"/api/v1/restaurants/{rest.id}/terminals/{term_id}",
                headers=headers
            )
            assert del_res.status_code == 200
            assert del_res.json()["status"] == "success"

            # Verify deleted from list
            list_res_after = await client.get(f"/api/v1/restaurants/{rest.id}/terminals", headers=headers)
            assert not any(t["id"] == term_id for t in list_res_after.json())

    async def test_terminal_cross_tenant_isolation(self, db_session: AsyncSession):
        rest_a, owner_a_uid, owner_a_email = await self._setup_restaurant(db_session, "Tenant A")
        rest_b, owner_b_uid, owner_b_email = await self._setup_restaurant(db_session, "Tenant B")

        token_a = create_jwt({"sub": owner_a_uid, "email": owner_a_email, "role": "OWNER", "restaurant_id": rest_a.id})
        token_b = create_jwt({"sub": owner_b_uid, "email": owner_b_email, "role": "OWNER", "restaurant_id": rest_b.id})

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Tenant A creates terminal
            create_a = await client.post(
                f"/api/v1/restaurants/{rest_a.id}/terminals",
                headers={"Authorization": f"Bearer {token_a}"},
                json={"name": "A POS", "terminalCode": "POS-01", "terminalType": "POS"}
            )
            assert create_a.status_code == 201

            # Tenant B tries to access Tenant A's terminals -> 403 Forbidden
            cross_get = await client.get(
                f"/api/v1/restaurants/{rest_a.id}/terminals",
                headers={"Authorization": f"Bearer {token_b}"}
            )
            assert cross_get.status_code == 403

            # Tenant B tries to create terminal inside Tenant A -> 403 Forbidden
            cross_create = await client.post(
                f"/api/v1/restaurants/{rest_a.id}/terminals",
                headers={"Authorization": f"Bearer {token_b}"},
                json={"name": "Malicious Terminal", "terminalCode": "HACK-01"}
            )
            assert cross_create.status_code == 403

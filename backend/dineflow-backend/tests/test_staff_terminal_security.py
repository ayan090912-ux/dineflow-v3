import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.modules.restaurants.models import Restaurant


@pytest.mark.asyncio
class TestStaffTerminalSecurity:

    async def _create_test_restaurant(self, db: AsyncSession, name: str, slug: str, status="ACTIVE", lifecycle="LIVE"):
        rest_id = f"rest-staff-{uuid.uuid4().hex[:6]}"
        rest = Restaurant(
            id=rest_id,
            name=name,
            slug=slug,
            public_slug=slug,
            owner_uid=f"uid_{uuid.uuid4().hex[:6]}",
            owner_email=f"owner_{uuid.uuid4().hex[:6]}@example.com",
            status=status,
            lifecycle_status=lifecycle,
        )
        db.add(rest)
        await db.commit()
        await db.refresh(rest)
        return rest

    async def test_terminal_login_and_token_authorization(self, db_session: AsyncSession):
        rest = await self._create_test_restaurant(db_session, "Bistro Staff 1", "bistro-staff-1")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Login as kitchen terminal
            login_resp = await ac.post(
                "/api/v1/auth/terminal-login",
                json={
                    "restaurant_id": rest.id,
                    "identifier": "Head Chef Mario",
                    "passcode": "1234",
                    "role": "KITCHEN"
                }
            )
            assert login_resp.status_code == 200, login_resp.text
            data = login_resp.json()
            assert "access_token" in data
            assert data["role"] == "KITCHEN"
            assert data["restaurant_id"] == rest.id
            token = data["access_token"]

            # 2. Kitchen token can read restaurant inventory
            kitchen_headers = {"Authorization": f"Bearer {token}"}
            inv_resp = await ac.get(f"/api/v1/restaurants/{rest.id}/inventory", headers=kitchen_headers)
            assert inv_resp.status_code == 200

            # 3. Terminal login with role OWNER is strictly rejected
            owner_try = await ac.post(
                "/api/v1/auth/terminal-login",
                json={
                    "restaurant_id": rest.id,
                    "identifier": "owner",
                    "passcode": "1234",
                    "role": "OWNER"
                }
            )
            assert owner_try.status_code == 403
            assert "Administrative and Owner accounts cannot authenticate via terminal PIN" in owner_try.json()["detail"]

    async def test_cross_tenant_terminal_token_isolation(self, db_session: AsyncSession):
        rest_a = await self._create_test_restaurant(db_session, "Cafe Alpha", "cafe-alpha")
        rest_b = await self._create_test_restaurant(db_session, "Bistro Beta", "bistro-beta")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Login to Restaurant A as Waiter
            login_a = await ac.post(
                "/api/v1/auth/terminal-login",
                json={
                    "restaurant_id": rest_a.id,
                    "identifier": "Waiter John",
                    "passcode": "4321",
                    "role": "WAITER"
                }
            )
            assert login_a.status_code == 200
            token_a = login_a.json()["access_token"]
            headers_a = {"Authorization": f"Bearer {token_a}"}

            # Waiter A accesses Restaurant A customer-requests -> 200 OK
            ok_resp = await ac.get(f"/api/v1/customer-requests?restaurant_id={rest_a.id}", headers=headers_a)
            assert ok_resp.status_code == 200

            # Waiter A tries to access Restaurant B customer-requests -> 403 Forbidden!
            forbidden_resp = await ac.get(f"/api/v1/customer-requests?restaurant_id={rest_b.id}", headers=headers_a)
            assert forbidden_resp.status_code == 403

            # Waiter A tries to access Restaurant B inventory -> 403 Forbidden!
            forbidden_inv = await ac.get(f"/api/v1/restaurants/{rest_b.id}/inventory", headers=headers_a)
            assert forbidden_inv.status_code == 403

    async def test_terminal_login_validation_and_tampering(self, db_session: AsyncSession):
        rest = await self._create_test_restaurant(db_session, "Pizzeria Gamma", "pizzeria-gamma")
        archived_rest = await self._create_test_restaurant(db_session, "Archived Delta", "archived-delta", lifecycle="ARCHIVED")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Non-existent restaurant returns 404
            missing_resp = await ac.post(
                "/api/v1/auth/terminal-login",
                json={"restaurant_id": "non-existent-rest", "passcode": "1234"}
            )
            assert missing_resp.status_code == 404

            # 2. Archived restaurant returns 403
            archived_resp = await ac.post(
                "/api/v1/auth/terminal-login",
                json={"restaurant_id": archived_rest.id, "passcode": "1234"}
            )
            assert archived_resp.status_code == 403

            # 3. Short passcode returns 400
            short_resp = await ac.post(
                "/api/v1/auth/terminal-login",
                json={"restaurant_id": rest.id, "passcode": "1"}
            )
            assert short_resp.status_code == 400

            # 4. Tampered token signature fails verification
            valid_login = await ac.post(
                "/api/v1/auth/terminal-login",
                json={"restaurant_id": rest.id, "passcode": "1234", "role": "WAITER"}
            )
            real_token = valid_login.json()["access_token"]
            tampered_token = real_token[:-6] + "xxxxxx"

            tampered_resp = await ac.get(
                f"/api/v1/restaurants/{rest.id}/inventory",
                headers={"Authorization": f"Bearer {tampered_token}"}
            )
            assert tampered_resp.status_code == 401

    def test_websocket_privileged_role_tenant_authorization(self):
        from fastapi.testclient import TestClient
        from starlette.websockets import WebSocketDisconnect

        tc = TestClient(app)

        # 1. Unauthenticated privileged role (e.g. WAITER without token) is rejected with 1008
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with tc.websocket_connect("/api/v1/ws?restaurant_id=rest-demo-1&role=WAITER") as ws:
                pass
        assert exc_info.value.code == 1008

        # 2. Authenticated login produces valid token that can connect to WebSocket for that restaurant
        login_res = tc.post(
            "/api/v1/auth/terminal-login",
            json={"restaurant_id": "rest-demo-1", "passcode": "1234", "role": "WAITER"}
        )
        if login_res.status_code == 200:
            token_valid = login_res.json()["access_token"]
            with tc.websocket_connect(f"/api/v1/ws?restaurant_id=rest-demo-1&role=WAITER&token={token_valid}") as ws:
                ws.send_text("ping")
                resp = ws.receive_text()
                assert resp == "pong"

            # 3. Cross-tenant token (Token for rest-demo-1 attempting to connect to rest-other) is rejected with 1008
            with pytest.raises(WebSocketDisconnect) as exc_cross:
                with tc.websocket_connect(f"/api/v1/ws?restaurant_id=rest-other-2&role=WAITER&token={token_valid}") as ws:
                    pass
            assert exc_cross.value.code == 1008

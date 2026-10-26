import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone
from jose import jwt

from app.main import app
from app.modules.restaurants.models import Restaurant, RestaurantMembership
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
class TestMultiTenantNavigationAndSelection:
    """
    Regression suite for CRITICAL BUG: Every business redirects to THE START.
    Validates:
    1. Public tenant resolution returns the exact business and 404 for unknown.
    2. /auth/me respects X-Restaurant-Id and X-Tenant-Slug headers without defaulting to THE START.
    3. Switching active restaurant context updates backend session context.
    4. Bug reproduction: non-THE-START businesses never return THE START.
    """

    async def _setup_businesses(self, db_session):
        owner_uid = f"nav-owner-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@dineflow-nav.com"

        # 1. THE START (Restaurant & Bar OS)
        the_start = Restaurant(
            id=f"rest-start-{uuid.uuid4().hex[:6]}",
            name="THE START",
            slug=f"the-start-{uuid.uuid4().hex[:4]}",
            public_slug=f"the-start-{uuid.uuid4().hex[:4]}",
            owner_uid=owner_uid,
            owner_email=owner_email,
            business_type="BAR",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_bar=True,
            has_tables=True,
            has_kitchen=True,
            enabled_modules=["kitchen", "waiter", "bar", "inventory", "billing"],
        )

        # 2. local vender (Restaurant OS)
        local_vender = Restaurant(
            id=f"rest-vender-{uuid.uuid4().hex[:6]}",
            name="local vender",
            slug=f"local-vender-{uuid.uuid4().hex[:4]}",
            public_slug=f"local-vender-{uuid.uuid4().hex[:4]}",
            owner_uid=owner_uid,
            owner_email=owner_email,
            business_type="RESTAURANT",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_bar=False,
            has_tables=True,
            has_kitchen=True,
            enabled_modules=["kitchen", "waiter", "inventory", "billing", "tables"],
        )

        # 3. MAX KART (Small Cart OS)
        max_kart = Restaurant(
            id=f"rest-kart-{uuid.uuid4().hex[:6]}",
            name="MAX KART",
            slug=f"max-kart-{uuid.uuid4().hex[:4]}",
            public_slug=f"max-kart-{uuid.uuid4().hex[:4]}",
            owner_uid=owner_uid,
            owner_email=owner_email,
            business_type="FOOD_CART",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_bar=False,
            has_tables=False,
            has_kitchen=True,
            enabled_modules=["kitchen", "inventory", "billing"],
        )

        db_session.add_all([the_start, local_vender, max_kart])
        await db_session.flush()

        # Add memberships for owner
        m1 = RestaurantMembership(id=f"mem-{uuid.uuid4().hex[:6]}", restaurant_id=the_start.id, user_uid=owner_uid, user_email=owner_email, role="OWNER")
        m2 = RestaurantMembership(id=f"mem-{uuid.uuid4().hex[:6]}", restaurant_id=local_vender.id, user_uid=owner_uid, user_email=owner_email, role="OWNER")
        m3 = RestaurantMembership(id=f"mem-{uuid.uuid4().hex[:6]}", restaurant_id=max_kart.id, user_uid=owner_uid, user_email=owner_email, role="OWNER")
        db_session.add_all([m1, m2, m3])
        await db_session.commit()

        token = create_jwt({"uid": owner_uid, "email": owner_email, "role": "OWNER"})
        return owner_uid, owner_email, token, the_start, local_vender, max_kart

    async def test_public_slug_resolution_isolation(self, db_session):
        _, _, _, the_start, local_vender, max_kart = await self._setup_businesses(db_session)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. Resolve local vender
            r_vender = await ac.get(f"/api/v1/restaurants/public/resolve?slug={local_vender.slug}")
            assert r_vender.status_code == 200
            data_vender = r_vender.json()
            assert data_vender["id"] == local_vender.id
            assert data_vender["name"] == "local vender"
            assert data_vender["businessType"] == "RESTAURANT"

            # 2. Resolve MAX KART
            r_kart = await ac.get(f"/api/v1/restaurants/public/resolve?slug={max_kart.slug}")
            assert r_kart.status_code == 200
            data_kart = r_kart.json()
            assert data_kart["id"] == max_kart.id
            assert data_kart["name"] == "MAX KART"
            assert data_kart["businessType"] == "FOOD_CART"

            # 3. Resolve unknown slug -> must return 404, never fallback to THE START
            r_unknown = await ac.get("/api/v1/restaurants/public/resolve?slug=nonexistent-fake-slug")
            assert r_unknown.status_code == 404

    async def test_auth_me_restaurant_context_resolution(self, db_session):
        _, _, token, the_start, local_vender, max_kart = await self._setup_businesses(db_session)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # 1. When X-Restaurant-Id is local_vender, /auth/me returns local_vender
            res_vender = await ac.get(
                "/api/v1/auth/me",
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Restaurant-Id": local_vender.id,
                },
            )
            assert res_vender.status_code == 200
            auth_vender = res_vender.json()
            assert auth_vender["restaurant"] is not None
            assert auth_vender["restaurant"]["id"] == local_vender.id
            assert auth_vender["restaurant"]["name"] == "local vender"

            # 2. When X-Restaurant-Id is max_kart, /auth/me returns MAX KART
            res_kart = await ac.get(
                "/api/v1/auth/me",
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Restaurant-Id": max_kart.id,
                },
            )
            assert res_kart.status_code == 200
            auth_kart = res_kart.json()
            assert auth_kart["restaurant"] is not None
            assert auth_kart["restaurant"]["id"] == max_kart.id
            assert auth_kart["restaurant"]["name"] == "MAX KART"

            # 3. When X-Tenant-Slug is provided, /auth/me matches that slug
            res_slug = await ac.get(
                "/api/v1/auth/me",
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Tenant-Slug": local_vender.slug,
                },
            )
            assert res_slug.status_code == 200
            assert res_slug.json()["restaurant"]["id"] == local_vender.id

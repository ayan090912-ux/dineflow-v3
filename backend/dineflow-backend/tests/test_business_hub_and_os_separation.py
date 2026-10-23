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
class TestBusinessHubAndOSSeparation:
    """
    Comprehensive regression suite for DineFlow v3 Architectural Correction:
    Central Business Hub and 4 Independent Operating Systems:
    1. Independent Business Types (Restaurant, Bar, Small Cart, Wedding & Events).
    2. Zero Leakage: Restaurants, Bars, and Small Carts must NEVER contain 'weddings' module.
    3. The Leo Data Hygiene: Pure restaurant experience with no wedding modules.
    4. Business Hub Discovery API (GET /api/v1/restaurants/hub/businesses):
       Resolves correct osType and launchRoute for each business.
    5. Independent Business Creation across all 4 types.
    """

    async def _setup_hub_data(self, db_session):
        owner_uid = f"hub-owner-{uuid.uuid4().hex[:6]}"
        owner_email = f"owner-{uuid.uuid4().hex[:6]}@dineflow-hub.com"

        # 1. Independent Restaurant: The Leo
        the_leo_id = f"rest-leo-{uuid.uuid4().hex[:6]}"
        the_leo = Restaurant(
            id=the_leo_id,
            name="The Leo Dining Lounge",
            slug=f"the-leo-{uuid.uuid4().hex[:4]}",
            public_slug=f"the-leo-{uuid.uuid4().hex[:4]}",
            owner_uid=owner_uid,
            owner_email=owner_email,
            business_type="RESTAURANT",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_bar=True,
            has_tables=True,
            has_waiter=True,
            enabled_modules=["kitchen", "waiter", "inventory", "billing", "tables", "bar"],
        )

        # 2. Standalone Bar Business: Midnight Velvet Bar
        bar_id = f"rest-bar-{uuid.uuid4().hex[:6]}"
        standalone_bar = Restaurant(
            id=bar_id,
            name="Midnight Velvet Bar & Lounge",
            slug=f"midnight-velvet-{uuid.uuid4().hex[:4]}",
            public_slug=f"midnight-velvet-{uuid.uuid4().hex[:4]}",
            owner_uid=owner_uid,
            owner_email=owner_email,
            business_type="BAR",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=False,
            has_bar=True,
            has_tables=True,
            has_waiter=False,
            enabled_modules=["bar", "inventory", "billing", "tables"],
        )

        # 3. Standalone Small Cart Business: Rolling Taco Express
        cart_id = f"rest-cart-{uuid.uuid4().hex[:6]}"
        small_cart = Restaurant(
            id=cart_id,
            name="Rolling Taco Express",
            slug=f"rolling-taco-{uuid.uuid4().hex[:4]}",
            public_slug=f"rolling-taco-{uuid.uuid4().hex[:4]}",
            owner_uid=owner_uid,
            owner_email=owner_email,
            business_type="SMALL_CART",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_bar=False,
            has_tables=False,
            has_waiter=False,
            enabled_modules=["kitchen", "inventory", "billing"],
        )

        # 4. Standalone Wedding & Events Business: Royale Weddings & Galas
        wedding_id = f"rest-wed-{uuid.uuid4().hex[:6]}"
        wedding_biz = Restaurant(
            id=wedding_id,
            name="Royale Weddings & Galas",
            slug=f"royale-weddings-{uuid.uuid4().hex[:4]}",
            public_slug=f"royale-weddings-{uuid.uuid4().hex[:4]}",
            owner_uid=owner_uid,
            owner_email=owner_email,
            business_type="WEDDING_EVENT",
            lifecycle_status="LIVE",
            is_approved=True,
            status="OPEN",
            has_kitchen=True,
            has_bar=True,
            has_tables=True,
            has_waiter=True,
            enabled_modules=["weddings", "kitchen", "bar", "hookah", "tables", "billing"],
        )

        db_session.add_all([the_leo, standalone_bar, small_cart, wedding_biz])

        # Add memberships for owner
        for biz in [the_leo, standalone_bar, small_cart, wedding_biz]:
            membership = RestaurantMembership(
                id=f"m-{uuid.uuid4().hex[:8]}",
                user_uid=owner_uid,
                user_email=owner_email,
                restaurant_id=biz.id,
                role="OWNER",
                is_active=True,
            )
            db_session.add(membership)

        await db_session.commit()

        return {
            "owner_uid": owner_uid,
            "owner_email": owner_email,
            "the_leo": the_leo,
            "bar": standalone_bar,
            "cart": small_cart,
            "wedding": wedding_biz,
        }

    async def test_the_leo_is_pure_restaurant_without_wedding_modules(self, db_session):
        """Verify 'The Leo' is strictly a Restaurant OS and has zero wedding operational modules."""
        ctx = await self._setup_hub_data(db_session)
        the_leo = ctx["the_leo"]

        assert the_leo.business_type == "RESTAURANT"
        assert "weddings" not in the_leo.enabled_modules
        assert "kitchen" in the_leo.enabled_modules
        assert "tables" in the_leo.enabled_modules
        assert the_leo.has_tables is True

    async def test_business_hub_discovery_endpoint(self, db_session):
        """
        Verify GET /api/v1/restaurants/hub/businesses returns all 4 business types
        with accurate OS mapping and launch routes.
        """
        ctx = await self._setup_hub_data(db_session)
        token = create_jwt({
            "sub": ctx["owner_uid"],
            "uid": ctx["owner_uid"],
            "email": ctx["owner_email"],
            "role": "RESTAURANT_OWNER",
        })

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(
                "/api/v1/restaurants/hub/businesses",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        businesses = data if isinstance(data, list) else data.get("businesses", [])
        assert len(businesses) >= 4

        biz_by_id = {b["id"]: b for b in businesses}

        # Verify The Leo
        leo = biz_by_id.get(ctx["the_leo"].id)
        assert leo is not None
        assert leo["businessType"] == "RESTAURANT"
        assert leo["osType"] == "RESTAURANT_OS"
        assert leo["launchRoute"] == "/restaurant/dashboard"
        assert "weddings" not in leo["enabledModules"]

        # Verify Standalone Bar
        bar = biz_by_id.get(ctx["bar"].id)
        assert bar is not None
        assert bar["businessType"] == "BAR"
        assert bar["osType"] == "BAR_OS"
        assert bar["launchRoute"] == "/bar/dashboard"
        assert "weddings" not in bar["enabledModules"]

        # Verify Small Cart
        cart = biz_by_id.get(ctx["cart"].id)
        assert cart is not None
        assert cart["businessType"] == "SMALL_CART"
        assert cart["osType"] == "CART_OS"
        assert cart["launchRoute"] == "/cart/dashboard"
        assert "weddings" not in cart["enabledModules"]

        # Verify Wedding & Events
        wed = biz_by_id.get(ctx["wedding"].id)
        assert wed is not None
        assert wed["businessType"] == "WEDDING_EVENT"
        assert wed["osType"] == "WEDDINGS_OS"
        assert wed["launchRoute"] == "/weddings/dashboard"
        assert "weddings" in wed["enabledModules"]

    async def test_create_independent_businesses_for_each_type(self, db_session):
        """
        Verify an authorized user can independently provision each of the 4 business types
        with correct partitioned default modules.
        """
        owner_uid = f"creator-{uuid.uuid4().hex[:6]}"
        owner_email = f"creator-{uuid.uuid4().hex[:6]}@hub-test.com"
        token = create_jwt({
            "sub": owner_uid,
            "uid": owner_uid,
            "email": owner_email,
            "role": "RESTAURANT_OWNER",
        })

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Create Restaurant
            r_resp = await ac.post(
                "/api/v1/restaurants",
                json={
                    "name": "Bistro Central",
                    "businessType": "RESTAURANT",
                    "currency": "USD",
                    "address": "123 Main St",
                    "phone": "555-0101",
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            assert r_resp.status_code == 201, r_resp.text
            r_data = r_resp.json()
            assert r_data["business_type"] == "RESTAURANT"
            assert "weddings" not in r_data.get("enabled_modules", [])
            assert "kitchen" in r_data.get("enabled_modules", [])

            # 2. Create Bar
            b_resp = await ac.post(
                "/api/v1/restaurants",
                json={
                    "name": "Amber Lounge & Cocktails",
                    "businessType": "BAR",
                    "currency": "USD",
                    "address": "456 Speakeasy Way",
                    "phone": "555-0102",
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            assert b_resp.status_code == 201, b_resp.text
            b_data = b_resp.json()
            assert b_data["business_type"] == "BAR"
            assert "weddings" not in b_data.get("enabled_modules", [])
            assert "bar" in b_data.get("enabled_modules", [])

            # 3. Create Small Cart
            c_resp = await ac.post(
                "/api/v1/restaurants",
                json={
                    "name": "Street Crepe Cart",
                    "businessType": "SMALL_CART",
                    "currency": "USD",
                    "address": "Downtown Pier #4",
                    "phone": "555-0103",
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            assert c_resp.status_code == 201, c_resp.text
            c_data = c_resp.json()
            assert c_data["business_type"] == "SMALL_CART"
            assert "weddings" not in c_data.get("enabled_modules", [])
            assert "tables" not in c_data.get("enabled_modules", [])
            assert "kitchen" in c_data.get("enabled_modules", [])

            # 4. Create Wedding & Events
            w_resp = await ac.post(
                "/api/v1/restaurants",
                json={
                    "name": "Crystal Palace Events",
                    "businessType": "WEDDING_EVENT",
                    "currency": "USD",
                    "address": "777 Hilltop Estate",
                    "phone": "555-0104",
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            assert w_resp.status_code == 201, w_resp.text
            w_data = w_resp.json()
            assert w_data["business_type"] == "WEDDING_EVENT"
            assert "weddings" in w_data.get("enabled_modules", [])

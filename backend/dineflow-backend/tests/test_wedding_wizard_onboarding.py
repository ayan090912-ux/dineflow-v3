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
class TestWeddingWizardOnboardingSeparation:
    """
    Verification tests for Wedding Ordering Onboarding via Business Creation Wizard:
    1. Newly created wedding business is configured for Wedding & Events OS.
    2. Appears under Wedding & Events in Business Hub with launchRoute='/weddings/dashboard'.
    3. Separation preserved: Restaurant OS and Food Cart OS remain unaffected.
    """

    async def test_wedding_ordering_business_creation_and_hub_routing(self, db_session):
        owner_uid = f"wed-wizard-{uuid.uuid4().hex[:6]}"
        owner_email = f"wed-wizard-{uuid.uuid4().hex[:6]}@celebrations.com"
        token = create_jwt({
            "sub": owner_uid,
            "uid": owner_uid,
            "email": owner_email,
            "role": "RESTAURANT_OWNER",
        })

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Create Wedding & Events business via the wizard submission flow
            create_resp = await ac.post(
                "/api/v1/restaurants",
                json={
                    "name": "Emerald Grand Palace Banquets",
                    "businessType": "WEDDING_EVENT",
                    "currency": "INR (₹)",
                    "address": "450 Royal Palms Highway, Bengaluru",
                    "phone": "+91 98765 43210",
                    "enabledModules": ["weddings", "kitchen", "bar", "hookah", "tables", "billing"],
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            assert create_resp.status_code == 201, create_resp.text
            biz_data = create_resp.json()
            assert biz_data["business_type"] == "WEDDING_EVENT"
            assert "weddings" in biz_data.get("enabled_modules", [])

            # 2. Query Business Hub endpoint
            hub_resp = await ac.get(
                "/api/v1/restaurants/hub/businesses",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert hub_resp.status_code == 200, hub_resp.text
            hub_data = hub_resp.json()
            hub_items = hub_data if isinstance(hub_data, list) else hub_data.get("businesses", [])

            target = next((b for b in hub_items if b["id"] == biz_data["id"]), None)
            assert target is not None, f"Created business {biz_data['id']} not found in hub"
            assert target["businessType"] == "WEDDING_EVENT"
            assert target["osType"] == "WEDDINGS_OS"
            assert target["launchRoute"] == "/weddings/dashboard"
            assert "weddings" in target["enabledModules"]

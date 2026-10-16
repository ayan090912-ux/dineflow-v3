import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
import json
import base64

from app.main import app
from app.modules.restaurants.models import Restaurant
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.weddings.models import WeddingAccessRequest, WeddingWorkspace, WeddingEvent, EventTable
from app.core.config.settings import get_settings

settings = get_settings()


def create_fake_jwt(claims: dict) -> str:
    """Helper to encode an un-signed or HS256 base64 JSON payload for testing token decoding."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    signature = "fake_signature"
    return f"{header}.{payload}.{signature}"


def create_admin_jwt() -> str:
    return create_fake_jwt({
        "uid": "admin-ayan-uid",
        "email": "ayan090912@gmail.com",
        "email_verified": True,
        "admin": True,
        "role": "SUPER_ADMIN",
    })


def create_user_jwt(uid: str, email: str, role: str = "OWNER", restaurant_id: str = None) -> str:
    claims = {
        "uid": uid,
        "email": email,
        "email_verified": True,
        "role": role,
    }
    if restaurant_id:
        claims["restaurant_id"] = restaurant_id
    return create_fake_jwt(claims)


@pytest.mark.asyncio
class TestWeddingsLoginAndAutomation:
    async def _setup_empty_restaurant(self, db_session: AsyncSession) -> Restaurant:
        """Create a catering venue with 0 menu items to test SETUP_PENDING state."""
        rest_id = f"rest-cater-empty-{uuid.uuid4().hex[:6]}"
        slug = f"cater-empty-{uuid.uuid4().hex[:6]}"
        rest = Restaurant(
            id=rest_id,
            name="Barebones Banquet Venue",
            slug=slug,
            public_slug=slug,
            has_tables=True,
            has_kitchen=True,
            has_waiter=True,
            enabled_modules=["kitchen", "waiter", "billing", "tables", "weddings"],
            owner_uid=f"uid-{uuid.uuid4().hex[:6]}",
            owner_email=f"owner-{uuid.uuid4().hex[:6]}@cater.com",
            is_approved=True,
            lifecycle_status="LIVE",
            status="OPEN",
        )
        db_session.add(rest)
        await db_session.commit()
        return rest

    async def _setup_active_restaurant(self, db_session: AsyncSession) -> tuple[Restaurant, list[MenuItem]]:
        """Create a catering venue with active menu items."""
        rest_id = f"rest-cater-active-{uuid.uuid4().hex[:6]}"
        slug = f"cater-active-{uuid.uuid4().hex[:6]}"
        rest = Restaurant(
            id=rest_id,
            name="Grand Chateau Catering",
            slug=slug,
            public_slug=slug,
            has_tables=True,
            has_kitchen=True,
            has_waiter=True,
            enabled_modules=["kitchen", "waiter", "billing", "tables", "weddings"],
            owner_uid=f"uid-{uuid.uuid4().hex[:6]}",
            owner_email=f"owner-{uuid.uuid4().hex[:6]}@chateau.com",
            is_approved=True,
            lifecycle_status="LIVE",
            status="OPEN",
        )
        db_session.add(rest)
        await db_session.flush()

        cat = MenuCategory(
            id=f"cat-wed-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            name="Banquet Courses",
            is_enabled=True,
            sort_order=1,
        )
        db_session.add(cat)
        await db_session.flush()

        item = MenuItem(
            id=f"item-1-{uuid.uuid4().hex[:6]}",
            restaurant_id=rest.id,
            category_id=cat.id,
            name="Champagne Braised Beef",
            price=45.00,
            is_available=True,
            is_vegetarian=False,
        )
        db_session.add(item)
        await db_session.commit()
        return rest, [item]

    async def test_applicant_status_lifecycle_flow(self, db_session: AsyncSession):
        """Verify GET /api/v1/weddings/applicant-status for unauthenticated and authenticated lookups."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            organizer_email = f"elena.host.{uuid.uuid4().hex[:6]}@luxuryweddings.io"

            # 1. Lookup with non-existent email
            resp_none = await client.get(f"/api/v1/weddings/applicant-status?email={organizer_email}")
            assert resp_none.status_code == 200
            data_none = resp_none.json()
            assert data_none["lifecycleStatus"] == "NO_APPLICATION"
            assert data_none["applicantEmail"] == organizer_email.lower()

            # 2. Submit wedding request
            app_payload = {
                "applicantName": "Elena Rostova",
                "applicantEmail": organizer_email,
                "applicantPhone": "+1-415-555-9012",
                "weddingName": "Elena & Alexander Grand Gala",
                "eventType": "WEDDING",
                "eventDate": "2026-12-31",
                "startTime": "18:00",
                "endTime": "01:00",
                "venueName": "The St. Regis Crystal Ballroom",
                "venueCity": "San Francisco",
                "estimatedGuestCount": 220,
                "cateringNotes": "Luxury 5-course plated dinner with table QR ordering",
            }
            resp_submit = await client.post("/api/v1/weddings/requests", json=app_payload)
            assert resp_submit.status_code == 201
            req_id = resp_submit.json()["requestId"]

            # 3. Lookup pending request via query param
            resp_pending = await client.get(f"/api/v1/weddings/applicant-status?email={organizer_email}")
            assert resp_pending.status_code == 200
            data_pending = resp_pending.json()
            assert data_pending["lifecycleStatus"] in ("SUBMITTED", "PENDING", "UNDER_REVIEW")
            assert data_pending["requestId"] == req_id
            assert data_pending["weddingName"] == "Elena & Alexander Grand Gala"

            # 4. Lookup pending request via Bearer token (no query param)
            user_token = create_user_jwt(f"uid-{uuid.uuid4().hex[:6]}", organizer_email)
            resp_auth = await client.get(
                "/api/v1/weddings/applicant-status",
                headers={"Authorization": f"Bearer {user_token}"}
            )
            assert resp_auth.status_code == 200
            assert resp_auth.json()["requestId"] == req_id

            # 5. Approve the request via Platform Admin
            rest, _ = await self._setup_active_restaurant(db_session)
            admin_token = create_admin_jwt()
            approve_payload = {
                "assignedCateringRestaurantId": rest.id,
                "reviewNotes": "Approved with champagne service.",
            }
            resp_approve = await client.post(
                f"/api/v1/admin/wedding-requests/{req_id}/approve",
                headers={"Authorization": f"Bearer {admin_token}"},
                json=approve_payload,
            )
            assert resp_approve.status_code == 200
            approve_data = resp_approve.json()
            assert approve_data["status"] == "success"
            assert "emailDelivery" in approve_data
            workspace_id = approve_data["workspace"]["id"]

            # 6. Lookup after approval returns APPROVED with workspace details
            resp_approved = await client.get(f"/api/v1/weddings/applicant-status?email={organizer_email}")
            assert resp_approved.status_code == 200
            data_approved = resp_approved.json()
            assert data_approved["lifecycleStatus"] == "APPROVED"
            assert data_approved["workspaceId"] == workspace_id
            assert data_approved["cateringRestaurantName"] == rest.name

    async def test_batch_table_provisioning(self, db_session: AsyncSession):
        """Verify sequential, idempotent batch table generation endpoint."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            organizer_email = f"marcus.planner.{uuid.uuid4().hex[:6]}@events.com"
            organizer_uid = f"uid-marcus-{uuid.uuid4().hex[:6]}"
            user_token = create_user_jwt(organizer_uid, organizer_email)

            # Submit & approve workspace
            app_payload = {
                "applicantName": "Marcus Vance",
                "applicantEmail": organizer_email,
                "applicantPhone": "+1-555-888-2345",
                "weddingName": "Marcus & Chloe Wedding",
                "eventType": "WEDDING",
                "eventDate": "2026-10-25",
                "venueName": "Fairmont Terrace",
                "venueCity": "San Francisco",
                "estimatedGuestCount": 150,
            }
            resp_sub = await client.post("/api/v1/weddings/requests", json=app_payload)
            req_id = resp_sub.json()["requestId"]

            rest, _ = await self._setup_active_restaurant(db_session)
            admin_token = create_admin_jwt()
            resp_app = await client.post(
                f"/api/v1/admin/wedding-requests/{req_id}/approve",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"assignedCateringRestaurantId": rest.id},
            )
            workspace_id = resp_app.json()["workspace"]["id"]

            # Batch 1: Provision 5 VIP Tables (auto-skips existing 01-04 to start at 05)
            batch1_payload = {
                "count": 5,
                "startNumber": 1,
                "capacity": 10,
                "prefix": "VIP Table",
            }
            resp_b1 = await client.post(
                f"/api/v1/weddings/workspaces/{workspace_id}/tables/batch",
                headers={"Authorization": f"Bearer {user_token}"},
                json=batch1_payload,
            )
            assert resp_b1.status_code == 201, resp_b1.text
            data_b1 = resp_b1.json()
            assert data_b1["createdCount"] == 5
            assert len(data_b1["tables"]) == 5
            assert data_b1["tables"][0]["tableNumber"] == "05"
            assert data_b1["tables"][0]["label"] == "VIP Table 05"
            assert data_b1["tables"][0]["capacity"] == 10
            assert "qrCodeUrl" in data_b1["tables"][0]

            # Batch 2: Provision 3 Standard Tables starting at 10 (10-12)
            batch2_payload = {
                "count": 3,
                "startNumber": 10,
                "capacity": 8,
                "prefix": "Table",
            }
            resp_b2 = await client.post(
                f"/api/v1/weddings/workspaces/{workspace_id}/tables/batch",
                headers={"Authorization": f"Bearer {user_token}"},
                json=batch2_payload,
            )
            assert resp_b2.status_code == 201
            assert resp_b2.json()["createdCount"] == 3

            # Fetch workspace detail: 4 default tables + 5 batch1 + 3 batch2 = 12 tables
            resp_detail = await client.get(
                f"/api/v1/weddings/workspaces/{workspace_id}",
                headers={"Authorization": f"Bearer {user_token}"},
            )
            assert resp_detail.status_code == 200
            tables = resp_detail.json()["tables"]
            assert len(tables) == 12

            # Unauthorized user receives 403 Forbidden
            stranger_token = create_user_jwt(f"uid-{uuid.uuid4().hex[:6]}", "stranger@other.com")
            resp_unauth = await client.post(
                f"/api/v1/weddings/workspaces/{workspace_id}/tables/batch",
                headers={"Authorization": f"Bearer {stranger_token}"},
                json=batch1_payload,
            )
            assert resp_unauth.status_code == 403

    async def test_setup_pending_state_on_empty_menu(self, db_session: AsyncSession):
        """When an assigned catering partner has 0 menu items, workspace is marked SETUP_PENDING."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            empty_rest = await self._setup_empty_restaurant(db_session)
            organizer_email = f"sophia.{uuid.uuid4().hex[:6]}@banquets.com"

            resp_sub = await client.post(
                "/api/v1/weddings/requests",
                json={
                    "applicantName": "Sophia Taylor",
                    "applicantEmail": organizer_email,
                    "applicantPhone": "+1-555-333-4444",
                    "weddingName": "Sophia & David Autumn Gathering",
                    "eventType": "WEDDING",
                    "eventDate": "2026-11-15",
                    "venueName": "The Glasshouse",
                    "venueCity": "San Jose",
                    "estimatedGuestCount": 100,
                }
            )
            req_id = resp_sub.json()["requestId"]

            admin_token = create_admin_jwt()
            resp_app = await client.post(
                f"/api/v1/admin/wedding-requests/{req_id}/approve",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"assignedCateringRestaurantId": empty_rest.id},
            )
            assert resp_app.status_code == 200
            app_json = resp_app.json()
            # Workspace status is SETUP_PENDING because kitchen has 0 active menu items
            assert app_json["workspace"]["status"] == "SETUP_PENDING"

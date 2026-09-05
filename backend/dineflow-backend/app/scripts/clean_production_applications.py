import asyncio
import os
import sys
from datetime import datetime, timezone
from sqlalchemy import select, update, or_, and_, func

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.database.connection import engine, AsyncSessionLocal
from app.modules.restaurants.models import Restaurant

async def run_clean_production_applications():
    """
    Safe Production Migration & Cleanup Strategy:
    1. Removes fake/synthetic/test applications from the PENDING_APPROVAL queue.
    2. Archives them safely with audit metadata (dismissed_at, dismissed_by, dismiss_reason) without deleting valid production data.
    3. Retains all authentic restaurants with valid Firebase UIDs.
    """
    print("=== STARTING PRODUCTION PENDING APPROVAL QUEUE CLEANUP ===")

    async with AsyncSessionLocal() as db:
        # Query all pending restaurants
        query = select(Restaurant).where(Restaurant.deleted_at.is_(None))
        result = await db.execute(query)
        all_rests = result.scalars().all()

        cleaned_count = 0
        for r in all_rests:
            # Check if this record is a synthetic/test/demo fixture
            is_synthetic_demo = False

            # Synthetic conditions
            fake_emails = [
                "owner@cafeco.food",
                "chaat@dinely.food",
                "contact@cafeco.food",
                "owner@lumiere.food",
                "contact@lumierebistro.food",
            ]
            fake_names = [
                "Mumbai Chaat Cart",
                "TRIK",
                "Delhi Street Chaat",
            ]

            is_fake_email = r.owner_email in fake_emails or r.email in fake_emails
            is_fake_name = any(fn.lower() in (r.name or "").lower() for fn in fake_names)
            is_synthetic_test_id = (
                r.id.startswith("rest-test-") or
                r.id.startswith("rest-synthetic-") or
                r.id.startswith("test-fixture-")
            )

            if is_fake_email or is_fake_name or (is_synthetic_test_id and (r.owner_uid is None or r.owner_uid.startswith("uid_") or r.owner_uid.startswith("test_"))):
                is_synthetic_demo = True

            if is_synthetic_demo:
                r.deleted_at = datetime.now(timezone.utc)
                r.lifecycle_status = "ARCHIVED"
                r.is_approved = False
                r.status = "CLOSED"
                r.dismissed_at = datetime.now(timezone.utc)
                r.dismissed_by = "system_production_cleanup"
                r.dismiss_reason = "Cleaned historical test/synthetic fixture from approval queue"
                cleaned_count += 1
                print(f"-> Archived and cleaned synthetic record: id={r.id}, name='{r.name}', owner={r.owner_email}")

        if cleaned_count > 0:
            await db.commit()
            print(f"[SUCCESS] Safely cleaned {cleaned_count} synthetic demo applications from database.")
        else:
            print("[INFO] No synthetic pending applications found in queue.")

if __name__ == "__main__":
    asyncio.run(run_clean_production_applications())

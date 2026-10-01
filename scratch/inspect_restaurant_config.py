import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, r"c:\dineflow v3\v3\backend\dineflow-backend")

from sqlalchemy import select
from app.core.database.connection import AsyncSessionLocal
from app.modules.restaurants.models import Restaurant

async def main():
    async with AsyncSessionLocal() as db:
        stmt = select(Restaurant)
        result = await db.execute(stmt)
        rests = result.scalars().all()
        print(f"Found {len(rests)} total restaurants in DB:")
        for r in rests:
            print(f"ID: {r.id}")
            print(f"Name: {r.name}")
            print(f"Slug: {r.slug}, Public Slug: {r.public_slug}")
            print(f"Business Type: {r.business_type}")
            print(f"has_kitchen: {r.has_kitchen}")
            print(f"has_bar: {r.has_bar}")
            print(f"has_waiter: {r.has_waiter}")
            print(f"has_inventory: {r.has_inventory}")
            print(f"has_billing: {r.has_billing}")
            print(f"has_tables: {r.has_tables}")
            print(f"enabled_modules: {r.enabled_modules}")
            print(f"owner_email: {r.owner_email}")
            print("-" * 50)

if __name__ == "__main__":
    asyncio.run(main())

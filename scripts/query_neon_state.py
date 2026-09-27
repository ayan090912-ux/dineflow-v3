import asyncio
import asyncpg
import json
import os

CONN_STR = os.environ.get("DATABASE_URL_SYNC") or os.environ.get("DATABASE_URL")
if not CONN_STR:
    raise ValueError("DATABASE_URL or DATABASE_URL_SYNC environment variable is required.")
if CONN_STR.startswith("postgresql+asyncpg://"):
    CONN_STR = CONN_STR.replace("postgresql+asyncpg://", "postgresql://")
async def main():
    conn = await asyncpg.connect(CONN_STR)
    print("--- Searching for restaurants matching 'fly' ---")
    rows = await conn.fetch("SELECT id, name, slug, public_slug, lifecycle_status, is_approved, owner_uid, email FROM restaurants WHERE slug ILIKE '%fly%' OR public_slug ILIKE '%fly%' OR name ILIKE '%fly%';")
    for r in rows:
        print("Restaurant:", dict(r))
        doms = await conn.fetch("SELECT id, hostname, is_primary, is_verified FROM restaurant_domains WHERE restaurant_id = $1;", r['id'])
        print("Domains:", [dict(d) for d in doms])
        tbls = await conn.fetch("SELECT id, table_number, qr_code_url, status FROM tables WHERE restaurant_id = $1;", r['id'])
        print(f"Tables ({len(tbls)}):", [dict(t) for t in tbls])
        cats = await conn.fetch("SELECT id, name FROM menu_categories WHERE restaurant_id = $1;", r['id'])
        print(f"Categories ({len(cats)}):", [dict(c) for c in cats])
        items = await conn.fetch("SELECT id, name, price, category_id, is_available FROM menu_items WHERE restaurant_id = $1;", r['id'])
        print(f"Items ({len(items)}):", [dict(i) for i in items[:5]])

    print("\n--- Listing all restaurants in DB ---")
    all_rests = await conn.fetch("SELECT id, name, slug, public_slug, lifecycle_status FROM restaurants ORDER BY created_at DESC LIMIT 15;")
    for r in all_rests:
        print(" ", dict(r))
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())

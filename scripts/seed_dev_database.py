import asyncio
import os
import sys

# Ensure backend app is in python path
backend_path = os.path.join(os.path.dirname(__file__), "..", "backend", "dineflow-backend")
sys.path.insert(0, os.path.abspath(backend_path))

from app.core.database.connection import AsyncSessionLocal, Base, engine
from app.modules.restaurants.models import Restaurant, RestaurantDomain, RestaurantMembership
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.tables.models import Table
from app.modules.auth.models import PlatformAdmin
from app.core.security.password import hash_password
from sqlalchemy import select

async def seed():
    # Strict Production Safety Guard: Strictly enforce local SQLite database
    db_url_str = str(engine.url)
    if "sqlite" not in db_url_str:
        print(f"[FATAL SAFETY VIOLATION] seed_dev_database.py attempted against non-SQLite database: {db_url_str}", file=sys.stderr)
        raise RuntimeError("FATAL: seed_dev_database.py is strictly restricted to local SQLite development!")

    # Ensure tables are created
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        rest_id = "rest-grand-bistro"
        rest_slug = "the-grand-bistro"

        # 1. Restaurant
        res = await session.execute(select(Restaurant).where(Restaurant.id == rest_id))
        rest = res.scalar_one_or_none()
        if not rest:
            rest = Restaurant(
                id=rest_id,
                name="The Grand Bistro",
                slug=rest_slug,
                public_slug=rest_slug,
                owner_uid="dev-owner-uid-001",
                owner_email="owner@dinely.food",
                cuisine="Modern European & Bar",
                business_type="RESTAURANT",
                address="100 Culinary Blvd, Suite 4",
                phone="+1 555-019-2834",
                email="contact@grandbistro.food",
                currency="USD ($)",
                tax_percentage=10.0,
                lifecycle_status="LIVE",
                is_approved=True,
                has_tables=True,
                has_kitchen=True,
                has_bar=True
            )
            session.add(rest)
            await session.flush()
            print("Created restaurant:", rest.name)
        else:
            print("Restaurant already exists:", rest.name)

        # 2. Domains
        domains_to_add = [
            (f"dom-{rest_id}-local", f"{rest_slug}.localhost"),
            (f"dom-{rest_id}-local3007", f"{rest_slug}.localhost:3007"),
            (f"dom-{rest_id}-food", f"{rest_slug}.dinely.food"),
        ]
        for dom_id, hostname in domains_to_add:
            d_res = await session.execute(select(RestaurantDomain).where(RestaurantDomain.hostname == hostname))
            if not d_res.scalar_one_or_none():
                dom = RestaurantDomain(
                    id=dom_id,
                    restaurant_id=rest_id,
                    hostname=hostname,
                    domain=hostname,
                    domain_type="SUBDOMAIN",
                    verification_status="VERIFIED",
                    is_primary=True,
                    is_verified=True
                )
                session.add(dom)
        await session.flush()
        print("Domains verified")

        # 3. Tables
        for i in range(1, 5):
            t_num = f"Table {i:02d}"
            t_id = f"tbl-{rest_id}-{i:02d}"
            t_res = await session.execute(select(Table).where(Table.id == t_id))
            if not t_res.scalar_one_or_none():
                t = Table(
                    id=t_id,
                    restaurant_id=rest_id,
                    table_number=t_num,
                    section="Main Dining",
                    capacity=4,
                    status="AVAILABLE",
                    qr_code_url=f"http://localhost:3007/customer?table={t_num}&tableId={t_id}"
                )
                session.add(t)
        await session.flush()
        print("Tables verified")

        # 4. Categories & Menu Items (KITCHEN vs BAR station routing)
        cat_kitchen_id = f"cat-{rest_id}-kitchen"
        cat_bar_id = f"cat-{rest_id}-bar"

        c_k_res = await session.execute(select(MenuCategory).where(MenuCategory.id == cat_kitchen_id))
        if not c_k_res.scalar_one_or_none():
            cat_k = MenuCategory(
                id=cat_kitchen_id,
                restaurant_id=rest_id,
                name="Kitchen Specialties",
                sort_order=1,
                is_enabled=True
            )
            session.add(cat_k)

        c_b_res = await session.execute(select(MenuCategory).where(MenuCategory.id == cat_bar_id))
        if not c_b_res.scalar_one_or_none():
            cat_b = MenuCategory(
                id=cat_bar_id,
                restaurant_id=rest_id,
                name="Bar & Cocktails",
                sort_order=2,
                is_enabled=True
            )
            session.add(cat_b)
        await session.flush()

        items = [
            (f"item-{rest_id}-pizza", cat_kitchen_id, "Truffle Mushroom Pizza", 18.50, "KITCHEN", "VEG", True),
            (f"item-{rest_id}-pasta", cat_kitchen_id, "Handmade Tagliatelle", 16.00, "KITCHEN", "NON_VEG", False),
            (f"item-{rest_id}-mojito", cat_bar_id, "Smoked Mint Mojito", 10.50, "BAR", "VEG", True),
            (f"item-{rest_id}-wine", cat_bar_id, "Reserve Cabernet Sauvignon", 14.00, "BAR", "VEG", True),
        ]
        for it_id, c_id, it_name, price, dest, diet, is_veg in items:
            it_res = await session.execute(select(MenuItem).where(MenuItem.id == it_id))
            if not it_res.scalar_one_or_none():
                it = MenuItem(
                    id=it_id,
                    restaurant_id=rest_id,
                    category_id=c_id,
                    name=it_name,
                    price=price,
                    target_destination=dest,
                    dietary_type=diet,
                    is_vegetarian=is_veg,
                    is_available=True
                )
                session.add(it)
        await session.flush()
        print("Menu items verified with station destination routing (KITCHEN / BAR)")

        # 5. Staff Accounts (with password 'dinely123')
        pwd_hash = hash_password("dinely123")
        staff_list = [
            ("mem-waiter1", "waiter1", "Alex Waiter", "waiter1@grandbistro.food", "WAITER", "WAITER-01"),
            ("mem-kitchen1", "kitchen1", "Chef Marco", "kitchen1@grandbistro.food", "KITCHEN", "KITCHEN-01"),
            ("mem-bar1", "bar1", "Sam Bartender", "bar1@grandbistro.food", "BAR", "BAR-01"),
            ("mem-inventory1", "inventory1", "Morgan Inventory", "inventory1@grandbistro.food", "INVENTORY", "INV-01"),
        ]
        for m_id, username, full_name, email, role, terminal in staff_list:
            m_res = await session.execute(select(RestaurantMembership).where(RestaurantMembership.id == m_id))
            if not m_res.scalar_one_or_none():
                mem = RestaurantMembership(
                    id=m_id,
                    restaurant_id=rest_id,
                    user_uid=f"uid-{username}",
                    user_email=email,
                    username=username,
                    full_name=full_name,
                    role=role,
                    assigned_terminal=terminal,
                    password_hash=pwd_hash,
                    is_active=True
                )
                session.add(mem)
        await session.flush()
        print("Staff accounts seeded: waiter1, kitchen1, bar1, inventory1 (password: dinely123)")

        # 6. Platform Admin
        adm_email = "ayan090912@gmail.com"
        a_res = await session.execute(select(PlatformAdmin).where(PlatformAdmin.email == adm_email))
        if not a_res.scalar_one_or_none():
            import uuid
            adm = PlatformAdmin(
                id=uuid.uuid4(),
                email=adm_email,
                password_hash=pwd_hash,
                full_name="Ayaan Admin",
                is_active=True
            )
            session.add(adm)
        await session.commit()
        print("Platform Admin verified:", adm_email)
        print("=== DEV SEEDING COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    asyncio.run(seed())

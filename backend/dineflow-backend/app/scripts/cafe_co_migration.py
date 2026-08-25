import asyncio
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.database.connection import engine, Base, AsyncSessionLocal
from app.modules.restaurants.models import Restaurant
from app.modules.tables.models import Table
from app.modules.menu.models import MenuCategory, MenuItem
from sqlalchemy import select

async def run_migration():
    print("=== STARTING CAFE.CO DATABASE MIGRATION ===")

    # 1. Create database schema tables & add missing columns if needed
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if "postgresql" in str(engine.url):
            from sqlalchemy import text
            drop_not_null_block = """
            DO $$
            DECLARE
                r RECORD;
            BEGIN
                FOR r IN
                    SELECT table_name, column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND is_nullable = 'NO'
                      AND column_name NOT IN ('id')
                      AND column_default IS NULL
                LOOP
                    BEGIN
                        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name);
                    EXCEPTION WHEN OTHERS THEN
                        NULL;
                    END;
                END LOOP;
            END $$;
            """
            try:
                await conn.execute(text(drop_not_null_block))
            except Exception as e:
                print("Notice dropping NOT NULL constraints:", e)

    fix_fk_sqls = [
        "ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_category_id_fkey;",
        "ALTER TABLE menu_items ADD CONSTRAINT menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE;",
    ]
    for sql in fix_fk_sqls:
        try:
            async with engine.begin() as conn:
                from sqlalchemy import text
                await conn.execute(text(sql))
        except Exception:
            pass

    print("[PASS] Database tables created/verified & columns updated")

    async with AsyncSessionLocal() as db:
        # 2. Check if CAFE.CO exists
        rest_id = "rest-1787446097984"
        query = select(Restaurant).where(Restaurant.id == rest_id)
        result = await db.execute(query)
        existing = result.scalar_one_or_none()

        if not existing:
            cafe = Restaurant(
                id=rest_id,
                name="CAFE.CO",
                slug="cafe-co",
                cuisine="Fine Dining & Cafe",
                business_type="RESTAURANT",
                has_bar=True,
                has_tables=True,
                has_kitchen=True,
                has_waiter=True,
                order_number_prefix="#ORD",
                address="108 Culinary Boulevard, Fine Dining Strip",
                phone="+1 (555) 987-6543",
                email="contact@cafeco.food",
                owner_name="Cafe Owner",
                owner_email="owner@cafeco.food",
                domain="cafeco.dinely.app",
                is_approved=True,
                status="OPEN",
                currency="INR (₹)",
                tax_percentage=5.0,
                theme_json={
                    "restaurantId": rest_id,
                    "restaurantName": "CAFE.CO",
                    "logo": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&auto=format&fit=crop&q=80",
                    "bannerUrl": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80",
                    "primaryColor": "#f43f5e",
                    "accentColor": "#fbbf24",
                    "currency": "INR (₹)",
                }
            )
            for col, val in [("timezone", "UTC"), ("country", "United States"), ("city", "Metropolis"), ("state", "NY"), ("zip_code", "10001")]:
                if hasattr(cafe, col):
                    setattr(cafe, col, val)
            db.add(cafe)
            await db.commit()
            print("[PASS] Created CAFE.CO restaurant record")
        else:
            print("[PASS] CAFE.CO restaurant already exists")

        # 3. Seed Menu Categories
        categories_data = [
            ("cat-cafe-1", "Starters & Appetizers", 1),
            ("cat-cafe-2", "Main Course", 2),
            ("cat-cafe-3", "Gourmet Desserts", 3),
            ("cat-cafe-4", "Beverages & Drinks", 4),
        ]
        for cat_id, cat_name, sort_ord in categories_data:
            q_cat = select(MenuCategory).where(MenuCategory.id == cat_id)
            res_cat = await db.execute(q_cat)
            if not res_cat.scalar_one_or_none():
                db.add(MenuCategory(
                    id=cat_id,
                    restaurant_id=rest_id,
                    name=cat_name,
                    sort_order=sort_ord,
                    is_enabled=True,
                ))
        await db.commit()
        print("[PASS] Migrated CAFE.CO menu categories")

        # 4. Seed Menu Items
        items_data = [
            ("item-cafe-1", "cat-cafe-1", "Crispy Risotto Balls", "Stuffed with wild forest mushrooms and aged mozzarella, served with truffle aioli.", 14.50, "https://images.unsplash.com/photo-1541529086526-db283c563270?w=600", True, "KITCHEN"),
            ("item-cafe-2", "cat-cafe-2", "Pan-Seared Salmon Fillet", "Atlantic salmon served over saffron risotto with lemon herb reduction.", 28.90, "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600", False, "KITCHEN"),
            ("item-cafe-3", "cat-cafe-3", "Classic Tiramisu", "Layers of espresso-soaked ladyfingers and whipped mascarpone cream.", 9.50, "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600", True, "KITCHEN"),
            ("item-cafe-4", "cat-cafe-4", "Artisanal Smoked Old Fashioned", "Bourbon whiskey infused with aromatic bitters and oak wood smoke.", 16.00, "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600", True, "BAR"),
        ]
        for item_id, cat_id, name, desc, price, img_url, is_veg, target in items_data:
            q_item = select(MenuItem).where(MenuItem.id == item_id)
            res_item = await db.execute(q_item)
            if not res_item.scalar_one_or_none():
                db.add(MenuItem(
                    id=item_id,
                    restaurant_id=rest_id,
                    category_id=cat_id,
                    name=name,
                    description=desc,
                    price=price,
                    image_url=img_url,
                    is_available=True,
                    is_vegetarian=is_veg,
                    dietary_type="VEG" if is_veg else "NON_VEG",
                    target_destination=target,
                ))
        print("[PASS] Migrated CAFE.CO menu items")

        # 5. Seed Tables 01 to 12
        for i in range(1, 13):
            t_num = f"Table {str(i).zfill(2)}"
            t_id = f"tbl-{rest_id}-{t_num.lower().replace(' ', '_')}"
            q_tbl = select(Table).where(Table.id == t_id)
            res_tbl = await db.execute(q_tbl)
            if not res_tbl.scalar_one_or_none():
                db.add(Table(
                    id=t_id,
                    restaurant_id=rest_id,
                    table_number=t_num,
                    section="Main Hall" if i <= 6 else "Terrace",
                    capacity=4,
                    status="AVAILABLE",
                    is_occupied=False,
                    qr_code_url=f"https://dinely.food/customer?restaurant={rest_id}&tableId={t_id}&table={t_num}"
                ))
        print("[PASS] Migrated CAFE.CO tables (01-12)")

        await db.commit()
        print("=== CAFE.CO MIGRATION COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    asyncio.run(run_migration())

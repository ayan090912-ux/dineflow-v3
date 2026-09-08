import asyncio
from app.core.database.connection import AsyncSessionLocal, Base
from sqlalchemy import text

# Import all models to register them on Base.metadata
from app.modules.restaurants.models import Restaurant, RestaurantLifecycleLog
from app.modules.tables.models import Table, TableSession
from app.modules.orders.models import Order, OrderItem
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.taxes.models import Tax, TaxCategory

async def main():
    async with AsyncSessionLocal() as db:
        print("=== AUDITING NEON DATABASE SCHEMA AGAINST SQLALCHEMY MODELS ===")
        
        # 1. Check existing tables in public schema
        res = await db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """))
        existing_tables = set(r[0] for r in res.fetchall())
        
        expected_tables = set(Base.metadata.tables.keys())
        missing_tables = expected_tables - existing_tables
        print(f"Missing tables: {missing_tables}")

        # 2. Check each expected table's columns
        for table_name in sorted(expected_tables):
            if table_name not in existing_tables:
                continue
            res = await db.execute(text(f"""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '{table_name}';
            """))
            existing_cols = {r[0]: r[1] for r in res.fetchall()}
            model_cols = Base.metadata.tables[table_name].columns
            missing_cols = [c.name for c in model_cols if c.name not in existing_cols]
            if missing_cols:
                print(f"Table '{table_name}' is MISSING columns: {missing_cols}")
            else:
                print(f"Table '{table_name}': OK (all {len(model_cols)} columns present)")

if __name__ == "__main__":
    asyncio.run(main())

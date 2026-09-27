import asyncio, sys, os
sys.path.insert(0, os.path.abspath('.'))
from app.core.database.connection import get_db_session
from sqlalchemy import text

async def migrate_column_lengths():
    async with get_db_session() as s:
        alters = [
            "ALTER TABLE orders ALTER COLUMN table_id TYPE VARCHAR(255);",
            "ALTER TABLE orders ALTER COLUMN session_id TYPE VARCHAR(255);",
            "ALTER TABLE orders ALTER COLUMN restaurant_id TYPE VARCHAR(255);",
            "ALTER TABLE order_items ALTER COLUMN menu_item_id TYPE VARCHAR(255);",
        ]
        for sql in alters:
            try:
                print(f"Executing: {sql}")
                await s.execute(text(sql))
                print("  SUCCESS")
            except Exception as e:
                print(f"  ERROR: {e}")

if __name__ == '__main__':
    asyncio.run(migrate_column_lengths())

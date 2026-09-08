import asyncio
from app.core.database.connection import AsyncSessionLocal
from sqlalchemy import text

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """))
        tables = [r[0] for r in res.fetchall()]
        print("Tables in public schema:")
        for t in tables:
            print(f"  {t}")

if __name__ == "__main__":
    asyncio.run(main())

import asyncio
import os
import sys

backend_dir = r"c:\dineflow v3\v3\backend\dineflow-backend"
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from sqlalchemy import text
from app.core.database.connection import engine

async def list_tables():
    async with engine.connect() as conn:
        res = await conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        """))
        print("Existing tables in public schema:")
        for r in res:
            print(f"  - {r[0]}")

if __name__ == "__main__":
    asyncio.run(list_tables())

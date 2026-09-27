import asyncio
import os
import sys

backend_dir = r"c:\dineflow v3\v3\backend\dineflow-backend"
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from app.core.database.connection import engine, Base
from app.main import ensure_db_schema_columns

async def sync():
    print("Executing database schema sync...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await ensure_db_schema_columns(conn)
    print("Schema sync complete!")

if __name__ == "__main__":
    asyncio.run(sync())

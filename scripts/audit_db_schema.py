import asyncio
import os
import sys

backend_dir = r"c:\dineflow v3\v3\backend\dineflow-backend"
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from sqlalchemy import text
from app.core.database.connection import engine

async def audit_tables():
    async with engine.connect() as conn:
        print("==================================================")
        print("DATABASE SCHEMA AUDIT: POSTGRESQL")
        print("==================================================")
        
        tables = ["restaurants", "restaurant_domains", "restaurant_memberships"]
        for table in tables:
            print(f"\n--- TABLE: {table} ---")
            # Columns
            cols = await conn.execute(text(f"""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = '{table}'
                ORDER BY ordinal_position;
            """))
            print("Columns:")
            for col in cols:
                print(f"  - {col[0]}: {col[1]} (Nullable: {col[2]}, Default: {col[3]})")
                
            # Constraints
            constraints = await conn.execute(text(f"""
                SELECT conname, contype, pg_get_constraintdef(c.oid)
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE conrelid = '{table}'::regclass;
            """))
            print("Constraints:")
            for c in constraints:
                print(f"  - {c[0]} ({c[1]}): {c[2]}")
                
            # Indexes
            indexes = await conn.execute(text(f"""
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE tablename = '{table}';
            """))
            print("Indexes:")
            for idx in indexes:
                print(f"  - {idx[0]}: {idx[1]}")

if __name__ == "__main__":
    asyncio.run(audit_tables())

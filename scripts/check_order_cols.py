import asyncio, sys, os
sys.path.insert(0, os.path.abspath('.'))
from app.core.database.connection import get_db_session
from sqlalchemy import text

async def check():
    async with get_db_session() as s:
        res = await s.execute(text("""
            SELECT column_name, data_type, character_maximum_length 
            FROM information_schema.columns 
            WHERE table_name = 'tables'
            ORDER BY ordinal_position
        """))
        for row in res.fetchall():
            print(row)

if __name__ == '__main__':
    asyncio.run(check())

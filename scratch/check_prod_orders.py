import sys
sys.path.insert(0, 'scratch')
from check_ec2_health import run_ssm

commands = [
    "docker exec dinely_backend python3 -c \""
    "import asyncio\n"
    "from app.core.database.connection import get_db_session\n"
    "from app.modules.orders.models import Order\n"
    "from sqlalchemy import select\n"
    "async def check():\n"
    "    async with get_db_session() as db:\n"
    "        ords = (await db.execute(select(Order).where(Order.restaurant_id == 'rest-1790594544526-396022'))).scalars().all()\n"
    "        print('PRODUCTION_ORDERS_COUNT:', len(ords))\n"
    "        for o in ords[-5:]:\n"
    "            print('ORDER:', o.id, o.status, o.total_amount, o.table_number, o.created_at)\n"
    "asyncio.run(check())\n"
    "\""
]

run_ssm(commands)

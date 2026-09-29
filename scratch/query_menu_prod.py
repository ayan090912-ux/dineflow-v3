from check_ec2_health import run_ssm

commands = [
    "docker exec dinely_backend python3 -c \""
    "import asyncio\n"
    "from app.core.database.connection import get_db_session\n"
    "from app.modules.menu.models import MenuCategory, MenuItem\n"
    "from sqlalchemy import select\n"
    "async def check():\n"
    "    async with get_db_session() as db:\n"
    "        cats = (await db.execute(select(MenuCategory).where(MenuCategory.restaurant_id == 'rest-1790594544526-396022'))).scalars().all()\n"
    "        print('CATEGORIES (' + str(len(cats)) + '):')\n"
    "        for c in cats:\n"
    "            print('  CAT:', c.id, c.name, getattr(c, 'sort_order', 'N/A'))\n"
    "        items = (await db.execute(select(MenuItem).where(MenuItem.restaurant_id == 'rest-1790594544526-396022'))).scalars().all()\n"
    "        print('ITEMS (' + str(len(items)) + '):')\n"
    "        for it in items:\n"
    "            print('  ITEM:', it.id, it.name, it.price, it.category_id, it.station)\n"
    "asyncio.run(check())\n"
    "\""
]

run_ssm(commands)

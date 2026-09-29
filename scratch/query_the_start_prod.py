from check_ec2_health import run_ssm

commands = [
    "docker exec dinely_backend python3 -c \""
    "import asyncio\n"
    "from app.core.database.connection import get_db_session\n"
    "from app.modules.restaurants.models import Restaurant, RestaurantMembership\n"
    "from sqlalchemy import select\n"
    "async def check():\n"
    "    async with get_db_session() as db:\n"
    "        r = (await db.execute(select(Restaurant).where(Restaurant.slug == 'the-start'))).scalar_one_or_none()\n"
    "        if r:\n"
    "            print('FOUND_REST:', r.id, r.name, r.owner_email, r.owner_uid)\n"
    "        else:\n"
    "            print('NOT_FOUND')\n"
    "        m = (await db.execute(select(RestaurantMembership).where(RestaurantMembership.restaurant_id == (r.id if r else '')))).scalars().all()\n"
    "        for x in m:\n"
    "            print('MEMBERSHIP:', x.user_email, x.user_uid, x.role)\n"
    "asyncio.run(check())\n"
    "\""
]

run_ssm(commands)

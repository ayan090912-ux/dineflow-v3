import sys
sys.path.insert(0, 'scratch')
from check_ec2_health import run_ssm

commands = [
    "docker exec dinely_backend python3 -c \""
    "import asyncio, httpx\n"
    "from app.main import app\n"
    "from httpx import AsyncClient, ASGITransport\n"
    "async def test_stations():\n"
    "    transport = ASGITransport(app=app)\n"
    "    async with AsyncClient(transport=transport, base_url='http://the-start.dinely.food') as client:\n"
    "        headers = {\n"
    "            'X-Staff-Restaurant-Id': 'rest-1790594544526-396022',\n"
    "            'X-Staff-Role': 'BAR',\n"
    "            'Host': 'the-start.dinely.food'\n"
    "        }\n"
    "        res = await client.get('/api/v1/orders/restaurant/rest-1790594544526-396022', headers=headers)\n"
    "        print('BAR_QUEUE_STATUS:', res.status_code)\n"
    "        ords = res.json()\n"
    "        print('BAR_ORDERS_FOUND:', len(ords))\n"
    "        if ords:\n"
    "            latest_id = ords[0]['id']\n"
    "            res_stat = await client.patch(f'/api/v1/orders/{latest_id}/status', json={'status': 'CONFIRMED'}, headers=headers)\n"
    "            print('UPDATE_STATUS:', res_stat.status_code)\n"
    "asyncio.run(test_stations())\n"
    "\""
]

run_ssm(commands)

from check_ec2_health import run_ssm

commands = [
    "docker exec dinely_backend python3 -c \""
    "import asyncio, httpx\n"
    "from app.main import app\n"
    "from httpx import AsyncClient, ASGITransport\n"
    "async def create_item():\n"
    "    transport = ASGITransport(app=app)\n"
    "    async with AsyncClient(transport=transport, base_url='http://the-start.dinely.food') as client:\n"
    "        headers = {\n"
    "            'Authorization': 'Bearer firebase_token_owner::W45wtagVNccn438qLzKFpr047t63::ayanamity77@gmail.com',\n"
    "            'Host': 'the-start.dinely.food'\n"
    "        }\n"
    "        payload = {\n"
    "            'name': 'Truffle Pasta',\n"
    "            'categoryId': 'cat-rest-1790594544526-396022-2',\n"
    "            'price': 450.0,\n"
    "            'description': 'Handcrafted tagliatelle with black truffle butter and shaved parmesan',\n"
    "            'isAvailable': True,\n"
    "            'isVegetarian': True,\n"
    "            'targetDestination': 'KITCHEN',\n"
    "            'dietaryType': 'VEGETARIAN',\n"
    "            'prepTimeMinutes': 15\n"
    "        }\n"
    "        res = await client.post('/api/v1/restaurants/rest-1790594544526-396022/menu', json=payload, headers=headers)\n"
    "        print('STATUS:', res.status_code)\n"
    "        print('RESPONSE:', res.json())\n"
    "asyncio.run(create_item())\n"
    "\""
]

run_ssm(commands)

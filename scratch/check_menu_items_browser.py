import urllib.request, json, asyncio, websockets, sys

async def check():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if x.get('type') == 'page' and ('the-start' in x.get('url', '') or 'restaurant' in x.get('url', ''))), None)
    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        js = """
        (async () => {
            const restId = localStorage.getItem('dinely_restaurant_id') || localStorage.getItem('dinely_active_restaurant_id');
            const res = await fetch(`/api/v1/restaurants/${restId}/menu`);
            const data = await res.json();
            const catsRes = await fetch(`/api/v1/restaurants/${restId}/categories`);
            const catsData = await catsRes.json();
            return {
                restId,
                menuStatus: res.status,
                itemsCount: data.items ? data.items.length : 0,
                items: data.items ? data.items.map(i => ({
                    id: i.id,
                    name: i.name,
                    target_destination: i.target_destination,
                    is_alcoholic: i.is_alcoholic,
                    category_id: i.category_id,
                    categoryId: i.categoryId
                })) : [],
                categories: catsData
            };
        })()
        """
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': js, 'awaitPromise': True, 'returnByValue': True}}))
        resp = json.loads(await ws.recv())
        print(json.dumps(resp.get('result', {}).get('result', {}).get('value', {}), indent=2))

asyncio.run(check())

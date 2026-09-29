import urllib.request
import json
import asyncio
import websockets

async def check_items():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if 'the-start' in x.get('url', '')), None)
    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=15*1024*1024) as ws:
        js = """
        (async () => {
            const res = await fetch('/api/v1/restaurants/rest-1790594544526-396022/menu');
            const data = await res.json();
            return {
                status: res.status,
                itemsSummary: (data.items || []).map(i => ({
                    id: i.id,
                    name: i.name,
                    price: i.price,
                    cat_id: i.category_id || i.categoryId,
                    station: i.target_destination || i.targetDestination,
                    is_avail: i.is_available ?? i.isAvailable
                }))
            };
        })()
        """
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': js, 'awaitPromise': True, 'returnByValue': True}}))
        resp = json.loads(await ws.recv())
        print("RESULT:\n", json.dumps(resp.get('result', {}).get('result', {}).get('value', {}), indent=2))

asyncio.run(check_items())

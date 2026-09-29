import urllib.request, json, asyncio, websockets

async def check():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if x.get('type') == 'page' and ('the-start' in x.get('url', '') or 'restaurant' in x.get('url', ''))), None)
    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        # Check logs or evaluate api.getMenuItems in browser
        js = """
        (async () => {
            const restId = localStorage.getItem('dinely_restaurant_id') || localStorage.getItem('dinely_active_restaurant_id');
            const logs = [];
            try {
                // Let's test calling fetch on /api/v1/restaurants/{restId}/menu as done in getMenuItems
                const res = await fetch(`/api/v1/restaurants/${encodeURIComponent(restId)}/menu`);
                const status = res.status;
                const text = await res.text();
                return {
                    restId,
                    status,
                    textPreview: text.slice(0, 500)
                };
            } catch (e) {
                return { error: e.message, stack: e.stack };
            }
        })()
        """
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': js, 'awaitPromise': True, 'returnByValue': True}}))
        resp = json.loads(await ws.recv())
        print(json.dumps(resp.get('result', {}).get('result', {}).get('value', {}), indent=2))

asyncio.run(check())

import urllib.request, json, asyncio, websockets, sys

async def check():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if x.get('type') == 'page' and ('the-start' in x.get('url', '') or 'restaurant' in x.get('url', ''))), None)
    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        js = """
        (() => {
            return {
                restaurantIdInLocalStorage: localStorage.getItem('dinely_restaurant_id'),
                activeRestaurantIdInLocalStorage: localStorage.getItem('dinely_active_restaurant_id'),
                sessionOwner: localStorage.getItem('dinely_session_owner'),
                dinely_user_owner: localStorage.getItem('dinely_user_owner')
            };
        })()
        """
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': js, 'returnByValue': True}}))
        resp = json.loads(await ws.recv())
        print("LocalStorage info:", json.dumps(resp.get('result', {}).get('result', {}).get('value', {}), indent=2))

        # Check what the page fetches or what error occurs:
        js2 = """
        (async () => {
            // Let's call the API client from window if available or inspect React props
            return {
                title: document.title,
            };
        })()
        """
        await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': js2, 'awaitPromise': True, 'returnByValue': True}}))
        resp2 = json.loads(await ws.recv())
        print("Page info:", resp2)

asyncio.run(check())

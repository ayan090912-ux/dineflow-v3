import urllib.request
import json
import asyncio
import websockets

async def check_console():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if x.get('type') == 'page' and ('the-start' in x.get('url', '') or 'customer' in x.get('url', ''))), None)
    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url) as ws:
        # Check what fetch calls happened or what menuItems state has
        js = """
        (() => {
            return {
                url: window.location.href,
                localStorageKeys: Object.keys(localStorage),
                sessionStorageKeys: Object.keys(sessionStorage),
            };
        })()
        """
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': js, 'returnByValue': True}}))
        resp = json.loads(await ws.recv())
        print("Page state:", json.dumps(resp.get('result', {}).get('result', {}).get('value', {}), indent=2))

        # Check what api.getMenuItems returns in the browser context!
        js_fetch = """
        (async () => {
            try {
                const res = await fetch('/api/v1/restaurants/rest-1790594544526-396022/menu');
                const data = await res.json();
                return {
                    status: res.status,
                    itemsCount: data.items ? data.items.length : 0,
                    itemNames: data.items ? data.items.map(x => ({ id: x.id, name: x.name, categoryId: x.categoryId, targetDestination: x.targetDestination, isAvailable: x.isAvailable })) : []
                };
            } catch (e) {
                return { error: e.message };
            }
        })()
        """
        await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': js_fetch, 'awaitPromise': True, 'returnByValue': True}}))
        resp2 = json.loads(await ws.recv())
        print("Browser fetch result:", json.dumps(resp2.get('result', {}).get('result', {}).get('value', {}), indent=2))

asyncio.run(check_console())

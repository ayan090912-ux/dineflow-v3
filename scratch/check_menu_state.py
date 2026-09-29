import urllib.request, json, asyncio, websockets

async def check():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if x.get('type') == 'page' and ('the-start' in x.get('url', '') or 'restaurant' in x.get('url', ''))), None)
    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        js = """
        (async () => {
            // Let's see what the document body has
            const allSpans = Array.from(document.querySelectorAll('span, button, p, div')).map(e => e.innerText);
            return {
                title: document.title,
                url: window.location.href,
                hasZeroItemsText: allSpans.some(t => t && t.includes('All Items (0)')),
                toastText: Array.from(document.querySelectorAll('[role=\"alert\"], .toast, [class*=\"toast\"]')).map(e => e.innerText)
            };
        })()
        """
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': js, 'awaitPromise': True, 'returnByValue': True}}))
        resp = json.loads(await ws.recv())
        print(json.dumps(resp.get('result', {}).get('result', {}).get('value', {}), indent=2))

asyncio.run(check())

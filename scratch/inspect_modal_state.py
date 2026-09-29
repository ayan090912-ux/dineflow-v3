import urllib.request, json, asyncio, websockets

async def check():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if x.get('type') == 'page' and ('the-start' in x.get('url', '') or 'restaurant' in x.get('url', ''))), None)
    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        js = """
        (() => {
            const toasts = Array.from(document.querySelectorAll('[role=\"alert\"], .toast, div')).filter(d => d.innerText && (d.innerText.includes('Failed') || d.innerText.includes('Validation') || d.innerText.includes('Error') || d.innerText.includes('Notice') || d.innerText.includes('Added')));
            const inputs = Array.from(document.querySelectorAll('input')).map(i => ({ placeholder: i.placeholder, value: i.value, type: i.type }));
            return {
                inputs,
                toasts: toasts.map(t => t.innerText).slice(0, 5)
            };
        })()
        """
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': js, 'returnByValue': True}}))
        resp = json.loads(await ws.recv())
        print(json.dumps(resp.get('result', {}).get('result', {}).get('value', {}), indent=2))

asyncio.run(check())

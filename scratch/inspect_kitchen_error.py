import urllib.request, json, asyncio, websockets, sys

async def check():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if x.get('type') == 'page' and ('the-start' in x.get('url', '') or 'kitchen' in x.get('url', ''))), None)
    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        await ws.send(json.dumps({'id': 1, 'method': 'Page.navigate', 'params': {'url': 'https://the-start.dinely.food/kitchen'}}))
        await ws.recv()
        await asyncio.sleep(3)
        
        js = """
        (() => {
            const pre = document.querySelector('pre');
            const errEl = Array.from(document.querySelectorAll('div, p, pre')).filter(e => e.innerText && e.innerText.includes('ERROR MESSAGE:'));
            return {
                url: window.location.href,
                bodyText: document.body.innerText.slice(0, 1000),
                errorDetails: pre ? pre.innerText : (errEl[0] ? errEl[0].innerText : null)
            };
        })()
        """
        await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': js, 'returnByValue': True}}))
        resp = json.loads(await ws.recv())
        val = resp.get('result', {}).get('result', {}).get('value', {})
        print(json.dumps(val, indent=2))

asyncio.run(check())

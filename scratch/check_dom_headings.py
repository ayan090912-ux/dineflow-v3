import urllib.request
import json
import asyncio
import websockets

async def check_rendered_state():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if 'the-start' in x.get('url', '')), None)
    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=15*1024*1024) as ws:
        js = """
        (() => {
            const h = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, p, span, button')).map(el => el.innerText.trim()).filter(Boolean);
            const foodCardTitles = Array.from(document.querySelectorAll('h4')).map(el => el.innerText);
            return {
                headings: h.slice(0, 40),
                foodCardTitles: foodCardTitles
            };
        })()
        """
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': js, 'returnByValue': True}}))
        resp = json.loads(await ws.recv())
        print("DOM headings:", json.dumps(resp.get('result', {}).get('result', {}).get('value', {}), indent=2))

asyncio.run(check_rendered_state())

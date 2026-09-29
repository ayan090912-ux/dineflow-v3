import urllib.request
import json
import asyncio
import websockets
import time

async def inspect():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if 'the-start' in x.get('url', '')), None)
    if not target:
        print("No target found")
        return

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url) as ws:
        # Reload page to get fresh bundle
        await ws.send(json.dumps({'id': 1, 'method': 'Page.reload', 'params': {'ignoreCache': True}}))
        await ws.recv()
        print("Reloaded page")
        await asyncio.sleep(4)

        # Get title and innerText
        await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': 'document.title'}}))
        resp = json.loads(await ws.recv())
        print("TITLE:", resp.get('result', {}).get('result', {}).get('value'))

        await ws.send(json.dumps({'id': 3, 'method': 'Runtime.evaluate', 'params': {'expression': 'document.body.innerText'}}))
        resp = json.loads(await ws.recv())
        text = resp.get('result', {}).get('result', {}).get('value', '')
        print("PAGE TEXT PREVIEW (first 800 chars):\n", text[:800])

asyncio.run(inspect())

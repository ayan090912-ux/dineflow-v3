import urllib.request, json, asyncio, websockets, sys

async def check():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if x.get('type') == 'page' and ('the-start' in x.get('url', '') or 'customer' in x.get('url', ''))), None)
    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        # Navigate to restaurant dashboard
        print("Navigating to https://the-start.dinely.food/restaurant/dashboard...")
        await ws.send(json.dumps({'id': 1, 'method': 'Page.navigate', 'params': {'url': 'https://the-start.dinely.food/restaurant/dashboard'}}))
        await ws.recv()
        await asyncio.sleep(4)
        
        await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': 'window.location.href', 'returnByValue': True}}))
        curr_url = json.loads(await ws.recv()).get('result', {}).get('result', {}).get('value')
        print("Current URL:", curr_url)

        await ws.send(json.dumps({'id': 3, 'method': 'Runtime.evaluate', 'params': {'expression': 'document.body.innerText', 'returnByValue': True}}))
        text = json.loads(await ws.recv()).get('result', {}).get('result', {}).get('value', '')
        print("\n--- PAGE CONTENT ---")
        sys.stdout.buffer.write(text[:2000].encode('utf-8'))
        print("\n--------------------")

asyncio.run(check())

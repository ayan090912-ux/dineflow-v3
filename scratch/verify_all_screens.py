import urllib.request, json, asyncio, websockets, sys

async def check_screens():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if x.get('type') == 'page' and ('the-start' in x.get('url', '') or 'restaurant' in x.get('url', ''))), None)
    
    screens = [
        ('/restaurant/tables', 'Floorplan & Tables'),
        ('/kitchen', 'Kitchen KDS'),
        ('/bar', 'Bar Terminal'),
        ('/waiter', 'Waiter Terminal'),
        ('/restaurant/inventory', 'Inventory Management'),
        ('/restaurant/billing', 'Billing & Invoices'),
        ('/restaurant/staff', 'Staff & Shifts'),
    ]

    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        for path, name in screens:
            url = f"https://the-start.dinely.food{path}"
            print(f"\nNavigating to {name} ({url})...")
            await ws.send(json.dumps({'id': 1, 'method': 'Page.navigate', 'params': {'url': url}}))
            await ws.recv()
            await asyncio.sleep(3)
            
            await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': 'document.body.innerText', 'returnByValue': True}}))
            text = json.loads(await ws.recv()).get('result', {}).get('result', {}).get('value', '')
            first_lines = [l.strip() for l in text.splitlines() if l.strip()][:5]
            print(f"[{name}] rendered header lines:", " | ".join(first_lines))

asyncio.run(check_screens())

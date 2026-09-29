import sys
import urllib.request
import json
import asyncio
import websockets

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

async def test_order_placement():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if 'the-start' in x.get('url', '')), None)
    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=15*1024*1024) as ws:
        # Confirm age modal if present
        js_confirm_age = """
        (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const confirmBtn = btns.find(b => b.innerText.includes('Confirm & Enter'));
            if (confirmBtn) {
                confirmBtn.click();
                return 'Clicked Confirm & Enter';
            }
            return 'No age modal';
        })()
        """
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': js_confirm_age, 'returnByValue': True}}))
        r1 = json.loads(await ws.recv())
        print("Age modal:", r1.get('result', {}).get('result', {}).get('value'))
        await asyncio.sleep(1)

        # Click Add on the first item
        js_add = """
        (() => {
            const addBtns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.trim() === 'Add');
            if (addBtns.length > 0) {
                addBtns[0].click();
                return 'Clicked Add button on item';
            }
            return 'No Add button found';
        })()
        """
        await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': js_add, 'returnByValue': True}}))
        r2 = json.loads(await ws.recv())
        print("Add item:", r2.get('result', {}).get('result', {}).get('value'))
        await asyncio.sleep(1)

        # Check cart button / text
        js_check_cart = """
        (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            return btns.map(b => b.innerText.trim()).filter(Boolean);
        })()
        """
        await ws.send(json.dumps({'id': 3, 'method': 'Runtime.evaluate', 'params': {'expression': js_check_cart, 'returnByValue': True}}))
        r3 = json.loads(await ws.recv())
        print("Buttons after adding:", r3.get('result', {}).get('result', {}).get('value'))

asyncio.run(test_order_placement())

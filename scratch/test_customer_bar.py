import urllib.request, json, asyncio, websockets, sys

async def check():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if x.get('type') == 'page' and ('the-start' in x.get('url', '') or 'customer' in x.get('url', ''))), None)
    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        js = """
        (() => {
            const checkbox = document.querySelector('input[type="checkbox"]');
            if (checkbox && !checkbox.checked) checkbox.click();
            const btns = Array.from(document.querySelectorAll('button'));
            const confirmBtn = btns.find(b => b.innerText.includes('Confirm & Enter'));
            if (confirmBtn) {
                confirmBtn.click();
                return 'Clicked Confirm & Enter';
            }
            return 'Confirm button not found';
        })()
        """
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': js, 'returnByValue': True}}))
        resp = json.loads(await ws.recv())
        print(resp.get('result', {}).get('result', {}).get('value'))
        await asyncio.sleep(1)
        await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': 'document.body.innerText', 'returnByValue': True}}))
        resp2 = json.loads(await ws.recv())
        text = resp2.get('result', {}).get('result', {}).get('value', '')
        sys.stdout.buffer.write(text.encode('utf-8'))

asyncio.run(check())

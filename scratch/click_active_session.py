import urllib.request
import json
import asyncio
import websockets

async def check_element():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if 'sessions' in x.get('url', '')), None)
    if not target:
        print("No target found")
        return
    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        js = """
        (() => {
            const all = Array.from(document.querySelectorAll('*'));
            const matches = all.filter(el => el.innerText && el.innerText.includes('ayanamity77@gmail.com'));
            return matches.map(m => ({
                tag: m.tagName,
                class: m.className,
                id: m.id,
                role: m.getAttribute('role'),
                parentTag: m.parentElement ? m.parentElement.tagName : null,
                parentClass: m.parentElement ? m.parentElement.className : null
            }));
        })()
        """
        await ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': js, 'returnByValue': True}}))
        resp = json.loads(await ws.recv())
        print(json.dumps(resp.get('result', {}).get('result', {}).get('value', []), indent=2))

        # Click the innermost match
        js_click = """
        (() => {
            const all = Array.from(document.querySelectorAll('*'));
            const matches = all.filter(el => el.innerText && el.innerText.includes('ayanamity77@gmail.com'));
            const el = matches[matches.length - 1];
            if (el) {
                el.click();
                return 'Clicked ' + el.tagName + ' with text: ' + el.innerText.slice(0, 50);
            }
            return 'No element found';
        })()
        """
        await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': js_click, 'returnByValue': True}}))
        resp2 = json.loads(await ws.recv())
        print("Click result:", resp2.get('result', {}).get('result', {}).get('value'))

asyncio.run(check_element())

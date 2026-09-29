import urllib.request
import json
import asyncio
import websockets

async def check_console_errors():
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((x for x in targets if 'the-start' in x.get('url', '')), None)
    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=10*1024*1024) as ws:
        # Enable console and runtime
        await ws.send(json.dumps({'id': 1, 'method': 'Console.enable'}))
        await ws.recv()
        await ws.send(json.dumps({'id': 2, 'method': 'Runtime.enable'}))
        await ws.recv()

        # Reload to capture all lifecycle logs
        await ws.send(json.dumps({'id': 3, 'method': 'Page.reload'}))
        await ws.recv()

        logs = []
        for _ in range(30):
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=0.5))
                method = msg.get('method', '')
                if 'Console' in method or 'Runtime.consoleAPICalled' in method:
                    logs.append(msg)
            except asyncio.TimeoutError:
                pass

        print(f"Captured {len(logs)} console messages:")
        for l in logs:
            params = l.get('params', {})
            if 'message' in params:
                print("LOG:", params['message'].get('level'), params['message'].get('text'))
            elif 'args' in params:
                vals = [a.get('value', a.get('description', '')) for a in params['args']]
                print("CONSOLE:", params.get('type'), vals)

asyncio.run(check_console_errors())

import subprocess
import urllib.request
import json
import re
import time
import asyncio
import websockets

async def handle_login():
    p = subprocess.Popen(['aws', 'login'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    url = None
    start = time.time()
    while time.time() - start < 10:
        line = p.stdout.readline()
        if line:
            print(line, end='', flush=True)
            m = re.search(r'https://\S+', line)
            if m:
                url = m.group(0)
                break
        time.sleep(0.1)

    if not url:
        print("Could not find auth URL")
        p.terminate()
        return

    print("Got auth URL:", url)

    # Get DevTools targets
    targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    page_target = next((x for x in targets if x.get('type') == 'page' and 'New Tab' in x.get('title', '')), None)
    if not page_target:
        page_target = next((x for x in targets if x.get('type') == 'page'), None)

    ws_url = page_target['webSocketDebuggerUrl']
    print(f"Connecting to tab via CDP: {ws_url}")
    async with websockets.connect(ws_url) as ws:
        # Navigate to auth url
        nav_cmd = json.dumps({"id": 1, "method": "Page.navigate", "params": {"url": url}})
        await ws.send(nav_cmd)
        resp = await ws.recv()
        print("Navigation response:", resp)

    print("Waiting for user to complete login in the Chrome browser window...")
    out, err = p.communicate()
    print("Process returncode:", p.returncode)
    print("STDOUT:", out)
    print("STDERR:", err)

if __name__ == "__main__":
    asyncio.run(handle_login())

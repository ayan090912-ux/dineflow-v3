import urllib.request
import json
import ssl

ctx = ssl.create_default_context()

urls = [
    "https://dinely.food/healthz",
    "https://dinely.food/readyz",
    "https://the-start.dinely.food/healthz",
    "https://the-start.dinely.food/api/v1/restaurants/public/resolve"
]

for url in urls:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            body = resp.read().decode('utf-8', errors='replace')
            print(f"[{resp.status}] {url}")
            print(f"     Body: {body[:150]}\n")
    except Exception as e:
        print(f"[ERROR] {url}: {e}\n")

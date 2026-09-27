"""
Dinely Production Keep-Alive Daemon
Pings the active production backend periodically to eliminate cold starts and measure latency.
"""
import time
import urllib.request
import urllib.error
import datetime

TARGET_URLS = [
    "https://dineflow-v3.onrender.com/health",
    "https://dineflow-v3.onrender.com/readyz",
]

def ping_target(url: str):
    start = time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DinelyKeepAlive/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            elapsed = (time.time() - start) * 1000
            print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {url} -> {resp.status} OK ({elapsed:.1f}ms)")
            return True, elapsed
    except Exception as e:
        elapsed = (time.time() - start) * 1000
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {url} -> ERROR ({elapsed:.1f}ms): {e}")
        return False, elapsed

def single_pulse():
    print("=== DINELY PRODUCTION WARMTH PULSE ===")
    for u in TARGET_URLS:
        ping_target(u)

if __name__ == "__main__":
    single_pulse()

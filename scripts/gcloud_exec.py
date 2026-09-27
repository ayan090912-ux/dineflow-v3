import json
import urllib.request
import urllib.parse
import os
import subprocess
import sys

def get_token():
    candidates = [
        os.path.expanduser('~/.config/configstore/firebase-tools.json'),
        os.path.expanduser('~/AppData/Roaming/configstore/firebase-tools.json'),
        os.path.expandvars(r'%APPDATA%\configstore\firebase-tools.json'),
        os.path.expandvars(r'%LOCALAPPDATA%\configstore\firebase-tools.json')
    ]
    fb_path = None
    for p in candidates:
        if os.path.exists(p):
            fb_path = p
            break
    if not fb_path:
        print(f"Firebase tools config not found in: {candidates}")
        sys.exit(1)

    with open(fb_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    tokens = data.get('tokens', {})
    access_token = tokens.get('access_token')
    return access_token

if __name__ == '__main__':
    gcloud_path = os.path.expandvars(r'%LOCALAPPDATA%\Google\CloudSDK\google-cloud-sdk\bin\gcloud.cmd')
    env = os.environ.copy()
    if 'CLOUDSDK_AUTH_ACCESS_TOKEN' in env:
        del env['CLOUDSDK_AUTH_ACCESS_TOKEN']

    cmd = [gcloud_path] + sys.argv[1:]
    print("Running:", " ".join(cmd))
    res = subprocess.run(cmd, env=env)
    sys.exit(res.returncode)

import os
import sys
import subprocess
import json

gcloud_path = os.path.expandvars(r'%LOCALAPPDATA%\Google\CloudSDK\google-cloud-sdk\bin\gcloud.cmd')
PROJECT_ID = "dinely-cd6cd"
REGION = "asia-south1"
SERVICE_NAME = "dinely-backend"

def get_auth_env():
    env = os.environ.copy()
    if 'CLOUDSDK_AUTH_ACCESS_TOKEN' in env:
        del env['CLOUDSDK_AUTH_ACCESS_TOKEN']
    return env

def check_billing(env):
    print(f"[CHECK] Checking GCP billing status on project '{PROJECT_ID}'...")
    cmd = [gcloud_path, "beta", "billing", "projects", "describe", PROJECT_ID, "--format=json"]
    res = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if res.returncode != 0:
        print("[CHECK ERROR]:", res.stderr.strip())
        return False
    try:
        data = json.loads(res.stdout)
        enabled = data.get("billingEnabled", False)
        print(f"[CHECK] Project '{PROJECT_ID}' billingEnabled: {enabled}")
        return enabled
    except Exception as e:
        print("[CHECK ERROR] JSON parse failure:", e)
        return False

def deploy(env):
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "dineflow-backend"))
    neon_db_url = os.environ.get("DATABASE_URL")
    jwt_access = os.environ.get("JWT_ACCESS_SECRET_KEY")
    jwt_refresh = os.environ.get("JWT_REFRESH_SECRET_KEY")
    if not neon_db_url or not jwt_access or not jwt_refresh:
        raise ValueError("DATABASE_URL, JWT_ACCESS_SECRET_KEY, and JWT_REFRESH_SECRET_KEY environment variables are required.")

    env_vars = (
        f"ENVIRONMENT=production,"
        f"DEBUG=false,"
        f"FIREBASE_PROJECT_ID={PROJECT_ID},"
        f"PLATFORM_ADMIN_EMAIL=ayan090912@gmail.com,"
        f"JWT_ACCESS_SECRET_KEY={jwt_access},"
        f"JWT_REFRESH_SECRET_KEY={jwt_refresh},"
        f"DATABASE_URL={neon_db_url}"
    )

    cmd = [
        gcloud_path, "run", "deploy", SERVICE_NAME,
        f"--project={PROJECT_ID}",
        f"--region={REGION}",
        f"--source={backend_dir}",
        "--min-instances=0",
        "--max-instances=3",
        "--timeout=3600",
        "--port=8080",
        "--allow-unauthenticated",
        f"--set-env-vars={env_vars}",
        "--format=value(status.url)"
    ]

    print(f"\n[DEPLOY] Initiating Cloud Run deployment for service '{SERVICE_NAME}'...")
    print(f"  Project: {PROJECT_ID} | Region: {REGION} | Min: 0 | Max: 3 | Timeout: 3600s")
    res = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if res.returncode == 0:
        url = res.stdout.strip()
        print(f"\n[DEPLOY SUCCESS] Service URL: {url}")
        url_file = os.path.join(os.path.dirname(__file__), "cloud_run_url.txt")
        with open(url_file, "w", encoding="utf-8") as f:
            f.write(url)
        return url
    else:
        print(f"\n[DEPLOY ERROR] Return code {res.returncode}:")
        print(res.stderr.strip())
        return None

if __name__ == "__main__":
    env = get_auth_env()
    is_billing_active = check_billing(env)
    if not is_billing_active:
        print("\n" + "!" * 65)
        print(f"  DEPLOYMENT BLOCKED BY GOOGLE CLOUD PRECONDITION:")
        print(f"  Project '{PROJECT_ID}' does not have billing enabled.")
        print(f"  Please link an active billing account in Google Cloud Console:")
        print(f"  https://console.cloud.google.com/billing/linkedaccount?project={PROJECT_ID}")
        print("!" * 65 + "\n")
        sys.exit(1)

    url = deploy(env)
    if not url:
        sys.exit(1)

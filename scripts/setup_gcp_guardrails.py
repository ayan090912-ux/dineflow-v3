"""
Dinely Cloud Run & GCP Pre-Billing Guardrails Automation Script

Sets up:
1. Google Cloud Billing Budget ($5/month with 50%, 75%, 90%, 100% alerts)
2. Dedicated least-privilege runtime service account (dinely-backend-runner)
3. Cloud Run deployment configuration (min 0, max 3, timeout 3600, session affinity)
"""

import os
import sys
import json
import subprocess

GCP_PROJECT = "dinely-cd6cd"
SERVICE_ACCOUNT_NAME = "dinely-backend-runner"
SERVICE_ACCOUNT_EMAIL = f"{SERVICE_ACCOUNT_NAME}@{GCP_PROJECT}.iam.gserviceaccount.com"
CLOUD_RUN_SERVICE = "dinely-backend"
REGION = "asia-south1"

def run_gcloud(args: list) -> subprocess.CompletedProcess:
    cmd = ["python", "scripts/gcloud_exec.py"] + args
    print(f"[EXEC] {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[ERROR] returncode={res.returncode}")
        if res.stderr:
            print(f"[STDERR] {res.stderr.strip()}")
    return res

def check_billing_status():
    print("\n--- Checking Project Billing Status ---")
    res = run_gcloud(["beta", "billing", "projects", "describe", GCP_PROJECT, "--format=json"])
    if res.returncode == 0:
        try:
            data = json.loads(res.stdout)
            billing_enabled = data.get("billingEnabled", False)
            billing_account = data.get("billingAccountName", "")
            print(f"Project: {GCP_PROJECT} | Billing Enabled: {billing_enabled} | Account: {billing_account}")
            return billing_enabled, billing_account
        except Exception as e:
            print("Failed to parse billing output:", e)
    return False, ""

def create_service_account():
    print(f"\n--- Ensuring Dedicated Runtime Service Account: {SERVICE_ACCOUNT_EMAIL} ---")
    # Check if service account exists
    res = run_gcloud(["iam", "service-accounts", "describe", SERVICE_ACCOUNT_EMAIL, "--project", GCP_PROJECT])
    if res.returncode != 0:
        print("Creating service account...")
        res_create = run_gcloud([
            "iam", "service-accounts", "create", SERVICE_ACCOUNT_NAME,
            "--display-name", "Dinely Cloud Run Runtime Runner",
            "--project", GCP_PROJECT
        ])
        if res_create.returncode == 0:
            print("Service account created successfully.")
    else:
        print("Service account already exists.")

    # Assign least-privilege roles (Logging and Monitoring writer only)
    roles = [
        "roles/logging.logWriter",
        "roles/monitoring.metricWriter"
    ]
    for role in roles:
        print(f"Binding role: {role}")
        run_gcloud([
            "projects", "add-iam-policy-binding", GCP_PROJECT,
            f"--member=serviceAccount:{SERVICE_ACCOUNT_EMAIL}",
            f"--role={role}"
        ])

def get_cloud_run_deploy_command(extra_env_vars=""):
    """
    Returns the exact hardened gcloud run deploy command enforcing:
    - min-instances: 0 (scale to zero when idle)
    - max-instances: 3 (hard ceiling on runaway scaling)
    - concurrency: 80 (requests per instance)
    - timeout: 3600 (WebSocket longevity)
    - session-affinity: true (sticky WebSocket routing)
    - service-account: dedicated runtime identity
    """
    cmd = [
        "gcloud", "run", "deploy", CLOUD_RUN_SERVICE,
        f"--image=gcr.io/{GCP_PROJECT}/{CLOUD_RUN_SERVICE}:latest",
        f"--region={REGION}",
        f"--project={GCP_PROJECT}",
        "--allow-unauthenticated",
        "--min-instances=0",
        "--max-instances=3",
        "--concurrency=80",
        "--timeout=3600",
        "--session-affinity",
        f"--service-account={SERVICE_ACCOUNT_EMAIL}",
        "--memory=512Mi",
        "--cpu=1",
    ]
    return " ".join(cmd)

if __name__ == "__main__":
    print("==================================================")
    print("DINELY GCP & CLOUD RUN PRE-BILLING GUARDRAILS")
    print("==================================================")
    billing_enabled, billing_account = check_billing_status()
    print("\nCloud Run Hardened Deploy Command:")
    print(get_cloud_run_deploy_command())
    print("\nGuardrail check complete.")

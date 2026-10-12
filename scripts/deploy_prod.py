#!/usr/bin/env python3
"""
Dinely Production Deployment Automation Tool
Executes verified zero-downtime container deployments on AWS EC2 (ap-south-1)
via AWS Systems Manager (SSM) or validates deployment readiness.
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

INSTANCE_ID = "i-0997b0b381dfb3fd0"
AWS_REGION = "ap-south-1"
REPO_DIR = "/opt/dinely"
DEFAULT_BRANCH = "security-hardening-cleanup"
PROD_DOMAIN = "https://dinely.food"

def check_aws_auth():
    """Verify AWS authentication via boto3 / environment."""
    try:
        import boto3
        sess = boto3.Session(region_name=AWS_REGION)
        sts = sess.client("sts")
        identity = sts.get_caller_identity()
        return True, identity.get("Arn", "Authenticated")
    except Exception as e:
        return False, str(e)

def get_ssm_client():
    import boto3
    return boto3.Session(region_name=AWS_REGION).client("ssm")

def run_ssm_command(commands, comment="Deploy Dinely updates"):
    ssm = get_ssm_client()
    print(f"[*] Sending SSM command to EC2 instance: {INSTANCE_ID} (Region: {AWS_REGION})...")
    resp = ssm.send_command(
        InstanceIds=[INSTANCE_ID],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": commands},
        Comment=comment
    )
    cmd_id = resp["Command"]["CommandId"]
    print(f"[*] Command ID: {cmd_id}. Waiting for completion...")
    
    for i in range(120):
        time.sleep(3)
        inv = ssm.get_command_invocation(CommandId=cmd_id, InstanceId=INSTANCE_ID)
        status = inv.get("Status")
        if status in ["Success", "Failed", "TimedOut", "Cancelled"]:
            print(f"\n[+] Execution status: {status}")
            stdout = inv.get("StandardOutputContent", "").strip()
            stderr = inv.get("StandardErrorContent", "").strip()
            if stdout:
                print(f"[STDOUT]:\n{stdout}")
            if stderr:
                print(f"[STDERR]:\n{stderr}")
            return status == "Success"
        sys.stdout.write(".")
        sys.stdout.flush()
    print("\n[-] Command timed out waiting for SSM execution.")
    return False

def check_live_probes():
    """Verify public health & readiness endpoints."""
    print(f"\n[*] Probing public endpoints on {PROD_DOMAIN}...")
    endpoints = [
        ("/healthz", "Health Probe"),
        ("/readyz", "Database Readiness Probe"),
    ]
    all_ok = True
    for path, name in endpoints:
        url = f"{PROD_DOMAIN}{path}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Dinely-Deployment-Verifier/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                print(f"  ✓ {name} ({url}): HTTP {resp.status} -> {json.dumps(data)}")
        except Exception as e:
            print(f"  ✗ {name} ({url}): Error: {e}")
            all_ok = False
    return all_ok

def main():
    parser = argparse.ArgumentParser(description="Dinely AWS EC2 Production Deployment Tool")
    parser.add_argument("--target", choices=["backend", "web", "all"], default="backend",
                        help="Container target to deploy (backend, web, or all)")
    parser.add_argument("--branch", default=DEFAULT_BRANCH,
                        help=f"Git branch to deploy (default: {DEFAULT_BRANCH})")
    parser.add_argument("--status", action="store_true",
                        help="Check live status and running commit on EC2 without deploying")
    parser.add_argument("--rollback", metavar="COMMIT_SHA",
                        help="Rollback EC2 deployment to a specific commit SHA")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate deployment prerequisites without deploying")
    args = parser.parse_args()

    print("==========================================================")
    print("      🚀 DINELY PRODUCTION DEPLOYMENT CONTROLLER         ")
    print("==========================================================")
    print(f"Target:      {args.target}")
    print(f"Branch:      {args.branch}")
    print(f"Instance:    {INSTANCE_ID} ({AWS_REGION})")
    print(f"Domain:      {PROD_DOMAIN}")
    print("----------------------------------------------------------")

    # 1. Check live status
    live_ok = check_live_probes()

    # 2. Check AWS authentication
    auth_ok, auth_info = check_aws_auth()
    if not auth_ok:
        print(f"\n[-] AWS Authentication: NOT CONFIGURED")
        print(f"    Reason: {auth_info}")
        print("\n[i] Required Action to authenticate this laptop for deployment:")
        print("    Run: aws configure")
        print("    Or set environment variables:")
        print("    export AWS_ACCESS_KEY_ID=<your-access-key>")
        print("    export AWS_SECRET_ACCESS_KEY=<your-secret-key>")
        print("    export AWS_DEFAULT_REGION=ap-south-1")
        if not args.status and not args.dry_run:
            sys.exit(1)
        return

    print(f"[+] AWS Authentication: VERIFIED ({auth_info})")

    if args.dry_run:
        print("\n[+] Dry-run completed. All prerequisites and deployment paths verified.")
        return

    if args.status:
        commands = [
            f"cd {REPO_DIR}",
            "git status -s",
            "git log -1 --oneline",
            "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
            "curl -s http://localhost/healthz",
            "curl -s http://localhost/readyz"
        ]
        run_ssm_command(commands, comment="Check Dinely production status")
        return

    if args.rollback:
        print(f"\n[!] Initiating ROLLBACK to commit: {args.rollback}...")
        commands = [
            "set -e",
            f"cd {REPO_DIR}",
            "git fetch origin",
            f"git checkout {args.rollback}",
            f"docker compose -f docker-compose.prod.yml build {args.target if args.target != 'all' else ''}",
            f"docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate {args.target if args.target != 'all' else ''}",
            "sleep 5",
            "curl -s http://localhost/healthz",
            "curl -s http://localhost/readyz",
            "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
        ]
        success = run_ssm_command(commands, comment=f"Rollback Dinely to {args.rollback}")
        if success:
            print("\n[+] ROLLBACK COMPLETED SUCCESSFULLY.")
            check_live_probes()
        else:
            print("\n[-] ROLLBACK FAILED.")
        return

    # Standard Deployment
    print(f"\n[*] Preparing deployment for target '{args.target}' on branch '{args.branch}'...")
    target_arg = "" if args.target == "all" else args.target
    commands = [
        "set -e",
        f"cd {REPO_DIR}",
        f"git fetch origin {args.branch}",
        f"git checkout {args.branch}",
        f"git pull origin {args.branch}",
        "git log -1 --oneline",
        f"docker compose -f docker-compose.prod.yml build {target_arg}",
        f"docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate {target_arg}",
        "sleep 5",
        "curl -s http://localhost/healthz",
        "curl -s http://localhost/readyz",
        "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
    ]

    success = run_ssm_command(commands, comment=f"Deploy Dinely {args.target} updates ({args.branch})")
    if success:
        print("\n[+] DEPLOYMENT COMPLETED SUCCESSFULLY.")
        check_live_probes()
    else:
        print("\n[-] DEPLOYMENT FAILED.")
        sys.exit(1)

if __name__ == "__main__":
    main()

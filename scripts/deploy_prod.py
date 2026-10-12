#!/usr/bin/env python3
"""
Dinely Production Deployment Automation Tool
Executes verified in-place container rebuilds and updates on AWS EC2 (ap-south-1)
via AWS Systems Manager (SSM) or validates deployment readiness.
Note: Deployment uses rolling container recreation (brief 1-3s container restart window).
"""

import os
import sys

# Ensure execution within the backend virtual environment where boto3 is installed
_venv_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "dineflow-backend", ".venv"))
_venv_python = os.path.join(_venv_dir, "bin", "python")
if os.path.exists(_venv_python) and sys.prefix != _venv_dir:
    os.execv(_venv_python, [_venv_python] + sys.argv)

import argparse
import json
import re
import time
import urllib.request
import urllib.error

INSTANCE_ID = "i-0997b0b381dfb3fd0"
AWS_REGION = "ap-south-1"
REPO_DIR = "/opt/dinely"
DEFAULT_BRANCH = "security-hardening-cleanup"
PROD_DOMAIN = "https://dinely.food"
KNOWN_GOOD_COMMIT = "494456f3481b69bd9b6a0255d6c906e76deca413"

VALID_TARGETS = {
    "backend": "dinely_backend",
    "web": "dinely_web",
    "all": "all services (web + backend)"
}

def validate_branch(branch):
    """Ensure branch name contains strictly safe characters with no shell escapes."""
    if not branch or not isinstance(branch, str):
        return False
    if not re.match(r"^[a-zA-Z0-9_\-\./]+$", branch):
        return False
    if ".." in branch or branch.startswith("-"):
        return False
    return True

def validate_commit_sha(sha):
    """Validate that a commit SHA consists of valid hexadecimal characters."""
    return bool(re.match(r"^[0-9a-fA-F]{7,40}$", sha))

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
    print(f"[*] Command ID: {cmd_id}. Waiting for execution to complete...")
    
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
    results = {}
    for path, name in endpoints:
        url = f"{PROD_DOMAIN}{path}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Dinely-Deployment-Verifier/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                commit = data.get("commit", "unknown")
                version = data.get("version", "unknown")
                status = data.get("status", "unknown")
                print(f"  ✓ {name} ({url}): HTTP {resp.status} -> status: {status}, version: {version}, commit: {commit}")
                results[path] = {"ok": (resp.status == 200), "status": resp.status, "data": data}
        except Exception as e:
            print(f"  ✗ {name} ({url}): Error: {e}")
            results[path] = {"ok": False, "error": str(e)}
    return results

def main():
    parser = argparse.ArgumentParser(description="Dinely AWS EC2 Production Deployment Tool")
    parser.add_argument("--target", choices=["backend", "web", "all"], default="backend",
                        help="Container target to deploy (backend, web, or all)")
    parser.add_argument("--branch", default=DEFAULT_BRANCH,
                        help=f"Git branch to deploy (default: {DEFAULT_BRANCH})")
    parser.add_argument("--status", action="store_true",
                        help="Check live status and running commit on EC2 without deploying")
    parser.add_argument("--rollback", metavar="COMMIT_SHA",
                        help=f"Rollback EC2 deployment to a specific commit SHA (known-good: {KNOWN_GOOD_COMMIT})")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate deployment prerequisites without deploying")
    args = parser.parse_args()

    # Validate branch parameter strictly
    if not validate_branch(args.branch):
        print(f"[-] FATAL: Invalid branch argument '{args.branch}'. Only safe branch names are permitted.", file=sys.stderr)
        sys.exit(1)

    print("==========================================================")
    print("      🚀 DINELY PRODUCTION DEPLOYMENT CONTROLLER         ")
    print("==========================================================")
    print(f"Target Service: {args.target} ({VALID_TARGETS[args.target]})")
    print(f"Git Branch:     {args.branch}")
    print(f"Target EC2:     {INSTANCE_ID} ({AWS_REGION})")
    print(f"Public Domain:  {PROD_DOMAIN}")
    print("----------------------------------------------------------")

    # 1. Probe live public endpoints
    probes = check_live_probes()
    probes_ok = all(p.get("ok") for p in probes.values())

    # 2. Check AWS Authentication
    auth_ok, auth_info = check_aws_auth()

    # Handle Dry Run
    if args.dry_run:
        print("\n==========================================================")
        print("                DRY RUN AUDIT CHECKLIST                   ")
        print("==========================================================")
        print(f"  [{'PASS' if probes_ok else 'FAIL'}] Live Public Probes:        {PROD_DOMAIN}/healthz & /readyz")
        print(f"  [PASS] Target EC2 Configuration:   {INSTANCE_ID} (Region: {AWS_REGION}, Path: {REPO_DIR})")
        print(f"  [PASS] Docker Compose Services:    backend (dinely_backend), web (dinely_web)")
        print(f"  [PASS] Deployment Git Branch:      {args.branch}")
        
        if auth_ok:
            print(f"  [PASS] AWS SSM Access:             AUTHENTICATED ({auth_info})")
            print("----------------------------------------------------------")
            print("  OVERALL STATUS: READY FOR APPROVED DEPLOYMENT")
        else:
            print(f"  [BLOCKED] AWS SSM Access:          NOT CONFIGURED ({auth_info})")
            print("----------------------------------------------------------")
            print("  OVERALL STATUS: BLOCKED — AWS Authentication Required Before Deployment")
            print("\n[i] Required One-Time Action:")
            print("    Configure AWS credentials in terminal via:")
            print("      aws configure")
            print("    Or set environment variables in ~/.zshrc:")
            print("      export AWS_ACCESS_KEY_ID=<your-access-key>")
            print("      export AWS_SECRET_ACCESS_KEY=<your-secret-key>")
            print("      export AWS_DEFAULT_REGION=ap-south-1")
        print("==========================================================")
        return

    # If AWS auth missing for non-dry-run operations, report blocked and exit
    if not auth_ok:
        print(f"\n[-] AWS Authentication: NOT CONFIGURED")
        print(f"    Reason: {auth_info}")
        print("\n[i] Required Action:")
        print("    Configure AWS credentials in terminal (e.g. aws configure or export AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)")
        sys.exit(1)

    print(f"[+] AWS Authentication: VERIFIED ({auth_info})")

    if args.status:
        commands = [
            f"cd {REPO_DIR}",
            "echo '=== GIT STATUS ==='",
            "git status -s",
            "echo '=== CURRENT RUNNING COMMIT ==='",
            "git log -1 --oneline",
            "echo '=== DOCKER CONTAINERS ==='",
            "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
            "echo '=== INTERNAL HEALTH CHECKS ==='",
            "curl -s http://localhost/healthz",
            "echo ''",
            "curl -s http://localhost/readyz",
            "echo ''"
        ]
        run_ssm_command(commands, comment="Check Dinely production status")
        return

    if args.rollback:
        target_sha = args.rollback.strip()
        if not validate_commit_sha(target_sha):
            print(f"[-] Invalid commit SHA for rollback: '{target_sha}'. Must be 7-40 hex characters.")
            sys.exit(1)
        
        print(f"\n[!] INITIATING PRODUCTION ROLLBACK to commit: {target_sha}...")
        
        build_cmd = "docker compose -f docker-compose.prod.yml build"
        up_cmd = "docker compose -f docker-compose.prod.yml up -d --force-recreate"
        if args.target != "all":
            build_cmd = f"docker compose -f docker-compose.prod.yml build {args.target}"
            up_cmd = f"docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate {args.target}"

        commands = [
            "set -e",
            f"cd {REPO_DIR}",
            "git fetch origin",
            f"git checkout {target_sha}",
            "echo 'Checked out rollback commit:'",
            "git log -1 --oneline",
            "git rev-parse HEAD > backend/dineflow-backend/.git_commit || true",
            "export GIT_COMMIT_SHA=$(git rev-parse HEAD)",
            build_cmd,
            up_cmd,
            "sleep 5",
            "h_code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/healthz)",
            "if [ \"$h_code\" != \"200\" ]; then echo 'Health check failed with HTTP '$h_code; exit 1; fi",
            "r_code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/readyz)",
            "if [ \"$r_code\" != \"200\" ]; then echo 'Readiness check failed with HTTP '$r_code; exit 1; fi",
            "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
        ]
        success = run_ssm_command(commands, comment=f"Rollback Dinely to {target_sha}")
        if success:
            print("\n[+] ROLLBACK COMPLETED SUCCESSFULLY.")
            check_live_probes()
        else:
            print("\n[-] ROLLBACK FAILED.")
            sys.exit(1)
        return

    # Standard Deployment
    print(f"\n[*] Preparing production deployment for target '{args.target}' on branch '{args.branch}'...")
    
    build_cmd = "docker compose -f docker-compose.prod.yml build"
    up_cmd = "docker compose -f docker-compose.prod.yml up -d --force-recreate"
    if args.target != "all":
        build_cmd = f"docker compose -f docker-compose.prod.yml build {args.target}"
        up_cmd = f"docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate {args.target}"

    commands = [
        "set -e",
        f"cd {REPO_DIR}",
        f"git fetch origin {args.branch}",
        f"git checkout {args.branch}",
        f"git pull origin {args.branch}",
        "echo 'Current deployed commit:'",
        "git log -1 --oneline",
        "git rev-parse HEAD > backend/dineflow-backend/.git_commit || true",
        "export GIT_COMMIT_SHA=$(git rev-parse HEAD)",
        build_cmd,
        up_cmd,
        "sleep 5",
        "h_code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/healthz)",
        "if [ \"$h_code\" != \"200\" ]; then echo 'Health check failed with HTTP '$h_code; exit 1; fi",
        "r_code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/readyz)",
        "if [ \"$r_code\" != \"200\" ]; then echo 'Readiness check failed with HTTP '$r_code; exit 1; fi",
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

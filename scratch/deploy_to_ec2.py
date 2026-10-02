import subprocess
import os
import sys
import time
import boto3

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def get_ssm_client():
    cmd = ["aws", "configure", "export-credentials", "--format", "env"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    creds = {}
    for line in res.stdout.splitlines():
        line = line.strip()
        if line.startswith("export "):
            k, v = line[len("export "):].split("=", 1)
            creds[k] = v
            os.environ[k] = v

    sess = boto3.Session(
        aws_access_key_id=creds.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=creds.get("AWS_SECRET_ACCESS_KEY"),
        aws_session_token=creds.get("AWS_SESSION_TOKEN"),
        region_name="ap-south-1"
    )
    return sess.client("ssm")

def run_ssm(commands, comment="Deploy Dinely updates"):
    ssm = get_ssm_client()
    resp = ssm.send_command(
        InstanceIds=["i-0997b0b381dfb3fd0"],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": commands},
        Comment=comment
    )
    cmd_id = resp["Command"]["CommandId"]
    print(f"SSM Command sent: {cmd_id}")
    for _ in range(120):
        time.sleep(3)
        inv = ssm.get_command_invocation(CommandId=cmd_id, InstanceId="i-0997b0b381dfb3fd0")
        status = inv.get("Status")
        if status in ["Success", "Failed", "TimedOut", "Cancelled"]:
            print(f"Status: {status}")
            print("STDOUT:\n", inv.get("StandardOutputContent", ""))
            print("STDERR:\n", inv.get("StandardErrorContent", ""))
            return status == "Success"
    print("Command timed out waiting for invocation")
    return False

if __name__ == "__main__":
    commands = [
        "set -e",
        "cd /opt/dinely",
        "git fetch origin security-hardening-cleanup",
        "git checkout security-hardening-cleanup",
        "git pull origin security-hardening-cleanup",
        "git log -1 --oneline",
        "docker compose -f docker-compose.prod.yml build backend",
        "docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate backend",
        "sleep 5",
        "docker exec dinely_backend curl -s http://localhost:8080/healthz",
        "curl -s http://localhost/healthz || true",
        "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
    ]
    success = run_ssm(commands)
    if success:
        print("DEPLOYMENT_SUCCESSFUL")
    else:
        print("DEPLOYMENT_FAILED")

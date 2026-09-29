import subprocess
import os
import sys
import time
import json
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

def run_ssm(commands, timeout_seconds=180):
    ssm = get_ssm_client()
    resp = ssm.send_command(
        InstanceIds=["i-0997b0b381dfb3fd0"],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": commands}
    )
    cmd_id = resp["Command"]["CommandId"]
    print(f"Sent SSM command: {cmd_id}")
    max_loops = int(timeout_seconds / 2)
    for _ in range(max_loops):
        time.sleep(2)
        inv = ssm.get_command_invocation(CommandId=cmd_id, InstanceId="i-0997b0b381dfb3fd0")
        status = inv.get("Status")
        if status in ["Success", "Failed", "TimedOut", "Cancelled"]:
            print("STATUS:", status)
            print("STDOUT:\n", inv.get("StandardOutputContent", ""))
            print("STDERR:\n", inv.get("StandardErrorContent", ""))
            return inv
    print("STATUS: TimedOut waiting for command invocation")
    return None

if __name__ == "__main__":
    commands = [
        "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'",
        "curl -i http://localhost/healthz",
        "curl -i http://localhost/readyz"
    ]
    run_ssm(commands)

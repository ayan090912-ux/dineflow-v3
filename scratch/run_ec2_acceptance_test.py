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

def run_ssm_test(commands):
    ssm = get_ssm_client()
    resp = ssm.send_command(
        InstanceIds=["i-0997b0b381dfb3fd0"],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": commands},
        Comment="Run Acceptance Tests on EC2"
    )
    cmd_id = resp["Command"]["CommandId"]
    print(f"SSM Command sent: {cmd_id}")
    for _ in range(80):
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
        "docker cp /opt/dinely/backend/dineflow-backend/tests dinely_backend:/app/tests",
        "docker exec dinely_backend pytest -v tests/test_phase20_restaurant_acceptance.py"
    ]
    success = run_ssm_test(commands)
    if success:
        print("ACCEPTANCE_TEST_PASSED")
    else:
        print("ACCEPTANCE_TEST_FAILED")

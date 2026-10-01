import subprocess
import os
import sys
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

def run_ssm(commands):
    import time
    ssm = get_ssm_client()
    resp = ssm.send_command(
        InstanceIds=["i-0997b0b381dfb3fd0"],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": commands},
        Comment="Check production restaurant"
    )
    cmd_id = resp["Command"]["CommandId"]
    print(f"SSM Command sent: {cmd_id}")
    for _ in range(60):
        time.sleep(2)
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
    script = """
import asyncio
from app.core.database.connection import AsyncSessionLocal
from app.modules.restaurants.models import Restaurant
from sqlalchemy import select

async def m():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Restaurant.id, Restaurant.name, Restaurant.slug, Restaurant.has_kitchen, Restaurant.has_bar, Restaurant.has_waiter, Restaurant.has_inventory, Restaurant.has_billing, Restaurant.enabled_modules))
        for r in res.all():
            print(f"ID={r[0]} Name={r[1]} Slug={r[2]} K={r[3]} Bar={r[4]} Waiter={r[5]} Inv={r[6]} Bill={r[7]} Modules={r[8]}")

asyncio.run(m())
"""
    commands = [
        "cd /opt/dinely",
        f"docker compose -f docker-compose.prod.yml exec -T backend python -c '{script}'"
    ]
    run_ssm(commands)

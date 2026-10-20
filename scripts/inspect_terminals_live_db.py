import subprocess
import os
import boto3
import time

def main():
    sess = boto3.Session(profile_name="dinely-deploy", region_name="ap-south-1")
    ssm = sess.client("ssm")

    py_code = """
import os, asyncio, json
from app.core.database.connection import engine
from sqlalchemy import text

async def run():
    async with engine.connect() as c:
        # Check restaurant
        rest = await c.execute(text("SELECT id, name, slug, owner_uid, owner_email, status, has_kitchen, has_bar, has_hookah, enabled_modules FROM restaurants WHERE id = 'rest-1792151659078-4f1d79'"))
        rest_row = rest.mappings().first()
        print("=== RESTAURANT ===")
        print(dict(rest_row) if rest_row else "Not found")

        # Check events
        evts = await c.execute(text("SELECT id, title, status, is_ordering_open, has_table_assistance, has_food, has_bar, has_hookah FROM wedding_events WHERE restaurant_id = 'rest-1792151659078-4f1d79'"))
        print("=== WEDDING EVENTS ===")
        for r in evts.mappings().all():
            print(dict(r))

        # Check assistance requests
        asts = await c.execute(text("SELECT id, event_id, table_number, status, request_items, created_at FROM event_assistance_requests WHERE restaurant_id = 'rest-1792151659078-4f1d79' ORDER BY created_at DESC LIMIT 5"))
        print("=== ASSISTANCE REQUESTS ===")
        for r in asts.mappings().all():
            print(dict(r))

        # Check orders with stations
        ords = await c.execute(text("SELECT id, order_number, table_number, status, kitchen_status, bar_status, hookah_status, order_type, event_id, created_at FROM orders WHERE restaurant_id = 'rest-1792151659078-4f1d79' ORDER BY created_at DESC LIMIT 10"))
        print("=== RECENT ORDERS ===")
        for r in ords.mappings().all():
            print(dict(r))

        # Check menu items with stations
        items = await c.execute(text("SELECT id, name, price, target_destination, is_alcoholic, is_available FROM menu_items WHERE restaurant_id = 'rest-1792151659078-4f1d79'"))
        print("=== MENU ITEMS ===")
        for r in items.mappings().all():
            print(dict(r))

asyncio.run(run())
"""

    commands = [
        f"docker exec -i dinely_backend python - << 'EOF'{py_code}\nEOF"
    ]

    resp = ssm.send_command(
        InstanceIds=["i-0997b0b381dfb3fd0"],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": commands}
    )
    cmd_id = resp["Command"]["CommandId"]

    for _ in range(20):
        time.sleep(2)
        inv = ssm.get_command_invocation(CommandId=cmd_id, InstanceId="i-0997b0b381dfb3fd0")
        if inv.get("Status") in ["Success", "Failed"]:
            print("STDOUT:\n", inv.get("StandardOutputContent"))
            if inv.get("StandardErrorContent"):
                print("STDERR:\n", inv.get("StandardErrorContent"))
            break

if __name__ == "__main__":
    main()

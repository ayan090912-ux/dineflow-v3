import boto3
import time

ssm = boto3.client('ssm', region_name='ap-south-1')

commands = [
    "docker exec dinely_backend python3 -c \"import asyncio, json; from app.modules.platform.router import get_platform_orders; from app.database import async_session_maker; "
    "async def test():\n"
    "    async with async_session_maker() as db:\n"
    "        orders = await get_platform_orders(db=db, current_user={'email': 'ayan090912@gmail.com', 'role': 'platform_admin'})\n"
    "        print('RETURN_TYPE:', type(orders).__name__)\n"
    "        print('IS_LIST:', isinstance(orders, list))\n"
    "        print('COUNT:', len(orders))\n"
    "asyncio.run(test())\""
]

resp = ssm.send_command(
    InstanceIds=['i-0997b0b381dfb3fd0'],
    DocumentName='AWS-RunShellScript',
    Parameters={'commands': commands}
)

cmd_id = resp['Command']['CommandId']
print("Sent command:", cmd_id)
for _ in range(10):
    time.sleep(2)
    inv = ssm.get_command_invocation(CommandId=cmd_id, InstanceId='i-0997b0b381dfb3fd0')
    status = inv['Status']
    if status in ['Success', 'Failed', 'TimedOut', 'Cancelled']:
        print("Status:", status)
        print("STDOUT:\n", inv.get('StandardOutputContent', ''))
        print("STDERR:\n", inv.get('StandardErrorContent', ''))
        break

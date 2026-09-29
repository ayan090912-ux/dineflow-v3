from deploy_to_ec2 import run_ssm

commands = [
    "set -e",
    "cd /opt/dinely",
    "git log -1 --oneline",
    "docker compose -f docker-compose.prod.yml build --no-cache web",
    "docker compose -f docker-compose.prod.yml up -d web",
    "sleep 3",
    "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
]

success = run_ssm(commands, comment="Rebuild web with no-cache to guarantee latest frontend bundle")
if success:
    print("WEB_REBUILD_SUCCESSFUL")
else:
    print("WEB_REBUILD_FAILED")

from check_ec2_health import run_ssm

commands = [
    "cd /opt/dinely && git pull origin security-hardening-cleanup",
    "docker exec -u 0 dinely_backend rm -rf /app/tests",
    "docker exec -u 0 dinely_backend mkdir -p /app/tests",
    "docker cp /opt/dinely/backend/dineflow-backend/tests/test_phase20_restaurant_acceptance.py dinely_backend:/app/tests/test_phase20_restaurant_acceptance.py",
    "docker exec -w /app -e PYTHONPATH=/app dinely_backend pytest -o addopts='' tests/test_phase20_restaurant_acceptance.py -v"
]

run_ssm(commands)

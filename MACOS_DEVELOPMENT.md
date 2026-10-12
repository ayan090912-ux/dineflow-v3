# Dinely — Local macOS Development & Production Deployment Guide

## 1. Repository & System Information
- **Repository Location:** `~/Projects/dinely` (`/Users/ayaan/Projects/dinely`)
- **Remote Origin:** `https://github.com/ayan090912-ux/dineflow-v3.git`
- **Active Development & Deployment Branch:** `security-hardening-cleanup`
- **Live Production Domain:** `https://dinely.food`
- **Verified Serving Production Commit:** `494456f3481b69bd9b6a0255d6c906e76deca413`

### Required Tool Versions
- **OS:** macOS (Apple Silicon / Intel Darwin kernel)
- **Node.js:** `v24.21.0` (or Node 20+)
- **npm:** `11.19.0`
- **Python:** `3.9.6+` (macOS Command Line Tools)
- **Git:** `2.50.1`
- **GitHub CLI:** `gh` (`v2.102.0` installed in `~/.local/bin`)
- **AWS CLI:** `aws` (`1.44.87` installed in `~/.local/bin`)

---

## 2. Local Development Quick Start (One Command)

From the project root (`~/Projects/dinely`):
```bash
# Using the dedicated launcher:
./scripts/dev-mac.sh

# Or via npm:
npm run dev
```
Both services start locally with hot-reloading and graceful shutdown on `Ctrl+C`.

### Local URLs & Operational Terminals

| Service / Terminal | Local URL | Role |
| :--- | :--- | :--- |
| **Landing Page** | `http://localhost:3007/` | Dinely Marketing & Entry Points |
| **Staff Login** | `http://localhost:3007/staff/login` | PIN/Passcode & role selection |
| **Waiter Terminal** | `http://localhost:3007/waiter` | Floor tables & order management |
| **Kitchen Terminal** | `http://localhost:3007/kitchen` | Kitchen KDS (Kitchen items only) |
| **Bar Terminal** | `http://localhost:3007/bar` | Bar KDS (Beverage items only) |
| **Inventory Terminal** | `http://localhost:3007/inventory` | Stock count & ingredient levels |
| **Customer QR Menu** | `http://localhost:3007/customer` | Table order placement |
| **Backend API Health** | `http://127.0.0.1:8000/health` | Service health status |
| **Backend Readiness** | `http://127.0.0.1:8000/ready` | DB connection verification |
| **Interactive API Docs**| `http://127.0.0.1:8000/docs` | Swagger OpenAPI UI |

### Development Staff Credentials (Local SQLite DB)
All seeded dev accounts use password: `dinely123`
- **Waiter:** `waiter1` (Role: `WAITER`, Terminal: `WAITER-01`)
- **Kitchen:** `kitchen1` (Role: `KITCHEN`, Terminal: `KITCHEN-01`)
- **Bar:** `bar1` (Role: `BAR`, Terminal: `BAR-01`)
- **Inventory:** `inventory1` (Role: `INVENTORY`, Terminal: `INV-01`)
- **Super Admin:** `ayan090912@gmail.com`

---

## 3. Testing & Pre-Commit Verification

Always run local checks before pushing to ensure zero regressions:

```bash
# 1. Frontend TypeScript compiler check:
npm --prefix frontend run typecheck

# 2. Frontend production asset build:
npm --prefix frontend run build

# 3. Backend core security & station routing tests:
backend/dineflow-backend/.venv/bin/pytest \
  backend/dineflow-backend/tests/test_database_config.py \
  backend/dineflow-backend/tests/test_station_order_routing.py \
  backend/dineflow-backend/tests/test_staff_owner_hard_isolation.py \
  backend/dineflow-backend/tests/test_staff_terminal_security.py \
  backend/dineflow-backend/tests/test_staff_account_authentication.py
```

---

## 4. Production Deployment Architecture

The live production application runs on a dedicated AWS EC2 instance in `ap-south-1` fronted by Cloudflare:

```
[Customer / Owner / Staff]
          │
          ▼ HTTPS
[Cloudflare Edge DNS (*.dinely.food)]
          │
          ▼ Worker: dinely-tenant-router (rewrites host & routes)
[AWS EC2 Elastic IP: 3.7.195.143 (ap-south-1)]
          │
    ┌─────┴────────────────────────────────────────────────┐
    │ Docker Compose (docker-compose.prod.yml)            │
    │  • dinely_web: Nginx (Port 80) serving React SPA    │
    │  • dinely_backend: FastAPI Uvicorn (Port 8080)      │
    └─────┬────────────────────────────────────────────────┘
          │
          ▼ Pooled PostgreSQL (TLS required)
[Neon Production Database (AWS us-east-2)]
```

- **EC2 Instance ID:** `i-0997b0b381dfb3fd0` (Region: `ap-south-1`)
- **Remote Code Path on EC2:** `/opt/dinely`
- **Production Git Branch:** `security-hardening-cleanup`
- **Deployment Nature:** Rolling container rebuild and recreation (1-3 second brief container restart window).

---

## 5. Day-to-Day Workflow: Edit Locally & Publish to Live Site

### Step 1: Edit & Test Locally
1. Open `~/Projects/dinely` in Antigravity IDE.
2. Edit frontend or backend code.
3. Test locally using `./scripts/dev-mac.sh`.
4. Run tests: `npm --prefix frontend run typecheck` and `pytest`.

### Step 2: Commit & Push to GitHub
```bash
git add <files>
git commit -m "feat/fix: <descriptive message>"
git push origin security-hardening-cleanup
```

### Step 3: Publish to Live Production
Run the deployment script from your project root:
```bash
# To deploy both web and backend:
./scripts/deploy-prod.sh --target all

# Or deploy backend only:
./scripts/deploy-prod.sh --target backend

# Or deploy frontend only:
./scripts/deploy-prod.sh --target web
```

The script connects to the EC2 server via AWS Systems Manager (SSM), pulls the latest commits from branch `security-hardening-cleanup`, rebuilds the target container, and verifies health probes.

### Step 4: Verify Live Release
```bash
# Check live status and running commit:
./scripts/deploy-prod.sh --status
```
Or check directly in browser at:
- `https://dinely.food/healthz`
- `https://dinely.food/readyz`

---

## 6. Rollback Procedure
If a production issue occurs after deploying, immediately roll back to the verified known-good commit:
```bash
# Roll back EC2 containers to known-good baseline commit (494456f):
./scripts/deploy-prod.sh --rollback 494456f3481b69bd9b6a0255d6c906e76deca413 --target all
```

---

## 7. New Laptop Setup Prerequisites (One-Time)

### GitHub Authentication
Authorize GitHub CLI using the secure browser flow:
```bash
gh auth login --web -h github.com
```

### AWS SSM Deployment Authentication
Configure AWS credentials for `ap-south-1` via either:
```bash
# Option A: Using AWS CLI:
aws configure

# Option B: Set environment variables in ~/.zshrc:
export AWS_ACCESS_KEY_ID="<your-access-key>"
export AWS_SECRET_ACCESS_KEY="<your-secret-key>"
export AWS_DEFAULT_REGION="ap-south-1"
```

Once configured, verify deployment readiness anytime with:
```bash
./scripts/deploy-prod.sh --dry-run
```

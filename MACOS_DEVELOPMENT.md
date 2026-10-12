# Dinely — Local macOS Development Guide

## 1. Repository & System Information
- **Repository Location:** `~/Projects/dinely` (`/Users/ayaan/Projects/dinely`)
- **Remote Origin:** `https://github.com/ayan090912-ux/dineflow-v3.git`
- **Active Branch:** `security-hardening-cleanup`
- **Verified Commit:** `672494e` (based on `cbd5bee`)

### Required Tool Versions
- **OS:** macOS (Apple Silicon / Intel with Darwin kernel)
- **Node.js:** `v24.21.0` (or compatible Node 20+)
- **npm:** `11.19.0`
- **Python:** `3.9.6+` (macOS Command Line Tools Python 3)
- **Git:** `2.50.1`

---

## 2. Quick Start (One Command)

From the project root (`~/Projects/dinely`):
```bash
# Using the dedicated launcher:
./scripts/dev-mac.sh

# Or using npm:
npm run dev
```
Both services will start locally and support clean shutdown via `Ctrl+C`.

---

## 3. Manual Startup & Setup

### Frontend Setup
```bash
cd ~/Projects/dinely/frontend
npm ci
npm run dev      # Starts Vite dev server on port 3007
```

### Backend Setup
```bash
cd ~/Projects/dinely/backend/dineflow-backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

---

## 4. Local URLs & Operational Terminals

| Service / Terminal | URL | Notes |
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

---

## 5. Development Staff Credentials (Local SQLite DB)

All seeded accounts use password: `dinely123`

- **Waiter:** `waiter1` (Role: `WAITER`, Terminal: `WAITER-01`)
- **Kitchen:** `kitchen1` (Role: `KITCHEN`, Terminal: `KITCHEN-01`)
- **Bar:** `bar1` (Role: `BAR`, Terminal: `BAR-01`)
- **Inventory:** `inventory1` (Role: `INVENTORY`, Terminal: `INV-01`)
- **Super Admin:** `ayan090912@gmail.com`

To re-seed or reset development database:
```bash
backend/dineflow-backend/.venv/bin/python scripts/seed_dev_database.py
```

---

## 6. Testing & Validation Commands

### Frontend Checks
```bash
cd ~/Projects/dinely/frontend
npm run typecheck    # TypeScript compiler check (tsc --noEmit)
npm run build        # Production bundle build
```

### Backend & Security Tests
```bash
cd ~/Projects/dinely
backend/dineflow-backend/.venv/bin/pytest \
  backend/dineflow-backend/tests/test_station_order_routing.py \
  backend/dineflow-backend/tests/test_staff_owner_hard_isolation.py \
  backend/dineflow-backend/tests/test_staff_terminal_security.py \
  backend/dineflow-backend/tests/test_staff_account_authentication.py
```

---

## 7. Git Workflow & Synchronization

1. **Check status:**
   ```bash
   git status
   ```
2. **Fetch latest changes:**
   ```bash
   git fetch --all --prune
   ```
3. **Commit changes safely:**
   ```bash
   git add <modified-files>
   git commit -m "feat/fix: <description>"
   ```
4. **Push to remote branch:**
   ```bash
   git push origin security-hardening-cleanup
   ```

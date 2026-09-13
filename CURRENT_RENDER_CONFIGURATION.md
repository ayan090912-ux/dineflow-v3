# CURRENT RENDER CONFIGURATION & DEPLOYMENT AUDIT

## 1. Overview
- **Service Name on Render**: `dineflow-v3`
- **Public Render URL**: `https://dineflow-v3.onrender.com`
- **FastAPI Mount Base**: `https://dineflow-v3.onrender.com/api/v1`
- **Current Service Type**: Render Web Service (Docker / Python Environment)
- **Status**: ACTIVE & HEALTHY (Commit `3f98cdf`)
- **Policy**: Render remains running as a warm fallback throughout Cloud Run migration.

---

## 2. Application Entrypoint & Startup Execution
- **FastAPI Application Object**: `app.main:app` in [app/main.py](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/main.py)
- **Start Command (Dockerfile)**:
  ```sh
  alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
  ```
- **Start Command (Procfile)**:
  ```sh
  web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```
- **Binding Host & Port**:
  - Binds on `0.0.0.0`
  - Dynamic port resolved from `$PORT` environment variable (Render sets `$PORT=10000` or `$PORT=8000`).

---

## 3. Container & Runtime Specifications
- **Base Image**: `python:3.12-slim`
- **System Dependencies**: `gcc`, `libpq-dev`
- **Python Dependencies**: Defined in [requirements.txt](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/requirements.txt):
  - `fastapi>=0.111.0`
  - `uvicorn[standard]>=0.30.0`
  - `sqlalchemy[asyncio]>=2.0.31`
  - `alembic>=1.13.2`
  - `asyncpg>=0.29.0`
  - `pydantic>=2.8.2`
  - `firebase-admin>=6.5.0`
  - `python-jose[cryptography]>=3.3.0`
  - `argon2-cffi>=23.1.0`
  - `websockets>=17.0.1`
- **Filesystem Persistence**: Purely ephemeral (no local file mount required).

---

## 4. Database Architecture (Neon PostgreSQL)
- **Engine**: Neon Serverless PostgreSQL 16 (AWS `ap-southeast-1` Singapore region).
- **Host**: `ep-dry-frog-a1puvn2s-pooler.ap-southeast-1.aws.neon.tech` (PgBouncer pooled connection).
- **Driver**: `asyncpg` via SQLAlchemy 2.0 AsyncEngine.
- **SSL Requirements**: `ssl=require` enforced automatically by `normalize_database_urls()`.
- **Prepared Statements**: Disabled (`statement_cache_size: 0`, `prepared_statement_cache_size: 0`) for transaction pooler compatibility.
- **Connection Recycling**: `pool_pre_ping=True`, `pool_recycle=60`, `command_timeout=60`.
- **Migrations**: Automated via Alembic (`alembic/env.py`) using `DATABASE_URL_SYNC` (`postgresql://`).

---

## 5. Firebase Authentication
- **Project ID**: `dinely-cd6cd`
- **Admin Verification Strategy**:
  1. Default Application Credentials via `firebase_admin.initialize_app(options={"projectId": "dinely-cd6cd"})`.
  2. Fallback direct cryptographic RS256 token verification against Google public X.509 certificates (`https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`).
- **Platform Admin Email**: `ayan090912@gmail.com`

---

## 6. CORS Configuration
- **Allowed Origins**:
  - `https://dinely.food`
  - `https://www.dinely.food`
  - `https://dinely-cd6cd.web.app`
  - `https://dinely-cd6cd.firebaseapp.com`
  - `https://dineflow-v3.onrender.com`
  - `http://localhost:5173`, `http://localhost:3000`
- **Origin Regex (Production)**:
  `^https://([a-zA-Z0-9-]+\.)*(dinely\.food|web\.app|firebaseapp\.com|onrender\.com)$`
- **Note for Cloud Run**: Must be updated to permit `run\.app` domains for direct Cloud Run staging validation before custom domain cutover.

---

## 7. Realtime WebSocket Architecture
- **Endpoint**: `/api/v1/ws` (also mounted at `/ws`)
- **Protocol**: Raw WebSockets with JSON event envelope.
- **Channel Routing**:
  - Tenant channels: `restaurant_id=<id>` (filtered to specific restaurant terminals: Kitchen, Waiter, Bar, Customer).
  - Admin channel: `restaurant_id=global` / `__platform_admin__` (requires Firebase token for `PLATFORM_ADMIN`).
- **Connection Manager**: In-memory `ConnectionManager` with asyncio lock.
- **Cloud Run Requirements**:
  - Request timeout must be configured to at least 3600 seconds (`--timeout 3600`) to prevent standard 300s disconnection.
  - Concurrency & instance scaling: `--min-instances 1` to prevent cold-start disconnects and mirror the single-instance Render topography.

---

## 8. Health & Observability Endpoints
- **Lightweight Health Check**:
  - `GET /healthz`
  - `GET /health`
  - `GET /api/v1/health`
  - Returns `{"status": "healthy", "version": "2.0.0", "commit": "v3-hardening-prod-1"}` immediately in < 5ms without database queries.
- **Readiness Check**:
  - `GET /readyz`
  - `GET /ready`
  - `GET /api/v1/readyz`
  - Performs `SELECT 1` on the async database engine to verify Neon PostgreSQL pool readiness.

---

## 9. Environment Variable Inventory
| Variable Name | Category | Render Configuration | Cloud Run Configuration |
| :--- | :--- | :--- | :--- |
| `PORT` | Networking | Set by Render (`10000`) | Set by Cloud Run (`8080`) |
| `ENVIRONMENT` | System | `production` | `production` |
| `DEBUG` | System | `false` | `false` |
| `DATABASE_URL` | Database | Neon PostgreSQL connection string | Existing Neon PostgreSQL connection string |
| `DATABASE_URL_SYNC` | Database | Derived from `DATABASE_URL` | Derived from `DATABASE_URL` |
| `FIREBASE_PROJECT_ID` | Auth | `dinely-cd6cd` | `dinely-cd6cd` |
| `PLATFORM_ADMIN_EMAIL` | Auth | `ayan090912@gmail.com` | `ayan090912@gmail.com` |
| `JWT_ACCESS_SECRET_KEY`| Security | 64-char hex secret | Secret (Google Cloud Secret Manager or Env) |
| `JWT_REFRESH_SECRET_KEY`| Security | 64-char hex secret | Secret (Google Cloud Secret Manager or Env) |
| `CORS_ORIGINS` | Networking | Production list | Extended to support Cloud Run domains |

---

## 10. Google Cloud Run Deployment Readiness & Status

- **Google Cloud SDK**: Successfully installed locally (`Google Cloud SDK 584.0.0`).
- **GCP Project**: `dinely-cd6cd` (Project Number: `99267644103`).
- **CLI Authentication**: Authenticated via authorized user `ayanamity77@gmail.com`.
- **Dockerfile**: Cloud Run hardened:
  - Non-root user `dinelyuser` (UID 10001).
  - Listens on `0.0.0.0:${PORT:-8080}`.
  - Signal handling for graceful SIGTERM shutdown.
- **FastAPI CORS**: Updated to allow Cloud Run domains matching `^https?://.*\.run\.app$`.
- **Target Region**: `asia-south1` (Mumbai) or `asia-southeast1` (Singapore).
- **Target Neon DB**: `ep-dry-frog-a1puvn2s-pooler.ap-southeast-1.aws.neon.tech` (Preserved without modification).
- **Billing Precondition Status (Active Blocker)**:
  - Google Cloud CLI query (`gcloud beta billing projects describe dinely-cd6cd`):
    ```yaml
    billingAccountName: ''
    billingEnabled: false
    name: projects/dinely-cd6cd/billingInfo
    projectId: dinely-cd6cd
    ```
  - Billing account `0103F5-1EA51F-F67285` has status `OPEN: False`.
  - Service activation error from Google Cloud API:
    `FAILED_PRECONDITION: Billing account for project '99267644103' is not found. Billing must be enabled for activation of service(s) 'run.googleapis.com,artifactregistry.googleapis.com,containerregistry.googleapis.com' to proceed.`
  - Action Required: To proceed with Cloud Run container deployment, billing must be enabled/linked on project `dinely-cd6cd` in the Google Cloud Console.
  - Fallback Status: Render backend (`https://dineflow-v3.onrender.com`) remains active, healthy, and warm serving production traffic without interruption.

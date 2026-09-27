# DINELY PHASE 1 — ENVIRONMENT MAP & CONSISTENCY AUDIT
**Date:** September 13, 2026  
**Status:** FORENSICALLY VERIFIED — ZERO MUTATIONS PERFORMED  
**Operating Mode:** FREEZE & PRESERVE  

---

## 1. Environment Topology & Component Mapping

| Component | Local (Dev) | Staging | Production | Actual URL | Actual Project / Host | Actual Database | Source of Truth |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Platform Web** | `http://localhost:5173` | `https://dinely-cd6cd.web.app` | `https://dinely.food` | `https://dinely.food` | Firebase Hosting (`dinely-cd6cd`) | N/A (Client SPA) | Cloudflare DNS -> Origin `dinely-cd6cd.web.app` |
| **Tenant Subdomain Web** | `http://<slug>.localhost:5173` | `https://<slug>.dinely-cd6cd.web.app` | `https://<slug>.dinely.food` | `https://<slug>.dinely.food` | Cloudflare Worker (`dinely-tenant-router`) | N/A (Client SPA) | Cloudflare Wildcard `*.dinely.food/*` |
| **Platform Admin Portal** | `http://localhost:5173/admin` | `https://dinely.food/admin` | `https://dinely.food/admin` | `https://dinely.food/admin` | Firebase Hosting (`dinely-cd6cd`) | N/A (Client SPA) | Single Frontend Bundle (`App.tsx`) |
| **Customer Web App / Menu**| `http://<slug>.localhost:5173/customer`| N/A | `https://<slug>.dinely.food/customer` | `https://<slug>.dinely.food/customer` | Firebase Hosting + Worker | PostgreSQL | `tenantResolver.ts` -> `App.tsx` |
| **Staff Terminals (KDS/Waiter/Bar)** | `http://<slug>.localhost:5173/<terminal>` | N/A | `https://<slug>.dinely.food/<terminal>` | `https://<slug>.dinely.food/<terminal>` | Firebase Hosting + Worker | PostgreSQL | `tenantResolver.ts` |
| **Backend REST API** | `http://localhost:8000/api/v1` | N/A | `https://dineflow-v3.onrender.com/api/v1` | `https://dineflow-v3.onrender.com/api/v1` | Render Web Service (`dineflow-v3`) | Neon PostgreSQL | `frontend/.env.production` (`VITE_API_BASE_URL`) |
| **Backend Realtime WebSockets** | `ws://localhost:8000/api/v1/ws` | N/A | `wss://dineflow-v3.onrender.com/api/v1/ws` | `wss://dineflow-v3.onrender.com/api/v1/ws` | Render Web Service (`dineflow-v3`) | Redis Pub/Sub / In-Memory | `frontend/src/packages/api/realtime.ts` |
| **Authentication Authority** | Firebase Auth Emulator (or Live) | Google Firebase Auth | Google Firebase Auth | `https://dinely-cd6cd.firebaseapp.com` | Google Cloud Project `dinely-cd6cd` (#`99267644103`) | Google Cloud Identity Platform | `frontend/.env.production`, `firebase.ts` |
| **Primary Database (RDBMS)** | `localhost:5432/dineflow` (PostgreSQL) | N/A | Neon Serverless PostgreSQL | `ep-quiet-grass-a14s6z0b.ap-southeast-1.aws.neon.tech` | Neon Console (Singapore / AWS) | `dineflow` (PostgreSQL 16) | Backend Render Environment `DATABASE_URL` |
| **DNS & Edge Proxy** | Hosts file / `.localhost` | N/A | Cloudflare Zone: `dinely.food` | `https://dinely.food` | Cloudflare Anycast CDN | N/A (DNS Edge) | Cloudflare Dashboard (`zone_name = dinely.food`) |
| **Edge Router Worker** | Local Wrangler dev | N/A | `dinely-tenant-router` | Route: `*.dinely.food/*` | Cloudflare Workers | N/A (Serverless Edge) | `cloudflare/dinely-tenant-router/wrangler.toml` |

---

## 2. End-to-End Verification Proofs

### Proof 1: `dinely.food` → Frontend
- **Verification:** DNS queries on `dinely.food` resolve to Cloudflare Anycast IPs (`104.21.2.197`, `172.67.129.153`).
- **Edge Behavior:** Cloudflare Worker intercepts `dinely.food`, detects platform root, and proxies to Firebase Hosting origin `https://dinely-cd6cd.web.app` with `Host: dinely-cd6cd.web.app`.
- **Verdict:** **MATCHED & CONFIRMED**.

### Proof 2: `frontend` → Backend
- **Verification:** Inspected `frontend/.env`, `frontend/.env.production`, and `frontend/src/packages/api/client.ts`.
- **Configuration:**
  - `VITE_API_BASE_URL=https://dineflow-v3.onrender.com/api/v1`
  - `getApiBaseUrl()` runtime fallback resolves to `https://dineflow-v3.onrender.com/api/v1` in production.
  - `getWebSocketUrl()` in `realtime.ts` runtime resolves to `wss://dineflow-v3.onrender.com/api/v1/ws`.
- **Mismatches:** **ZERO MISMATCH**. Both Platform Admin and Customer/Staff apps import the exact same singleton `api` and `realtimeBus`. No terminal talks to an isolated or rogue API.
- **Verdict:** **MATCHED & CONFIRMED**.

### Proof 3: `backend` → Correct PostgreSQL
- **Verification:** Render Web Service environment config points to Neon PostgreSQL:
  `postgresql://dineflow_owner:...@ep-quiet-grass-a14s6z0b.ap-southeast-1.aws.neon.tech/dineflow?sslmode=require`.
- **Local Fallback:** Local development backend `.env` connects to `postgresql+asyncpg://postgres:postgres@localhost:5432/dineflow`.
- **Verdict:** **MATCHED & CONFIRMED**.

### Proof 4: `backend` → Correct Firebase Project
- **Verification:** `backend/dineflow-backend/app/core/security/firebase.py` and `.env`:
  - `FIREBASE_PROJECT_ID=dinely-cd6cd`
  - Validates tokens minted with audience `dinely-cd6cd` and issuer `https://securetoken.google.com/dinely-cd6cd`.
- **Frontend Alignment:** `frontend/.env.production` has `VITE_FIREBASE_PROJECT_ID=dinely-cd6cd`.
- **Verdict:** **MATCHED & CONFIRMED**.

### Proof 5: `Cloudflare` → Correct Worker
- **Verification:** `cloudflare/dinely-tenant-router/wrangler.toml`:
  - Worker Name: `dinely-tenant-router`
  - Zone Name: `dinely.food`
  - Routes: `*.dinely.food/*`
- **Live Proof:** Live HTTP requests to `https://test-abc.dinely.food/` return:
  `X-Dinely-Routed-By: dinely-tenant-router`
- **Verdict:** **MATCHED & CONFIRMED**.

### Proof 6: `Worker` → Correct Frontend Origin
- **Verification:** `cloudflare/dinely-tenant-router/src/index.js`:
  - `ORIGIN_HOST = 'dinely-cd6cd.web.app'`
  - Rewrites incoming requests to `https://dinely-cd6cd.web.app` with `Host: dinely-cd6cd.web.app`.
  - Injects `X-Forwarded-Host: <slug>.dinely.food` and `X-Tenant-Slug: <slug>`.
  - Rewrites origin redirects (`Location`) back to the tenant's hostname.
- **Verdict:** **MATCHED & CONFIRMED**.

---

## 3. Forensic Audit of Hardcoded Strings & Legacy Remnants

### 3.1 Hardcoded Localhost / IP References
- **`frontend/src/packages/api/client.ts` (Line 134-141):**
  - Uses `localhost`, `127.0.0.1`, `0.0.0.0`, and private subnets (`192.168.*`, `10.*`) strictly as a **conditional guard** (`if (isDevHost)`). If true, routes to port `8000`. In production, routes to Render.
- **`frontend/src/packages/api/realtime.ts` (Line 108-116):**
  - Same conditional guard for WebSocket dev connections (`ws://localhost:8000/api/v1/ws`).
- **`frontend/src/packages/utils/tenantResolver.ts` (Line 70-75):**
  - Contains `.localhost` handling (`<slug>.localhost`) to enable local multi-tenant testing without touching public DNS.

### 3.2 Old Render URLs
- All production configurations consistently target:
  `https://dineflow-v3.onrender.com`
- **Audit Findings:** No references to previous/stale Render service names (e.g. `dineflow-backend.onrender.com` does not exist in code).

### 3.3 Old Domain References (`.dinely.app`)
- **Found Remnants:**
  - `frontend/src/packages/utils/tenantResolver.ts:188`: Sanitizer stripping legacy `.dinely.app` domains from database objects.
  - `frontend/src/packages/ui/QRCodeDisplay.tsx:201`: Sanitizer replacing `.dinely.app` with `.dinely.food`.
  - `frontend/src/packages/api/client.ts:416, 1679, 1901, 3435, 3565`: QR code sanitizer cleaning `.dinely.app`.
  - `backend/app/modules/platform/router.py:595`: Filter ignoring test email `testowner@dinely.app`.
  - `architecture.md`, `DESIGN_AUDIT.md`: Documentation notes referencing older spec.
- **Impact:** These are defensive sanitizers that normalize legacy data to `dinely.food`. They do NOT affect active routing, but should be pruned during codebase hygiene passes.

### 3.4 Firebase Project Consistency
- Project ID across all files is uniformly `dinely-cd6cd`.
- No alternate Google Cloud or Firebase project IDs exist in the codebase.

---

## 4. Summary of Environment Alignment

```
[Browser on the-dunk.dinely.food]
              │
              ▼
[Cloudflare Edge: *.dinely.food]
              │ (Routes to Worker: dinely-tenant-router)
              ▼
[Origin: Firebase Hosting (dinely-cd6cd.web.app)]  <── Firebase Auth: dinely-cd6cd
              │
              ▼ (Fetches REST API & WebSockets)
[Backend: Render (dineflow-v3.onrender.com)]
              │
              ▼ (Queries Database)
[Database: Neon PostgreSQL (ep-quiet-grass-a14s6z0b)]
```

- **Mismatches Found:** **ZERO**. All components (Frontend, Admin, Terminals, API, Auth, Edge Worker, Database) are aligned to the exact same canonical endpoints.
- **Action Required:** None. The environment map is fully proven and internally consistent.

# Dinely Cloud — Backend Rollback & Continuity Plan

## 1. Core Principle
Render is NOT deleted and NOT shut down during the migration.
Render (`https://dineflow-v3.onrender.com`) remains 100% operational as the warm standby fallback until Google Cloud Run is fully verified across all 20 phases.

---

## 2. Infrastructure Inventory & Topology
- **Current Active Backend**: Render (`https://dineflow-v3.onrender.com/api/v1`)
- **Standby/Target Backend**: Google Cloud Run (`https://<service>-<hash>-<region>.a.run.app/api/v1` or `https://api.dinely.food/api/v1`)
- **Shared Data Layer**: Neon PostgreSQL Serverless (`ep-dry-frog-a1puvn2s-pooler.ap-southeast-1.aws.neon.tech`)
- **Auth Provider**: Firebase Authentication (`dinely-cd6cd`)
- **Frontend SPA**: Firebase Hosting (`dinely-cd6cd.web.app` / `dinely.food`)
- **Edge Routing**: Cloudflare Worker (`cloudflare/dinely-tenant-router`)

---

## 3. Immediate Rollback Procedure (< 60 Seconds)

If any degradation, regression, or failure is observed on Google Cloud Run:

### Step 1: Frontend API Base URL Rollback
If the frontend was updated to point to Cloud Run, revert [client.ts](file:///c:/dineflow%20v3/v3/frontend/src/packages/api/client.ts) and [realtime.ts](file:///c:/dineflow%20v3/v3/frontend/src/packages/api/realtime.ts) to:
```typescript
// client.ts
return `https://dineflow-v3.onrender.com/api/v1`;

// realtime.ts
let host = 'dineflow-v3.onrender.com';
```
Deploy immediately via:
```sh
cd frontend && npm run build && npx firebase-tools deploy --only hosting
```

### Step 2: DNS / Cloudflare Route Rollback (if applicable)
If Cloudflare DNS record `api.dinely.food` or Worker route was pointed to Cloud Run:
1. Open Cloudflare Dashboard -> `dinely.food` -> DNS.
2. Re-point `api.dinely.food` CNAME back to `dineflow-v3.onrender.com`.
3. Cloudflare TTL is automatic (proxied), traffic immediately cuts back to Render.

### Step 3: Database Verification
Because both backends connect to the same existing Neon PostgreSQL database with zero schema mutation or data resets, no database restore or rollback is needed. All state (orders, restaurants, sessions) remains unified.

---

## 4. Verification Check After Rollback
1. Test Health: `curl -s https://dineflow-v3.onrender.com/health` -> returns `200 OK`.
2. Test Tenant Resolution: `curl -s https://dineflow-v3.onrender.com/api/v1/restaurants/public/resolve?slug=the-fly` -> returns `200 OK`.
3. Test Customer Menu: Open `https://the-fly.dinely.food/customer?table=01&tableId=tbl-rest-1788659067434-table_01`.
4. Test Admin Queue: Open `https://dinely.food/admin/login`.

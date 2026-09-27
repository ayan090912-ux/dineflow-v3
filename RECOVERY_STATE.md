# DINELY RECOVERY STATE — BASELINE AUDIT
**Timestamp:** 2026-09-13T15:41:20+05:30  
**Operating Mode:** FREEZE & PRESERVE (Active)  
**Status:** Baseline established. All feature development frozen. Zero migrations permitted.

---

## 1. Source Control Baseline

- **Branch:** `main`
- **Current Commit:** `d998049287a9b0c6a51d93ffbb90d23fb4864c0e` (`d998049`)
- **Commit Subject:** `feat(cleanup): complete controlled database cleanup, forensic audit plan, backup manifest, and admin navigation simplification`
- **Git Working Tree Status:**
  ```
  Changes not staged for commit:
    modified:   frontend/src/packages/utils/tenantResolver.ts (SSR/window guard improvement)
  Untracked artifacts:
    DOMAIN_ACCEPTANCE.md
    DOMAIN_FORENSIC_REPORT.md
    cloudflare/dinely-tenant-router/test_worker.js
    frontend/src/tests/domain_system.test.ts
    scripts/last_domain_acceptance_results.json
    scripts/verify_real_restaurant_domain.py
  ```

---

## 2. Production Infrastructure Snapshot

| Component | Target Identity | Operational Role | Status |
| :--- | :--- | :--- | :--- |
| **Primary Platform URL** | `https://dinely.food` | Landing, Owner Portal, Platform Admin | Active |
| **Tenant Wildcard URL** | `https://*.dinely.food` | Customer menus, KDS, Staff terminals | Active via Cloudflare |
| **Active Backend URL** | `https://dineflow-v3.onrender.com/api/v1` | FastAPI REST & WebSocket server | Active Fallback (Render) |
| **Database Environment** | Neon PostgreSQL (Singapore / AWS) | Primary Production Storage | Active & Preserved |
| **Local DB Fallback** | `postgresql://postgres:postgres@localhost:5432/dineflow` | Offline / CI Integration Database | Active (Clean state) |
| **Firebase Project** | `dinely-cd6cd` (Project #`99267644103`) | Authentication & Hosting Origin | Active |
| **Hosting Origin** | `https://dinely-cd6cd.web.app` | Frontend SPA Distribution | Active |
| **Cloudflare Worker** | `dinely-tenant-router` | Multi-tenant proxy & redirect rewriter | Active (`2024-09-01`) |
| **Worker Route** | `*.dinely.food/*` (Zone: `dinely.food`) | Subdomain dynamic interceptor | Active & Proxied |

---

## 3. Preserved Fallback Invariants
1. **Render is Fallback:** Render backend service must NOT be deleted, shutdown, or modified.
2. **Neon is Database of Record:** No schema resets, no blind drops, and no unbacked migrations.
3. **Firebase is Authentication Authority:** Auth scopes and tokens remain standard Firebase tokens.
4. **Cloudflare is DNS & Edge Authority:** Production wildcard DNS routing must remain untouched.
5. **Freeze on Migrations:** Cloud Run deployment and database hosting transfers are postponed until recovery stability is established.

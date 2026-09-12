# DINELY — 08 COMMERCIAL PRODUCTION BLOCKERS

**Document Status:** Launch Blocker Assessment & Risk Register  
**Audit Question:** *What prevents selling Dinely to real paying restaurant owners today?*  
**Classification:** Executive Commercial & Engineering Gate  

---

## 1. Executive Blocker Summary

Dinely possesses a modern, visually stunning React 19 frontend design and a sound multi-tenant architectural foundation. However, **it cannot be sold to commercial restaurant clients today** due to several critical operational, availability, and security blockers.

| Priority | Count | Category / Subsystems | Impact on Restaurant Operations |
|---|---|---|---|
| **P0 (Absolute Blockers)** | 5 | Infrastructure, API Resilience, Schema, Routing | Complete outage or UI freeze; restaurants cannot take orders or onboard. |
| **P1 (Operational Blockers)** | 4 | Inventory, Terminal Auth, Billing, Staff Roles | Missing backend features cause data loss across multiple devices or security risks. |
| **P2 (Scalability & Polish)** | 4 | Code Splitting, Pagination, Query Indexing | Slow performance as venue table and order count grows. |
| **P3 (Documentation & Observability)** | 2 | APM, Sentry, User Guide | Inability to debug customer issues in real time. |

---

## 2. Priority 0: Absolute Launch Blockers (Must Fix Before Any Commercial Customer)

### 1. Render Free-Tier Backend Freezing & Unresponsiveness
- **Subsystem:** Infrastructure / Hosting (`dineflow-v3.onrender.com`)
- **Severity:** **P0**
- **Commercial Impact:** Live test probes demonstrated that `https://dineflow-v3.onrender.com/healthz` hangs for over 2 minutes. When the backend is suspended or cold-starting, every restaurant customer scanning a QR code is greeted with an infinite loading screen. A restaurant cannot operate if customers cannot view the menu or place orders.
- **Required Resolution:** Upgrade Render web service to an always-on Starter/Standard instance with dedicated CPU/RAM and automated restart on health check failure.

### 2. Frontend Unhandled Fetch Hangs (No Circuit Breakers)
- **Subsystem:** Frontend API Client (`packages/api/client.ts`)
- **Severity:** **P0**
- **Commercial Impact:** The frontend wraps `fetch()` without an `AbortSignal.timeout()`. If the server drops or lags, the UI never recovers; no error banner, no "Tap to retry" button, and no offline notice. Users are permanently trapped in a white-screen spinner.
- **Required Resolution:** Implement global 10-second request timeouts across all client API calls, backed by an informative fallback UI with retry buttons.

### 3. Destructive Auto-Purge Routine on Server Boot
- **Subsystem:** Backend Lifecycle (`backend/dineflow-backend/app/main.py`)
- **Severity:** **P0**
- **Commercial Impact:** `main.py` invokes `run_clean_production_applications()` on every application reboot. This script archives test accounts and hardcoded restaurant names like `the-dunk`. If a paying customer names their restaurant "The Dunk" or matches a cleanup pattern, their entire restaurant will be archived when Render reboots!
- **Required Resolution:** Delete this function invocation completely from the startup lifecycle. Restrict database maintenance to authenticated administrative CLI scripts.

### 4. Wildcard Subdomain DNS Routing Delegation
- **Subsystem:** Cloudflare Edge / DNS Registrar
- **Severity:** **P0**
- **Commercial Impact:** If the primary registrar (GoDaddy) has not fully delegated authoritative nameservers to Cloudflare, wildcard tenant subdomains (`<slug>.dinely.food`) will fail DNS resolution with `NXDOMAIN`. Restaurant owners cannot access their custom subdomains or print physical QR codes with confidence.
- **Required Resolution:** Verify that Cloudflare nameservers are 100% authoritative at the registrar, and ensure `*.dinely.food` is proxied through the Cloudflare Tenant Router worker.

### 5. Imperative Runtime Database Alteration
- **Subsystem:** Database Migrations (`Alembic` vs `_background_startup_init`)
- **Severity:** **P0**
- **Commercial Impact:** Tables are altered via raw SQL strings executed asynchronously at server boot. In a multi-worker production environment, concurrent workers attempting `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` cause database deadlocks and migration drift.
- **Required Resolution:** Package all schema requirements into declarative Alembic migration scripts (`alembic upgrade head`) and remove raw SQL alteration from the application code.

---

## 3. Priority 1: Critical Operational Blockers

### 6. Missing Backend Inventory Endpoints
- **Subsystem:** Inventory Operations (`app/modules/inventory/`)
- **Severity:** **P1**
- **Commercial Impact:** The frontend Inventory terminal currently simulates stock updates inside browser `localStorage`. Stock counts are NOT synchronized across different staff tablets or deducted when kitchen orders are completed. A commercial restaurant would quickly face stock discrepancies.
- **Required Resolution:** Implement the complete backend `inventory` router, model, and service layer with PostgreSQL persistence.

### 7. Insecure Terminal Staff Authentication
- **Subsystem:** Authentication & Authorization
- **Severity:** **P1**
- **Commercial Impact:** Staff terminals currently rely on `X-Staff-Role` headers without token verification. Any customer or competitor seated at a table could open developer tools and send requests as `KITCHEN` or `WAITER` to cancel tickets or manipulate orders.
- **Required Resolution:** Implement 4-digit staff PIN login issuing short-lived, role-scoped JWT tokens.

### 8. Table Number Formatting Inconsistencies
- **Subsystem:** Orders, Billing, and Floor Terminals
- **Severity:** **P1**
- **Commercial Impact:** If customer scans table `"01"`, but waiter terminal records it as `"1"` or `"Table 1"`, the billing engine may fail to associate the customer's orders with the physical table tab, resulting in unpaid food bills or billing confusion.
- **Required Resolution:** Enforce strict alphanumeric table normalization (`formatStandardTableNumber`) on all API write and query operations.

### 9. Lack of Realtime Reconnect State Resynchronization
- **Subsystem:** WebSocket Event Bus (`realtime.ts`)
- **Severity:** **P1**
- **Commercial Impact:** In a busy kitchen with spotty Wi-Fi, if the tablet briefly disconnects and reconnects, orders placed during the disconnect window may never appear on the KDS without a full manual browser refresh.
- **Required Resolution:** On WebSocket reconnection, client must automatically trigger an HTTP reconciliation fetch for all orders placed in the last 15 minutes.

---

## 4. Priority 2: Important Architectural & UX Upgrades

### 10. Monolithic 5,914-Line API Client File
- **Subsystem:** Frontend Code Quality (`client.ts`)
- **Severity:** **P2**
- **Impact:** Fragile code structure makes debugging production issues slow and risky.
- **Resolution:** Modularize into domain services (`authService.ts`, `orderService.ts`, `menuService.ts`, `billingService.ts`).

### 11. Unbounded Database Queries in Admin and Order Logs
- **Subsystem:** Backend ORM Queries
- **Severity:** **P2**
- **Impact:** Queries fetching all orders or all restaurants without pagination will cause query degradation as the platform grows.
- **Resolution:** Enforce limit/offset pagination with standard query schemas.

---

## 5. Commercial Launch Readiness Scorecard

| Assessment Dimension | Current Status | Ready for Sale? | Action Required |
|---|---|---|---|
| **Design & User Experience** | **VERIFIED** (9.5/10) | **YES** | UI is visually stunning, responsive, and modern. |
| **Multi-Tenant Architecture** | **PARTIALLY VERIFIED** (7.0/10) | **CONDITIONAL** | Fix tenant fallback logic and DNS edge routing. |
| **API & Backend Availability** | **BROKEN IN PROD** (2.0/10) | **NO** | Upgrade hosting to always-on paid tier; add client timeouts. |
| **Data Integrity & Migrations**| **UNVERIFIED / RISKY** (4.0/10) | **NO** | Consolidate schema into declarative Alembic migrations. |
| **Staff & Terminal Security**  | **VULNERABLE** (4.5/10) | **NO** | Implement PIN authentication with scoped JWTs. |
| **OVERALL LAUNCH READINESS**   | **NOT READY** | **BLOCKED** | Execute Phase 0 and Phase 1 fixes first. |

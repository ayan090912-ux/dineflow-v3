# DINELY — 06 IMPLEMENTATION ROADMAP & EXECUTION PLAN

**Document Status:** Approved Implementation Master Roadmap  
**Target Milestone:** Full Multi-Tenant Production Readiness  
**Priority Tiers:** P0 (System Blockers) | P1 (Critical Production Deficiencies) | P2 (Important Architectural Upgrades) | P3 (Polish & Observability)  

---

## 1. Phased Execution Overview

```
[ Phase 0: Emergency Production Unblocking ]
  ├── Stabilize Render Backend Service (Paid/Always-on instance + warmup script)
  ├── Add Client-Side API Timeouts & Circuit Breakers (AbortSignal.timeout)
  └── Remove Destructive Startup Purge Script in `main.py`
                     │
                     ▼
[ Phase 1: Database Model & Migration Normalization ]
  ├── Consolidate Imperative SQL into Declarative Alembic Migration Revisions
  ├── Apply Composite Tenant Indices & Foreign Key Cascades
  └── Implement Multi-Tenant Scoping Base Class in SQLAlchemy
                     │
                     ▼
[ Phase 2: Tenant Isolation & Authoritative Resolution ]
  ├── Standardize Hostname -> Tenant Slug -> Restaurant ID Mapping
  ├── Eradicate `restaurants[0]` and fallback tenant logic across frontend/backend
  └── Verify Cloudflare Worker Edge Routing with Wildcard SSL
                     │
                     ▼
[ Phase 3: Authentication & Enterprise Authorization ]
  ├── Cryptographic Firebase Admin Token Verification on All Protected Routes
  ├── Implement Terminal PIN Authentication with Scoped JWTs for Staff
  └── Enforce Strict RBAC via `CallerContext` Dependency
                     │
                     ▼
[ Phase 4: Restaurant Creation & Admin Lifecycle Governance ]
  ├── Validate Setup Wizard Transactional Creation (Restaurant + Tables + Categories)
  ├── Formalize Status State Machine (DRAFT -> PENDING -> LIVE -> REJECTED)
  └── Implement Realtime Admin Queue with Live WebSocket Updates
                     │
                     ▼
[ Phase 5: Dynamic QR & Customer Dine-in Experience ]
  ├── Standardize QR Code URLs to `https://<slug>.dinely.food/customer?table=XX`
  ├── Implement Robust Table Session Initialization & Table Number Normalization
  └── Realtime Cart, Ordering, and Waiter Assistance Call Dispatch
                     │
                     ▼
[ Phase 6: Operational Terminals & Realtime Bus ]
  ├── Kitchen Display System (KDS) & Bar Terminal Event Filtering
  ├── Implement Backend Inventory Endpoints & Stock Deduction Triggers
  ├── Complete Waiter Floor OS with Table Status & Request Acknowledgment
  └── Billing Engine, Multi-Tax Calculation, and Cash/Card/UPI Settlement
                     │
                     ▼
[ Phase 7: Production Hardening, Testing & Launch Verification ]
  ├── Dual-Tenant End-to-End Automated Integration Test Suite
  ├── Rate Limiting, CORS Hardening, and Security Headers
  └── Edge Performance Caching & Bundle Optimization
```

---

## 2. Detailed Work Breakdown Structure (WBS)

### Phase 0: Emergency Production Unblocking (P0 — Immediate)
- **Task 0.1: Backend Service Stability & Keepalive**
  - Upgrade Render instance from free tier (spinning down) to Starter tier, or configure an external keepalive pinger hitting `/healthz` every 4 minutes.
  - Set Neon database pool timeout to 10s and idle timeout to 300s to avoid asyncpg connection lockups.
- **Task 0.2: Frontend Client-Side Resiliency & Timeouts**
  - Modify `frontend/src/packages/api/client.ts`: wrap `fetch()` calls in `AbortSignal.timeout(10000)`.
  - Update `WorkspaceSelector.tsx` and `CustomerApp.tsx` to display an interactive retry banner with offline notice if API does not respond within 10 seconds.
- **Task 0.3: Eliminate Destructive Startup Purge**
  - Delete `run_clean_production_applications()` call inside `backend/dineflow-backend/app/main.py`. Prevent automated archiving of valid restaurants on reboot.

---

### Phase 1: Database Normalization & Alembic Migration (P0)
- **Task 1.1: Generate Comprehensive Baseline Alembic Migration**
  - Create revision `20260912_production_baseline.py` in `backend/dineflow-backend/alembic/versions/`.
  - Define declarative tables for `restaurants`, `restaurant_memberships`, `restaurant_domains`, `restaurant_lifecycle_logs`, `tables`, `table_sessions`, `menu_categories`, `menu_items`, `orders`, `order_items`, `taxes`, `bills`, `inventory_items`, `customer_requests`.
- **Task 1.2: Remove Imperative SQL Startup Injection**
  - Purge raw string `ALTER TABLE ... ADD COLUMN` statements from `_background_startup_init()` in `main.py`. Ensure schema creation is handled purely by Alembic migrations.
- **Task 1.3: Add Missing Composite Tenant Indexes**
  - Add indexes: `(restaurant_id, status)`, `(restaurant_id, table_number)`, `(restaurant_id, created_at DESC)`.

---

### Phase 2: Authoritative Tenant Isolation (P0)
- **Task 2.1: Purge All `restaurants[0]` Fallback Anti-Patterns**
  - Audit and refactor all occurrences in `frontend/src/apps/` and `client.ts` where code falls back to the first available restaurant.
  - If a tenant cannot be resolved from hostname or valid selection, display an explicit 404 screen.
- **Task 2.2: Cloudflare Edge Worker Deployment Verification**
  - Deploy `cloudflare/dinely-tenant-router/worker.js` with route `*.dinely.food/*`.
  - Ensure GoDaddy DNS NS records are delegated to Cloudflare to enable edge proxying and SSL wildcard certificates.

---

### Phase 3: Authentication & RBAC Hardening (P0 / P1)
- **Task 3.1: Cryptographic Firebase Token Verification**
  - Audit `backend/dineflow-backend/app/modules/auth/service.py`. Enforce Google Firebase public key verification on all incoming Bearer tokens.
- **Task 3.2: Staff Passcode Login & Scoped JWTs**
  - Implement endpoint `POST /api/v1/auth/terminal-login` accepting `{ restaurant_id, pin_code, role }`.
  - Issue cryptographically signed staff JWT with 12-hour expiration, restricted strictly to the specified restaurant and station role.
- **Task 3.3: Strict `CallerContext` Route Protection**
  - Verify every endpoint in `restaurants`, `tables`, `menu`, `orders`, `billing` checks `context.has_access(restaurant_id)`. Block any cross-tenant IDOR access.

---

### Phase 4: Restaurant Creation & Admin Lifecycle (P1)
- **Task 4.1: Atomic Restaurant Creation Transaction**
  - Refactor `restaurant_service.create_restaurant()` to atomically insert restaurant, initial memberships, default tables (1-10), and starter categories within a single database transaction.
- **Task 4.2: Formalize Status State Machine**
  - Enforce status transitions: `DRAFT -> PENDING_APPROVAL -> LIVE` in backend service. Reject direct jumps to `LIVE` without admin approval.
- **Task 4.3: Realtime Admin Approval Queue**
  - Ensure `PlatformApp.tsx` receives `"restaurant_submitted"` events over WebSocket and displays new restaurants in real time.

---

### Phase 5: Dynamic QR & Customer Dine-In Experience (P1)
- **Task 5.1: Unified QR Code Generator**
  - Consolidate all QR generation into `getRestaurantCustomerUrl(slug, tableNumber)`.
  - Ensure QR URLs are generated exclusively as `https://<slug>.dinely.food/customer?table=XX`.
- **Task 5.2: Table Session Lifecycle Management**
  - Ensure customer visits automatically bind to an active `table_session_id`.
  - Support re-ordering from the same table without creating duplicate sessions.
- **Task 5.3: Waiter Call Dispatch**
  - Verify "Call Waiter" from customer phone dispatches `customer_requests` and notifies floor staff immediately.

---

### Phase 6: Operational Terminals & Realtime Event Bus (P1)
- **Task 6.1: Realtime KDS & Bar Station Filtering**
  - In `KitchenETADashboard.tsx` and `BarTerminal.tsx`, filter orders strictly by `station == 'KITCHEN'` vs `station == 'BAR'`.
- **Task 6.2: Implement Missing Backend Inventory Module**
  - Create `app/modules/inventory/router.py` and register in `main.py`.
  - Provide endpoints: `GET /inventory`, `POST /inventory/items`, `PATCH /inventory/items/{id}/stock`.
  - Trigger automatic stock decrement on order status transition to `COMPLETED`.
- **Task 6.3: Billing & Tax Calculation Settlement**
  - Wire frontend billing terminal to `billing/router.py`. Calculate GST/VAT and generate itemized receipts.
  - Settle bill and trigger table session release.

---

### Phase 7: Production Hardening, Testing & Documentation (P2 / P3)
- **Task 7.1: Automated Dual-Tenant Integration Tests**
  - Write test suite creating Restaurant A and Restaurant B; verify Tenant A staff cannot see or modify Tenant B data.
- **Task 7.2: Security Headers & Rate Limiting**
  - Add SlowAPI rate limiter (100 req/min on public routes, 20 req/min on auth).
  - Enforce strict CSP, HSTS, and X-Content-Type-Options headers.
- **Task 7.3: Frontend Code Splitting & API Modularization**
  - Split 5,914-line `client.ts` into individual domain service files.
  - Implement React `lazy()` and `Suspense` for operational terminal routes to reduce initial bundle size by 40%.

# Dinely Production Roadmap

**Target**: Full Production Readiness across Multi-Tenant Core, Realtime, Public Domains, QR, and Billing.  
**Execution Paradigm**: Phased Autonomous Multi-Agent Delivery  

---

## Milestone 1: Production Infrastructure & Baseline Hardening
- [x] Establish Canonical Architecture Specification (`architecture.md`).
- [x] Audit production environment variables (Render + Firebase Hosting).
- [x] Verify CORS policy across `dinely.food`, `*.dinely.food`, and local subdomains.
- [x] Ensure non-blocking database connections and pooled session stability in `app/core/database/connection.py`.

## Milestone 2: Identity & Multi-Tenant Workspace Isolation
- [x] Verify Firebase Google Authentication flow preserves exact user identity (`owner_uid`, `owner_email`).
- [x] Audit `GET /api/v1/restaurants/owner/my` to guarantee strict tenant isolation across different owners (Account A vs Account B).
- [x] Enforce zero mock fallbacks in `WorkspaceSelector.tsx` and `App.tsx`.
- [x] Ensure smooth tenant switching with explicit `activeRestaurant` context propagation.

## Milestone 3: Server-Authoritative Restaurant Creation & Application Workflow
- [x] Audit Setup Wizard (`/wizard?mode=create`): Ensure server-generated UUIDs and unique `public_slug` generation.
- [x] Validate submission sets lifecycle to `PENDING_APPROVAL` with `is_approved = false`.
- [x] Ensure duplicate slug collisions are deterministically handled (e.g. `the-dunk-2`, `the-dunk-3`).

## Milestone 4: Private Platform Admin & Atomic Lifecycle Operations
- [x] Enforce backend-only role protection (`PLATFORM_ADMIN`) on all `/api/v1/admin/*` routes.
- [x] Verify approval endpoint is atomic, idempotent, and non-blocking (`PENDING_APPROVAL` -> `LIVE`).
- [x] Verify rejection endpoint captures persistent reason (`REJECTED`).
- [x] Implement resubmission workflow (`REJECTED` -> `PENDING_APPROVAL`) preserving history without creating orphan records.
- [x] Verify realtime global broadcast informs owner workspace immediately without page refresh.

## Milestone 5: Public Domain Architecture & QR Ordering Plane
- [x] Audit subdomain resolution (`https://<slug>.dinely.food`) in `tenantResolver.ts` and `CustomerApp.tsx`.
- [x] Verify unknown tenant hostnames return strict 404 with zero fallback to other restaurants.
- [x] Verify QR code generator outputs canonical URL: `https://<slug>.dinely.food/customer?table=<table_number>&tableId=<table_id>`.
- [x] Prevent `window.location.origin` leakage from owner dashboard into QR codes.
- [x] Cloudflare Worker (`dinely-tenant-router`) proxying and wildcard route configuration.

## Milestone 6: Operational Modules (KDS, Bar, Waiter, Inventory, Billing)
- [x] Verify Menu Item target destination (`KITCHEN` vs `BAR`) is strictly defined and dispatched without keyword heuristics.
- [x] Verify Customer requests (`CALL_WAITER`, `WATER`, `BILL`) are tenant-partitioned in WebSocket rooms.
- [x] Audit billing and tax calculation: snapshot-based invoices, exact tenant UPI merchant resolution.
- [x] Audit inventory management: tenant-scoped stock tracking and audit logs.

## Milestone 7: Realtime WebSocket Resilience & State Reconciliation
- [x] Enforce room-isolated broadcasts: `restaurant:{restaurant_id}`.
- [x] Add post-reconnect state sync to ensure zero dropped orders or waiter alerts.
- [x] Ensure 1.5s write deadline prevents stalled connections from blocking server event loops.

## Milestone 8: End-to-End Regression Verification & Production Browser Validation
- [x] Run full automated pytest suite across all modules (64/64 PASSED).
- [x] Run production verification script on live Render API and Firebase Hosting origin.
- [x] Two-tenant production isolation test (Tenant A ≠ Tenant B).
- [x] Document final results in `walkthrough.md` and `CHANGELOG.md`.

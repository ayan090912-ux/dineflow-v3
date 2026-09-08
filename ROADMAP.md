# Dinely Production Roadmap

**Target**: Full Production Readiness across Multi-Tenant Core, Realtime, Public Domains, QR, and Billing.  
**Execution Paradigm**: Phased Autonomous Multi-Agent Delivery  

---

## Milestone 1: Production Infrastructure & Baseline Hardening
- [x] Establish Canonical Architecture Specification (`architecture.md`).
- [ ] Audit production environment variables (Render + Firebase Hosting).
- [ ] Verify CORS policy across `dinely.food`, `*.dinely.app`, and local subdomains.
- [ ] Ensure non-blocking database connections and pooled session stability in `app/core/database/connection.py`.

## Milestone 2: Identity & Multi-Tenant Workspace Isolation
- [ ] Verify Firebase Google Authentication flow preserves exact user identity (`owner_uid`, `owner_email`).
- [ ] Audit `GET /api/v1/restaurants/owner/my` to guarantee strict tenant isolation across different owners (Account A vs Account B).
- [ ] Enforce zero mock fallbacks in `WorkspaceSelector.tsx` and `App.tsx`.
- [ ] Ensure smooth tenant switching with explicit `activeRestaurant` context propagation.

## Milestone 3: Server-Authoritative Restaurant Creation & Application Workflow
- [ ] Audit Setup Wizard (`/wizard?mode=create`): Ensure server-generated UUIDs and unique `public_slug` generation.
- [ ] Validate submission sets lifecycle to `PENDING_APPROVAL` with `is_approved = false`.
- [ ] Ensure duplicate slug collisions are deterministically handled (e.g. `the-dunk-2`, `the-dunk-3`).

## Milestone 4: Private Platform Admin & Atomic Lifecycle Operations
- [ ] Enforce backend-only role protection (`PLATFORM_ADMIN`) on all `/api/v1/admin/*` routes.
- [ ] Verify approval endpoint is atomic, idempotent, and non-blocking (`PENDING_APPROVAL` -> `LIVE`).
- [ ] Verify rejection endpoint captures persistent reason (`REJECTED`).
- [ ] Implement resubmission workflow (`REJECTED` -> `PENDING_APPROVAL`) preserving history without creating orphan records.
- [ ] Verify realtime global broadcast informs owner workspace immediately without page refresh.

## Milestone 5: Public Domain Architecture & QR Ordering Plane
- [ ] Audit subdomain resolution (`https://<slug>.dinely.app`) in `tenantResolver.ts` and `CustomerApp.tsx`.
- [ ] Verify unknown tenant hostnames return strict 404 with zero fallback to other restaurants.
- [ ] Verify QR code generator outputs canonical URL: `https://<slug>.dinely.app/customer?table=<table_number>`.
- [ ] Prevent `window.location.origin` leakage from owner dashboard into QR codes.

## Milestone 6: Operational Modules (KDS, Bar, Waiter, Inventory, Billing)
- [ ] Verify Menu Item target destination (`KITCHEN` vs `BAR`) is strictly defined and dispatched without keyword heuristics.
- [ ] Verify Customer requests (`CALL_WAITER`, `WATER`, `BILL`) are tenant-partitioned in WebSocket rooms.
- [ ] Audit billing and tax calculation: snapshot-based invoices, exact tenant UPI merchant resolution.
- [ ] Audit inventory management: tenant-scoped stock tracking and audit logs.

## Milestone 7: Realtime WebSocket Resilience & State Reconciliation
- [ ] Enforce room-isolated broadcasts: `room:{restaurant_id}`.
- [ ] Add post-reconnect state sync to ensure zero dropped orders or waiter alerts.
- [ ] Ensure 1.5s write deadline prevents stalled connections from blocking server event loops.

## Milestone 8: End-to-End Regression Verification & Production Browser Validation
- [ ] Run full automated pytest suite across all modules.
- [ ] Run browser verification on `https://dinely.food` simulating Account A vs Account B.
- [ ] Document final results in `walkthrough.md` and `CHANGELOG.md`.

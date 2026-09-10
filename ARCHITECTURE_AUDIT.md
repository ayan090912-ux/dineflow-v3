# DINELY — Comprehensive Production SaaS Architecture & Security Audit

> **Target System**: Dinely Multi-Tenant Restaurant SaaS Platform (`dinely.food`, `*.dinely.food`)  
> **Repository**: `dineflow-v3`  
> **Date**: September 2026  
> **Audit Status**: Complete Repository Audit & Threat Analysis  

---

## 1. Executive Summary

Dinely is architected as an all-in-one multi-tenant restaurant operating platform:
- **Frontend**: Single-Page Application (React 19, TypeScript, Vite, Tailwind CSS) deployed on Firebase Hosting (`dinely-cd6cd.web.app`) behind Cloudflare.
- **Edge Layer**: Cloudflare Worker (`dinely-tenant-router`) routing `dinely.food` to platform management and `*.dinely.food` to restaurant tenant customer experiences.
- **Backend**: Python FastAPI service on Render (`dineflow-v3.onrender.com`), exposing `/api/v1` REST endpoints and `/api/v1/ws` real-time WebSockets.
- **Database**: PostgreSQL on Neon (Serverless Postgres with connection pooling).
- **Authentication**: Firebase Authentication (Google OAuth + Email) on the client with ID token verification in FastAPI.

While core tenant isolation mechanisms (foreign keys, table schemas, and subdomain resolution) exist, **critical security vulnerabilities, authorization gaps, unauthenticated WebSocket access, and legacy fallback code** prevent safe large-scale production operation. This audit identifies every architectural issue and details a prioritized remediation plan.

---

## 2. Current Architecture

```mermaid
graph TD
    subgraph Client Layer
        A["Customer Scan: https://the-fly.dinely.food/customer?table=01"]
        B["Platform User: https://dinely.food/workspace"]
        C["Platform Admin: https://dinely.food/admin/dashboard"]
    end

    subgraph Edge & Routing Layer
        D["Cloudflare DNS (*.dinely.food Proxied)"]
        E["Worker: dinely-tenant-router"]
    end

    subgraph Origin & Backend Layer
        F["Firebase Hosting Origin (SPA)"]
        G["FastAPI Backend on Render (/api/v1)"]
        H["Neon PostgreSQL (Authoritative DB)"]
    end

    A --> D
    B --> D
    C --> D
    D --> E
    E -->|Preserves Host Header & Injects X-Tenant-Slug| F
    F -->|REST / WebSocket (api.dinely.food / render)| G
    G --> H
```

### Identity & Hierarchy Principle:
```
USER (Firebase UID)
 └── MEMBERSHIP / RESTAURANT OWNERSHIP (restaurants.owner_uid)
      └── RESTAURANT (restaurant_id)
           ├── DOMAINS (restaurant_domains: hostname, public_slug)
           ├── TABLES & SESSIONS (tables, table_sessions)
           ├── MENU (menu_categories, menu_items)
           ├── ORDERS & ITEMS (orders, order_items)
           ├── BILLING & INVOICES (bills, invoice_tax_snapshots)
           └── AUDIT & LIFECYCLE LOGS (restaurant_lifecycle_logs)
```

---

## 3. Critical Security Risks & Architectural Problems

### 3.1 P0: Critical Security & Authorization Gaps (IDOR)
1. **Unprotected Order Retrieval (`GET /api/v1/orders/restaurant/{restaurant_id}`)**:
   - `orders/router.py`: `get_restaurant_orders` performs zero authentication or tenant authorization checks. Any unauthenticated user or competitor can query all orders, order numbers, customer names, and prep times for any restaurant ID.
2. **Unprotected Service Requests (`GET /api/v1/customer-requests`)**:
   - `customer_requests/router.py`: `get_customer_requests` does not enforce tenant authentication. Anyone knowing or guessing a `restaurant_id` can monitor all internal customer requests and waiter communications.
3. **Unprotected Billing & Invoices (`GET /api/v1/restaurants/{restaurant_id}/billing/bills`)**:
   - `billing/router.py`: `list_restaurant_bills` does not require tenant authorization. Complete financial data, invoice numbers, amounts, and payment histories are exposed without credentials.
4. **Unprotected Table Settlement (`POST /api/v1/restaurants/{restaurant_id}/billing/{bill_id}/close-table`)**:
   - `billing/router.py`: `close_table_settlement` lacks role authorization; any user can trigger table closure.
5. **Insecure Fallback JWT Parsing in Backend Firebase Auth**:
   - `app/core/security/firebase.py`: If Firebase Admin SDK is not initialized, lines 51-76 decode unverified JWT base64 payloads without cryptographic signature verification. In production, an attacker can craft a forged JWT with `email: "ayan090912@gmail.com"` to obtain complete platform superadmin access.
   - Accepts synthetic tokens (`firebase_token_admin__...`) without restricting to non-production environments.
6. **WebSocket Unauthenticated Privilege Escalation**:
   - `app/modules/websocket/router.py`: Accepts `role=PLATFORM_ADMIN` or `role=OWNER` as raw query parameters without verifying Firebase ID tokens or staff credentials. An attacker can connect with `role=PLATFORM_ADMIN` to intercept platform administrative broadcasts or `role=OWNER` on arbitrary tenants.

---

### 3.2 P1: Data Integrity, Startup Hacks & Hardcoded Tenancy
1. **Startup Migration Hacks in `main.py`**:
   - `main.py` lines 98-116 executes ad-hoc SQL updates on every server restart.
   - Line 98 hardcodes `'the-dunk'` as fallback: `COALESCE(public_slug, slug, 'the-dunk')`.
   - Line 104 hardcodes a personal email: `AND (owner_email IS NULL OR owner_email != 'ayanamity77@gmail.com')`.
   - Modifying production tables on uvicorn startup risks table locking, migration race conditions with multiple uvicorn workers, and accidental data mutation.
2. **Lingering `.dinely.app` References**:
   - Multiple files (`tenant_resolver.py`, `cloudflare/index.js`, `tenantResolver.ts`, `client.ts`) still contain logic checking for the deprecated `.dinely.app` domain. The canonical domain is strictly `dinely.food`.
3. **Dead / Stub Auth Routes**:
   - `app/modules/auth/router.py`: Routes `/staff/login`, `/staff/register`, `/customer/session`, `/customer/otp/request`, `/customer/otp/verify`, `/logout-all`, `/me` return `501 NotImplementedError ("coming in Sprint 1")`. These generate clutter and confusion.
4. **Dead / Duplicate Functions**:
   - `app/modules/restaurants/router.py`: `extract_subdomain_from_hostname` is defined on line 39 and never called (dead code duplicating `tenant_resolver.py`).
   - `app/scripts/cafe_co_migration.py`: Legacy script creating synthetic `CAFE.CO` fixtures.

---

### 3.3 P2: Code Quality, Client Bloat & Error Handling
1. **Monolithic Frontend API Client (`client.ts` — 5,868 Lines)**:
   - Contains extensive legacy offline mocking, redundant fallback arrays (`GLOBAL_MULTI_TENANT_*`), and duplicative storage keys. Needs streamlining to server-authoritative API calls.
2. **Missing Rate Limiting on High-Risk Public Endpoints**:
   - `POST /api/v1/orders` (customer ordering)
   - `POST /api/v1/customer-requests` (call waiter)
   - `POST /api/v1/auth/platform/login`
   - In `.env`, `RATE_LIMIT_ENABLED=false`. Needs proper Redis/in-memory rate limiting to prevent abuse.
3. **Observability & Audit Logging**:
   - Administrative and financial actions must emit structured audit logs to `restaurant_lifecycle_logs` and persistent application logs with actor ID, IP address, and timestamp.

---

## 4. Prioritized Remediation Plan

### Phase 1: Security Hardening (P0 — Immediate)
- [ ] Add `require_tenant_staff_or_owner` to `GET /api/v1/orders/restaurant/{restaurant_id}`.
- [ ] Add `require_tenant_staff_or_owner` to `GET /api/v1/customer-requests`.
- [ ] Add `require_tenant_staff_or_owner` to `GET /api/v1/restaurants/{restaurant_id}/billing/bills`.
- [ ] Add `require_tenant_staff_or_owner` to `POST /api/v1/restaurants/{restaurant_id}/billing/{bill_id}/close-table`.
- [ ] Harden `firebase.py`: Disable unverified base64 decoding and synthetic tokens when `ENVIRONMENT == 'production'` or `not DEBUG`. Cryptographically verify token signatures.
- [ ] Authenticate WebSocket connections: Validate tokens before assigning privileged roles (`OWNER`, `WAITER`, `KITCHEN`, `BAR`, `PLATFORM_ADMIN`).

### Phase 2: Clean Foundations & Eliminate Anti-Patterns (P1)
- [ ] Remove hardcoded personal email and `'the-dunk'` fallback from `main.py` startup SQL.
- [ ] Move schema updates out of uvicorn startup into proper idempotent Alembic migrations.
- [ ] Remove dead duplicate function `extract_subdomain_from_hostname` in `restaurants/router.py`.
- [ ] Remove deprecated `.dinely.app` domain logic across frontend, Cloudflare Worker, and backend tenant resolvers.
- [ ] Deprecate/clean dead 501 stub routes in `auth/router.py` or connect them cleanly.
- [ ] Archive confirmed synthetic/demo restaurants via a safe, audited migration script without dropping or wiping production data.

### Phase 3: Domain, QR & Tenant Resolution Verification (P1)
- [ ] Ensure `restaurant_domains` table is authoritative for custom domains and subdomains.
- [ ] Verify QR code generator encodes canonical `https://<public_slug>.dinely.food/customer?table=<num>&tableId=<id>` format.
- [ ] Verify Cloudflare Worker preserves `Host` header and forwards `X-Tenant-Slug`.

### Phase 4: Frontend Simplification & Performance (P2)
- [ ] Eliminate dead fallback fixtures and redundant mock caches from `packages/api/client.ts`.
- [ ] Verify loading, error, and retry states across all terminals (Kitchen, Waiter, Bar, Inventory, Billing, Admin).
- [ ] Validate responsive layouts on viewports 320px to 1920px.

### Phase 5: End-to-End Verification & Production Readiness (P0/P1)
- [ ] User A vs User B strict isolation test (User A cannot view or mutate Restaurant B).
- [ ] Real-time order dispatch test (Order on Restaurant A reaches only A's Kitchen/Waiter/Bar, zero bleed to B).
- [ ] Full build and typecheck verification (`tsc --noEmit`, `vite build`, `pytest`).

# DINELY — MASTER SYSTEM FORENSIC AUDIT (SYSTEM_AUDIT.md)
**Audit Date:** September 11, 2026  
**Status:** FORENSIC DIAGNOSIS COMPLETE — NO CODE PATCHES APPLIED  
**Target Environment:** Production Platform (`https://dinely.food`) | Backend (`https://dineflow-v3.onrender.com/api/v1`) | Database (PostgreSQL on Render) | Auth (Google Firebase)

---

## 1. Executive Summary

A comprehensive, layer-by-layer forensic audit of the Dinely multi-tenant restaurant SaaS platform reveals systemic decoupling between the frontend client architecture and the backend PostgreSQL database. The application exhibits an architectural split-brain:

1. **Dual Parallel Database Engines:** The frontend maintains a full 5,900+ line in-memory and `localStorage` mock database (`dinely_production_db_v3`) inside [`client.ts`](file:///c:/dineflow%20v3/v3/frontend/src/packages/api/client.ts). When backend API requests time out (Render free-tier 50-second cold starts) or return unexpected formats, the frontend silently falls back to local browser storage. An owner creates a restaurant locally, but Platform Admin and other terminals querying Render see zero records.
2. **Subdomain Black Hole (DNS / Cloudflare Disconnect):** The codebase generates canonical tenant domains as `https://<public-slug>.dinely.food` and encodes them into QR codes. However, public DNS for `dinely.food` is delegated to GoDaddy (`ns05.domaincontrol.com`), NOT Cloudflare. There is NO wildcard DNS record (`*.dinely.food`). Attempting to resolve any tenant subdomain yields `DNS_PROBE_FINISHED_NXDOMAIN` / `curl (6): Could not resolve host`. The Cloudflare Worker in `cloudflare/dinely-tenant-router` is completely inactive and undeployed.
3. **Client-Side ID and Slug Pre-Emption:** Instead of the PostgreSQL database being the sole authoritative issuer of entity IDs, slugs, and lifecycle states, the frontend generates `id: rest-${Date.now()}` and derives slugs before sending them to the backend, leading to duplicate records, slug collisions, and foreign-key mismatches across tables.
4. **Header-Based Authentication Bypass in Backend Tenant Guard:** In [`tenant_auth.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/core/security/tenant_auth.py#L106-L115), any unauthenticated HTTP request supplying `X-Staff-Role` and `X-Staff-Restaurant-Id` is accepted as an authorized staff caller without token verification.
5. **Cross-Tenant Session Bleed:** Waiter, Kitchen, Bar, and Customer terminals frequently fall back to `localStorage.getItem('dinely_active_restaurant_id')` or `restaurants[0]`, binding terminals to whatever restaurant was previously active on that device rather than the tenant defined by the URL.

---

## 2. Comprehensive 30-Layer Audit

### Layer 1: Frontend Architecture
- **Framework & Bundler:** React 19 with Vite, TypeScript.
- **Routing Engine:** Custom hash/history navigation based on `window.location.pathname` and `window.location.hostname` parsed in [`App.tsx`](file:///c:/dineflow%20v3/v3/frontend/src/App.tsx) and [`tenant.ts`](file:///c:/dineflow%20v3/v3/frontend/src/packages/tenant/tenant.ts).
- **Core Defect:** Lack of standard client routing library (e.g. React Router); URL parsing relies on manual path prefix regexes (`/workspace`, `/wizard`, `/admin`, `/kitchen`, `/waiter`, `/bar`, `/customer`, `/billing`).
- **State Management:** Fragmented between React local states, module-level singleton in [`client.ts`](file:///c:/dineflow%20v3/v3/frontend/src/packages/api/client.ts), `localStorage`, and `sessionStorage`.

### Layer 2: Backend Architecture
- **Framework:** FastAPI (Python 3.11+), ASGI runner `uvicorn`.
- **Hosting:** Render Web Service (`https://dineflow-v3.onrender.com`).
- **Startup Sequence:** [`main.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/main.py#L167-L183) executes `_background_startup_init()` during lifespan which runs raw DDL `ALTER TABLE` commands and data-scrubbing SQL queries asynchronously.
- **Issue:** On startup, `main.py:104-114` executes a blanket SQL update archiving any restaurant where `id LIKE 'rest-test-%'` or `owner_email IS NULL`, which can inadvertently archive real onboarded records during testing.

### Layer 3: PostgreSQL Models
- **ORM:** SQLAlchemy 2.0 async (`AsyncSession`, `select`, `Mapped`).
- **Schema Separation:** Single shared PostgreSQL schema with `restaurant_id` column on all tenant models (`tables`, `orders`, `order_items`, `bills`, `menu_items`, `menu_categories`, `inventory_items`, `employees`, `taxes`).
- **Integrity Issues:** Several models lack foreign key constraints (`ForeignKey('restaurants.id')`) on `restaurant_id`, allowing orphan records. Column types for prices and quantities vary between `Float` and `Numeric`.

### Layer 4: Migrations
- **Tool:** Dual strategy: Alembic configuration exists in `backend/dineflow-backend/alembic`, but the active production app executes ad-hoc raw SQL strings in [`main.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/main.py#L25-L163) (`ensure_db_schema_columns`).
- **Risk:** High drift risk between local development Alembic versions and Render's live PostgreSQL tables.

### Layer 5: Firebase Authentication
- **Frontend SDK:** Firebase JS SDK v10 (modular auth: `signInWithPopup`, `GoogleAuthProvider`, `onAuthStateChanged`).
- **Backend Verification:** Firebase Admin Python SDK initialized in [`app/core/security/firebase.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/core/security/firebase.py) using `FIREBASE_PROJECT_ID` (`dinely-cd6cd`) and optional credentials file.
- **Fallback Risk:** If Firebase Admin SDK fails to load private service keys, it falls back to parsing unverified JWT headers in development mode.

### Layer 6: Authorization / RBAC
- **Platform Admin Authorization:** Strictly enforced via `require_platform_admin` in [`app/core/security/rbac.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/core/security/rbac.py). Verified via tests to reject non-whitelisted emails and require `ayan090912@gmail.com`.
- **Tenant Staff RBAC:** Flawed. [`tenant_auth.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/core/security/tenant_auth.py#L106-L115) accepts forged `X-Staff-Role` headers without token validation.

### Layer 7: API Client ([`client.ts`](file:///c:/dineflow%20v3/v3/frontend/src/packages/api/client.ts))
- **Size:** 5,916 lines.
- **Flaw:** Functions simultaneously as an HTTP client and an offline mock database. Contains 24 in-memory array collections (`this.restaurants`, `this.orders`, `this.tables`, `this.menuItems`, `this.bills`, etc.) persisted to `localStorage['dinely_production_db_v3']`.
- **Catch-and-Swallow Pattern:** In methods like `createRestaurantForOwner` (line 1545), backend network failures or 500s are caught and ignored, keeping the newly created restaurant purely inside the user's browser storage.

### Layer 8: Routing Engine
- **Host vs Path Discrepancy:** Root path `/` on `dinely.food` serves the public marketing landing page. Sub-paths `/kitchen`, `/waiter`, `/bar`, `/customer` require either a tenant subdomain (`the-dunk.dinely.food/kitchen`) or a query parameter (`dinely.food/kitchen?tenant=the-dunk`).
- **Flaw:** When accessed on apex `dinely.food/kitchen`, the app cannot determine the tenant without inspecting `localStorage`.

### Layer 9: Tenant Resolver
- **Frontend Resolver:** [`frontend/src/packages/tenant/tenant.ts`](file:///c:/dineflow%20v3/v3/frontend/src/packages/tenant/tenant.ts) extracts subdomains by splitting `hostname.split('.')`.
- **Backend Resolver:** [`backend/dineflow-backend/app/modules/restaurants/tenant_resolver.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/modules/restaurants/tenant_resolver.py) resolves hostnames against `restaurant_domains` and `restaurants.public_slug`.
- **Disagreement:** If a user accesses via `localhost` or apex IP, frontend defaults to `null` or queries `localStorage`, while backend checks query parameters.

### Layer 10: Domain Resolver
- **Database Table:** `restaurant_domains` (`id`, `restaurant_id`, `hostname`, `domain_type`, `is_primary`, `is_verified`).
- **Defect:** Domains are populated with `<slug>.dinely.food`, but the platform has no automated DNS API integration (e.g. Cloudflare API or GoDaddy API) to create or route DNS records dynamically.

### Layer 11: Cloudflare Worker
- **Location:** `cloudflare/dinely-tenant-router/src/index.js`.
- **Design Intent:** Intercept `*.dinely.food`, extract tenant slug, rewrite requests to backend or Firebase Hosting with `X-Tenant-Slug` header.
- **Reality:** COMPLETELY UNUSED. The nameservers for `dinely.food` are NOT set to Cloudflare.

### Layer 12: DNS Assumptions
- **Authoritative DNS:** GoDaddy DomainControl (`ns05.domaincontrol.com`, `ns06.domaincontrol.com`).
- **Records Present:** `dinely.food` A record pointing to `199.36.158.100` (Firebase Hosting).
- **Missing Records:** `*.dinely.food` CNAME or A record is completely absent. Subdomain routing is physically impossible in current DNS state.

### Layer 13: QR Generation
- **Implementation:** [`QRCodeDisplay.tsx`](file:///c:/dineflow%20v3/v3/frontend/src/packages/ui/QRCodeDisplay.tsx) and [`client.ts`](file:///c:/dineflow%20v3/v3/frontend/src/packages/api/client.ts#L418).
- **Target URL:** Formatted as `https://<public-slug>.dinely.food/customer?table=Table%2001&tableId=tbl-xxx`.
- **Critical Failure:** Because `<public-slug>.dinely.food` does not resolve in DNS, scanning the physical QR code on any mobile phone fails with a browser DNS error.

### Layer 14: Customer Terminal Routing
- **Component:** [`CustomerApp.tsx`](file:///c:/dineflow%20v3/v3/frontend/src/apps/customer/CustomerApp.tsx).
- **State Initialization:** Reads tenant from `currentRestaurant` prop. If null, line 223 falls back to `api.getCurrentRestaurantId()`, which inspects `localStorage`.
- **Result:** If a customer opens the app on a device where an owner was previously logged in, the customer session attaches to the owner's restaurant instead of the QR's target.

### Layer 15: Kitchen Terminal Routing
- **Component:** [`KitchenApp.tsx`](file:///c:/dineflow%20v3/v3/frontend/src/apps/kitchen/KitchenApp.tsx).
- **Issue:** Uses `realtimeBus.subscribe` for `OrderCreated`. If the tenant ID is unset or defaults to `restaurants[0]`, the kitchen displays live orders from arbitrary restaurants.

### Layer 16: Waiter Terminal Routing
- **Component:** [`WaiterApp.tsx`](file:///c:/dineflow%20v3/v3/frontend/src/apps/waiter/WaiterApp.tsx).
- **Issue:** Service calls and customer requests are filtered by `restaurantId`. If a waiter accesses via `dinely.food/waiter` without a subdomain, session resolution falls back to local storage.

### Layer 17: Bar Terminal Routing
- **Component:** [`BarApp.tsx`](file:///c:/dineflow%20v3/v3/frontend/src/apps/bar/BarApp.tsx).
- **Issue:** Filters items by `item.targetDestination === 'BAR'` or `item.isAlcoholic`. Inherits the identical tenant resolution breakdown as Kitchen.

### Layer 18: Inventory Terminal Routing
- **Component:** [`InventoryApp.tsx`](file:///c:/dineflow%20v3/v3/frontend/src/apps/inventory/InventoryApp.tsx).
- **Issue:** Inventory stock levels and ingredient deductions depend on `restaurantId`. Stock updates mutate local state in `client.ts`, but backend persistence is inconsistent.

### Layer 19: Billing Terminal Routing
- **Component:** [`BillingApp.tsx`](file:///c:/dineflow%20v3/v3/frontend/src/apps/billing/BillingApp.tsx).
- **Issue:** Table billing sessions query `TableSession`. In `orders/router.py:183`, table sessions are queried using the unverified `payload.restaurantId` rather than canonical tenant ID.

### Layer 20: WebSockets & Realtime
- **Server:** [`app/modules/websocket/router.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/modules/websocket/router.py) and [`manager.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/modules/websocket/manager.py).
- **Client:** [`realtime.ts`](file:///c:/dineflow%20v3/v3/frontend/src/packages/api/realtime.ts) and `realtimeBus`.
- **State:** WebSocket server manages rooms per `restaurant_id` and `__platform_admin__`.
- **Failure Mode:** On Render free-tier, persistent WebSocket connections drop during cold starts and idle timeouts (55 seconds), triggering aggressive client reconnect storms.

### Layer 21: Platform Admin
- **Component:** [`PlatformApp.tsx`](file:///c:/dineflow%20v3/v3/frontend/src/apps/platform/PlatformApp.tsx).
- **Security:** Hardened backend RBAC strictly limits access to `ayan090912@gmail.com`.
- **Queue Disconnect:** `PlatformApp.tsx` calls `api.getPlatformRestaurants()`. If the backend call fails or credentials are missing in `getAuthHeader('ADMIN')`, it silently returns local mock restaurants (`this.restaurants.filter(...)`), concealing live PostgreSQL applications.

### Layer 22: Restaurant Lifecycle
- **Statuses:** `DRAFT` → `PENDING_APPROVAL` → `LIVE` / `REJECTED` / `CHANGES_REQUESTED` / `ARCHIVED`.
- **Conflict:** Frontend considers approved restaurants as `isApproved: true, lifecycleStatus: 'LIVE'`, while backend models have both `is_approved (bool)`, `lifecycle_status (str)`, and `status ('OPEN' | 'CLOSED')`. These three columns can drift out of sync.

### Layer 23: Onboarding Flow
- **Component:** [`OnboardingWizard.tsx`](file:///c:/dineflow%20v3/v3/frontend/src/apps/owner/OnboardingWizard.tsx).
- **Failure:** When an owner completes the wizard, the restaurant is submitted as `PENDING_APPROVAL`. If the user refreshes or navigates to `/workspace`, the client queries `/restaurants/owner` which may return an empty list if Render is spinning up, causing the wizard to prompt the user to create the restaurant again.

### Layer 24: Deployment
- **Frontend Deployment:** Firebase Hosting (`dinely-cd6cd.web.app` / `dinely.food`).
- **Backend Deployment:** Render (`dineflow-v3.onrender.com`).
- **Issue:** Asymmetric deployment pipelines without atomic version locks. A frontend release can deploy contract breaking API changes before the backend container builds.

### Layer 25: Environment Variables
- **Frontend:** `VITE_API_BASE_URL`, `VITE_API_URL`, `VITE_FIREBASE_*`.
- **Backend:** `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `PLATFORM_ADMIN_EMAIL`.
- **Defect:** If `VITE_API_BASE_URL` is omitted during a Vite build, `client.ts:139` hardcodes `https://dineflow-v3.onrender.com/api/v1`.

### Layer 26: Test Suites
- **Backend Tests:** Extensive pytest suite (`tests/`). Includes unit and integration tests.
- **Defect:** Many tests mock the database or bypass Firebase token verification, hiding live production DNS and networking issues.

### Layer 27: Seed Scripts
- **Scripts:** `seed_production_restaurants.py`, `clean_production_applications.py`.
- **Risk:** Seed scripts create hardcoded test records with dummy emails (`testowner@dinely.app`, `demo@dinely.food`), which startup routines then attempt to archive or purge.

### Layer 28: Mock Data
- **Location:** Embedded inside `frontend/src/packages/api/client.ts` (`mockMenuItems`, `mockCategories`, `mockTables`).
- **Impact:** Contaminates real owner workflows whenever network requests fail.

### Layer 29: Legacy Code
- **Remnants:** References to legacy domains like `.dinely.app`, fallback query params `?tenant=`, and old company names (`CAFE.CO`).

### Layer 30: UI / Design System
- **Components:** Custom Tailwind / vanilla CSS hybrid in `frontend/src/packages/ui/`.
- **Visuals:** Modern glassmorphism, responsive cards, and modals.
- **UI Bug:** Modals occasionally render behind parent container stacking contexts due to mixed `z-index` assignments.

# DINELY — 01 SYSTEM INVENTORY & COMPONENT CATALOG

**Audit Date:** September 12, 2026  
**Status:** Forensic Audit Complete (Pre-Implementation Baseline)  
**Classification:** Internal Architectural Document  

---

## 1. Top-Level Directory Topology

| Directory / Path | Primary Purpose | Tech Stack / Tooling | Deployment Target | Operational Status | Risk Rating |
|---|---|---|---|---|---|
| `frontend/` | Dinely Unified Single-Page Application (Platform Landing, Owner Workspace, Onboarding Wizard, Customer Digital Menu, Staff Terminals, Admin Control Plane) | React 19, TypeScript 5.7, Vite 6, TailwindCSS 4, Motion, Lucide, Canvas Confetti | Firebase Hosting (`dinely-cd6cd.web.app`) + Cloudflare Edge | **BROKEN IN PROD** (Infinite spinner on workspace & tenant subdomains due to unresponsive Render backend) | **CRITICAL** |
| `backend/dineflow-backend/` | Central Multi-Tenant REST API & WebSocket Event Broker | Python 3.14 / 3.11, FastAPI, SQLAlchemy 2.0 (Async), Asyncpg, Uvicorn | Render Web Service (`dineflow-v3.onrender.com`) | **BLOCKED IN PROD** (Render free tier instance hanging/unresponsive >130s; Local passes 100/100 tests) | **CRITICAL** |
| `cloudflare/dinely-tenant-router/` | Edge Subdomain & Custom Domain Reverse Proxy Worker | Cloudflare Workers JavaScript, ES Modules | Cloudflare Edge (`*.dinely.food/*`) | **VERIFIED EDGE / BLOCKED DOWNSTREAM** (Correctly rewrites Host & injects tenant headers, but proxies to SPA which hangs on dead backend) | **HIGH** |
| `backend/dineflow-backend/alembic/` | PostgreSQL Database Schema Migrations | Alembic, SQLAlchemy Core | Neon Serverless PostgreSQL | **PARTIALLY UNVERIFIED** (Only 2 migration files exist; runtime startup relies on imperative `ALTER TABLE` scripts in `main.py`) | **CRITICAL** |

---

## 2. Frontend Application Inventory (`frontend/src/apps/`)

| Module / Component | File Path | Route(s) | Dependencies | Authentication / Context | Current Status | Critical Flaws / Risks |
|---|---|---|---|---|---|---|
| **LandingWebsite** | `frontend/src/apps/landing/LandingWebsite.tsx` | `/`, `/landing`, `/home`, `/about`, `/contact`, `/pricing` | React, Lucide Icons, UI components | Public (Unauthenticated) | **VERIFIED** | Static marketing landing page; clean render, 0 errors. |
| **WorkspaceSelector** | `frontend/src/apps/onboarding/WorkspaceSelector.tsx` | `/workspace`, `/workspaces` | `api.getOwnerRestaurants`, Firebase Auth | Authenticated Google Owner (`currentUser`) | **BROKEN** | Trapped in infinite spinner `"Loading restaurant workspaces..."` when API call hangs; no timeout or fallback error state. |
| **SetupWizard** | `frontend/src/apps/onboarding/SetupWizard.tsx` | `/onboarding`, `/wizard`, `/setup` | `api.createRestaurant`, `api.submitRestaurant` | Authenticated Google Owner | **UNVERIFIED IN PROD** | Multi-step restaurant creation form; attempts to create restaurant with tables and domains. |
| **PendingApprovalPage** | `frontend/src/apps/onboarding/PendingApprovalPage.tsx` | `/pending-approval`, `/submitted` | `realtimeBus`, `api.getRestaurantDetails` | Authenticated Restaurant Owner | **UNVERIFIED IN PROD** | Displays approval status and waiting screen. Relies on WebSocket connection. |
| **PlatformApp** | `frontend/src/apps/platform/PlatformApp.tsx` | `/admin`, `/admin/*` | `api.getAdminRestaurants`, `api.approveRestaurant`, `api.rejectRestaurant` | `PLATFORM_ADMIN` role required | **VERIFIED UI / UNVERIFIED DATA** | Admin control plane for reviewing pending restaurants, analytics, and audit logs. |
| **CustomerApp** | `frontend/src/apps/customer/CustomerApp.tsx` | `/customer`, `/menu`, `https://<slug>.dinely.food/customer` | `api.getMenu`, `api.createOrder`, `api.createCustomerRequest` | Public Customer (QR Scanned Table Session) | **BROKEN IN PROD** | Fails to resolve tenant on live subdomains because API `/restaurants/public/resolve` is unreachable. |
| **KitchenETADashboard** | `frontend/src/apps/restaurant/KitchenETADashboard.tsx` | `/kitchen`, `/kds`, `https://<slug>.dinely.food/kitchen` | `api.getOrders`, `api.updateOrderStatus`, `realtimeBus` | `KITCHEN` role or Owner | **UNVERIFIED IN PROD** | KDS terminal with live order preparation timer, station filters, audio chimes. |
| **WaiterTerminalOS** | `frontend/src/apps/waiter/WaiterTerminalOS.tsx` | `/waiter`, `/servo`, `https://<slug>.dinely.food/waiter` | `api.getCustomerRequests`, `api.getOrders`, `api.closeTableSession` | `WAITER` role or Owner | **UNVERIFIED IN PROD** | Table floor plan, live assistance alerts, order entry, and session closure. |
| **BarTerminal** | `frontend/src/apps/bar/BarTerminal.tsx` | `/bar`, `https://<slug>.dinely.food/bar` | `api.getOrders`, `api.updateOrderStatus` | `BAR` role or Owner | **UNVERIFIED IN PROD** | Drink fulfillment queue; filters items destined for BAR. |
| **InventoryTerminalOS** | `frontend/src/apps/inventory/InventoryTerminalOS.tsx` | `/inventory`, `https://<slug>.dinely.food/inventory` | `api.getInventory`, `api.updateStock` | `INVENTORY` role or Owner | **UNVERIFIED IN PROD** | Stock management, low-stock warnings, supplier tracking. |
| **RestaurantOperationsCenter** | `frontend/src/apps/operations/RestaurantOperationsCenter.tsx` | `/operations`, `/restaurant/dashboard` | All operational sub-APIs | Authenticated Owner / Manager | **UNVERIFIED IN PROD** | Unified operational hub switcher for multi-station venues. |
| **AuthPage** | `frontend/src/apps/auth/AuthPage.tsx` | `/login`, `/auth`, `/signin` | Firebase Auth (`signInWithPopup`, GoogleAuthProvider) | Public | **VERIFIED** | Google OAuth popup handler and session initialization. |
| **RoleLoginPage** | `frontend/src/apps/auth/RoleLoginPage.tsx` | `/login?portal=*`, `/<portal>/login` | Firebase Auth / Staff Passcode | Staff / Terminal | **VERIFIED** | Role-tailored login screen for staff terminals on tenant subdomains. |
| **NotFoundPage** | `frontend/src/apps/auth/NotFoundPage.tsx` | `*` (Fallback) | UI Button, DinelyLogo | Public | **VERIFIED** | 404 handler for invalid routes or unknown tenant subdomains. |

---

## 3. Frontend Core Packages (`frontend/src/packages/`)

| Package / File | Purpose | Key Exports / Classes | Risk / Finding |
|---|---|---|---|
| `packages/api/client.ts` | Monolithic API Client & Local State Cache | `api`, `ApiClient`, `getApiBaseUrl`, `getProductionOrigin`, `getPortalScopeFromPath` | **5,914 lines** monolithic file containing duplicate business logic, fragmented storage keys, and hardcoded `https://dineflow-v3.onrender.com/api/v1` fallback. |
| `packages/api/realtime.ts` | WebSocket Client Connection Manager | `realtimeBus`, `RealtimeBus` | Manages single WebSocket connection with auto-reconnect, exponential backoff, and tenant subscription scoping. |
| `packages/auth/firebase.ts` | Firebase Client SDK Configuration & Helpers | `firebaseAuth`, `googleProvider`, `signInWithGoogle`, `signOutFirebase` | Configured with live project `dinely-cd6cd` (API Key: `AIzaSy...`). Client SDK initialized synchronously. |
| `packages/utils/tenantResolver.ts` | Hostname & Subdomain Tenant Extractor | `getTenantFromHostname`, `resolveTenantAppFromPath`, `getRestaurantPublicDomain`, `getRestaurantCustomerUrl` | Authoritative frontend tenant resolver. Extracts slug from `*.dinely.food`, `*.localhost`, and preserves custom domains. |
| `packages/utils/tableUtils.ts` | Table Number Formatter & Fuzzy Matcher | `matchTableNumber`, `formatStandardTableNumber` | Normalizes table strings (`"01"`, `"Table 01"`, `"Table-1"`, `"T1"`) for cross-version compatibility. |
| `packages/types/` | TypeScript Type Contracts | `Restaurant`, `Order`, `Table`, `Bill`, `User`, `WorkspaceType` | Domain type definitions shared across all frontend apps. |
| `packages/ui/` | Shared Design System Components | `Button`, `Card`, `Badge`, `Modal`, `Table`, `LoadingScreen`, `AccessDeniedScreen`, `DinelyLogo` | Tailwind v4 custom UI components. |

---

## 4. Backend Architecture & Router Inventory (`backend/dineflow-backend/app/`)

### Active Routers Registered in `main.py`

| Router Prefix | Router Module File | Primary Endpoints | Database Entities Accessed | RBAC & Security Level |
|---|---|---|---|---|
| `/api/v1/auth` | `app/modules/auth/router.py` | `POST /verify`, `POST /refresh`, `GET /me`, `POST /logout` | `users`, `restaurant_memberships` | Public / Bearer Token |
| `/api/v1/admin` | `app/modules/platform/router.py` | `GET /restaurants`, `GET /stats`, `POST /restaurants/approve`, `POST /restaurants/reject`, `POST /restaurants/archive`, `POST /restaurants/purge-test-records` | `restaurants`, `restaurant_lifecycle_logs`, `restaurant_domains` | `PLATFORM_ADMIN` only (hardcoded email `ayan090912@gmail.com` or `is_admin=True` claim) |
| `/api/v1/restaurants` | `app/modules/restaurants/router.py` | `POST /`, `GET /{id}`, `GET /owner/my`, `POST /{id}/submit`, `GET /public/resolve`, `GET /public/slug/{slug}`, `PUT /{id}/theme` | `restaurants`, `restaurant_memberships`, `restaurant_domains`, `restaurant_lifecycle_logs` | Mixed: Public resolution, Owner for mutations, Admin cross-tenant |
| `/api/v1/restaurants` | `app/modules/tables/router.py` | `GET /{id}/tables`, `POST /{id}/tables`, `GET /{id}/tables/{tid}/session`, `POST /{id}/tables/{tid}/session`, `POST /{id}/tables/{tid}/close-session` | `tables`, `table_sessions`, `restaurants` | Public for QR table scan, Staff/Owner for table creation & closure |
| `/api/v1/restaurants` | `app/modules/menu/router.py` | `GET /{id}/menu`, `GET /{id}/categories`, `POST /{id}/menu`, `POST /{id}/categories`, `PATCH /{id}/menu/{item_id}` | `menu_categories`, `menu_items` | Public GET for digital menu, Owner/Manager for mutations |
| `/api/v1/restaurants` | `app/modules/taxes/router.py` | `GET /{id}/taxes`, `POST /{id}/taxes`, `PUT /{id}/taxes/{tax_id}` | `taxes` | Owner / Manager |
| `/api/v1/restaurants` | `app/modules/billing/router.py` | `GET /{id}/billing/config`, `POST /{id}/billing/calculate`, `POST /{id}/billing/generate`, `POST /{id}/billing/{bill_id}/pay` | `bills`, `orders`, `tables`, `restaurants` | Staff, Cashier, Owner |
| `/api/v1/orders` | `app/modules/orders/router.py` | `POST /`, `GET /{id}`, `GET /restaurant/{id}`, `PATCH /{id}/status` | `orders`, `order_items`, `table_sessions`, `restaurants` | Public POST (Customer orders), Staff/Owner for retrieval & status updates |
| `/api/v1/customer-requests` | `app/modules/customer_requests/router.py` | `POST /`, `GET /`, `PATCH /{id}` | `customer_requests`, `restaurants` | Public POST (Water/Bill requests), Staff for retrieval & fulfillment |
| `/api/v1` | `app/modules/websocket/router.py` | `WS /ws/{restaurant_id}`, `WS /ws/global`, `WS /ws/admin` | In-Memory `ConnectionManager` | Authenticated Staff / Owner / Admin / Customer |

---

## 5. Dormant / Dead Modules (`app/modules/`)

The following 27 module directories exist on disk in `backend/dineflow-backend/app/modules/` but **have NO registered router in `main.py`**:

| Module Name | File Contents | Status | Assessment |
|---|---|---|---|
| `admin` | `__init__.py` | **EMPTY** | Superseded by `platform/router.py` |
| `analytics` | `__init__.py` | **EMPTY** | Analytics logic partially embedded in `platform/router.py` |
| `audit` | `__init__.py` | **EMPTY** | Audit logs handled in `restaurant_lifecycle_logs` |
| `branches` | `__init__.py` | **EMPTY** | Multi-branch schema stub; unused |
| `carts` | `__init__.py` | **EMPTY** | Cart handled client-side in `CustomerApp` |
| `categories` | `__init__.py` | **EMPTY** | Categories handled in `menu/router.py` |
| `customers` | `__init__.py` | **EMPTY** | Unused legacy CRM stub |
| `domains` | `__init__.py` | **EMPTY** | Domain resolution handled in `restaurants/router.py` & `tenant/resolver.py` |
| `employees` | `__init__.py`, `models.py` | **DORMANT** | UUID-based Employee model completely detached from `RestaurantMembership` |
| `feature_flags` | `__init__.py` | **EMPTY** | Unused stub |
| `inventory` | `__init__.py` | **EMPTY** | Backend inventory endpoints completely missing (frontend uses mock cache) |
| `kitchen` | `__init__.py` | **EMPTY** | Kitchen order status handled via `orders/router.py` |
| `modifiers` | `__init__.py` | **EMPTY** | Unused item modifier stub |
| `notifications` | `__init__.py` | **EMPTY** | Handled via WebSocket broadcasts |
| `order_items` | `__init__.py` | **EMPTY** | Handled in `orders/router.py` |
| `payments` | `__init__.py` | **EMPTY** | Billing/payments partially handled in `billing/router.py` |
| `permissions` | `__init__.py`, `models.py`, `role_permission.py` | **DORMANT** | Detached granular permission schema |
| `restaurant_features` | `__init__.py` | **EMPTY** | Handled in `restaurants.enabled_modules` JSON column |
| `restaurant_settings` | `__init__.py` | **EMPTY** | Handled directly on `Restaurant` model columns |
| `restaurant_theme` | `__init__.py` | **EMPTY** | Handled via `restaurants.theme_json` column |
| `roles` | `__init__.py`, `models.py` | **DORMANT** | Detached role table; RBAC currently uses string literals on `RestaurantMembership` |
| `sessions` | `__init__.py` | **EMPTY** | Table sessions handled in `tables/router.py` |
| `subscriptions` | `__init__.py` | **EMPTY** | SaaS billing subscription stub; unimplemented |
| `suppliers` | `__init__.py` | **EMPTY** | Unused inventory supplier stub |
| `support` | `__init__.py` | **EMPTY** | Customer support ticket stub; unused |
| `users` | `__init__.py`, `models.py` | **DORMANT** | Local user/password table; incompatible with Firebase auth identity architecture |
| `waiters` | `__init__.py` | **EMPTY** | Waiter operations handled in `customer_requests/` & `tables/` |

---

## 6. Database Entity Inventory (`Neon PostgreSQL`)

| Table Name | Primary Key | Tenant Scoping Column | Foreign Keys Present? | Unique Constraints | Status & Integrity Assessment |
|---|---|---|---|---|---|
| `restaurants` | `id` (VARCHAR) | Self (`id`) | None | `public_slug` (conditional index) | **ACTIVE CORE**. Stores tenant metadata, lifecycle status, ownership references. |
| `restaurant_memberships` | `id` (VARCHAR) | `restaurant_id` (VARCHAR) | FK -> `restaurants.id` (CASCADE) | `(restaurant_id, user_uid)` | **ACTIVE CORE**. Authoritative mapping of Google Firebase users to tenant roles. |
| `restaurant_domains` | `id` (VARCHAR) | `restaurant_id` (VARCHAR) | None (Missing explicit FK) | `hostname` | **ACTIVE CORE**. Maps subdomains and custom domains to `restaurant_id`. |
| `restaurant_lifecycle_logs` | `id` (VARCHAR) | `restaurant_id` (VARCHAR) | None (Missing explicit FK) | None | **ACTIVE AUDIT**. Tracks status changes (`CREATED`, `SUBMITTED`, `APPROVED`, `REJECTED`). |
| `tables` | `id` (VARCHAR) | `restaurant_id` (VARCHAR) | FK -> `restaurants.id` (CASCADE) | Missing composite `(restaurant_id, table_number)` | **ACTIVE CORE**. Stores physical tables and encoded QR URLs. |
| `table_sessions` | `id` (VARCHAR) | `restaurant_id` (VARCHAR) | FK -> `restaurants.id`, FK -> `tables.id` | Missing active uniqueness constraint | **ACTIVE CORE**. Tracks customer active dining sessions. |
| `menu_categories` | `id` (VARCHAR) | `restaurant_id` (VARCHAR) | FK -> `restaurants.id` (CASCADE) | None | **ACTIVE CORE**. Menu category groupings. |
| `menu_items` | `id` (VARCHAR) | `restaurant_id` (VARCHAR) | FK -> `restaurants.id`, FK -> `menu_categories.id` | None | **ACTIVE CORE**. Menu item catalog with pricing and destination. |
| `orders` | `id` (VARCHAR) | `restaurant_id` (VARCHAR) | FK -> `restaurants.id`, FK -> `tables.id` (NULL) | None | **ACTIVE CORE**. Customer orders with status, total amounts, item JSON. |
| `order_items` | `id` (VARCHAR) | Implicit via `order_id` | FK -> `orders.id` (CASCADE) | None | **ACTIVE CORE**. Line items for kitchen and bar dispatch. |
| `bills` | `id` (VARCHAR) | `restaurant_id` (VARCHAR) | FK -> `restaurants.id` (CASCADE) | None | **ACTIVE CORE**. Final invoices, taxes, round-off, payment tracking. |
| `taxes` | `id` (VARCHAR) | `restaurant_id` (VARCHAR) | FK -> `restaurants.id` (CASCADE) | None | **ACTIVE CORE**. GST, VAT, service tax rates. |
| `customer_requests` | `id` (VARCHAR) | `restaurant_id` (VARCHAR) | None (Missing explicit FK) | None | **ACTIVE CORE**. Live waiter assistance tickets (Water, Bill, Call). |
| `users` | `id` (UUID) | `restaurant_id` (UUID) | FK -> `restaurants.id` | `(restaurant_id, email)` | **DORMANT / ARCHITECTURAL CONFLICT**. UUID-based legacy local user table. |
| `employees` | `id` (UUID) | `restaurant_id` (UUID) | FK -> `users.id`, `branches.id`, `roles.id` | `(restaurant_id, user_id)` | **DORMANT / ARCHITECTURAL CONFLICT**. Detached from live auth flow. |
| `roles` | `id` (UUID) | None | None | `name` | **DORMANT / UNUSED**. |
| `permissions` | `id` (UUID) | None | None | `name` | **DORMANT / UNUSED**. |
| `role_permissions` | `id` (UUID) | None | FK -> `roles.id`, FK -> `permissions.id` | `(role_id, permission_id)` | **DORMANT / UNUSED**. |

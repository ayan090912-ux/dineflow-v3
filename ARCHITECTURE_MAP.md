# DINELY — SYSTEM ARCHITECTURE MAP (ARCHITECTURE_MAP.md)
**Document Status:** Complete Forensic Trace  
**Audited Targets:** Frontend, Backend, Database, Cloudflare/DNS, Firebase, Terminals

---

## 1. End-to-End System Topography

```
                                [ PUBLIC INTERNET ]
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
           Apex: dinely.food                       Subdomain: *.dinely.food
     [ GoDaddy DNS (ns05/ns06) ]              [ GoDaddy DNS (ns05/ns06) ]
                    │                                       │
                    ▼                                       ▼
       A Record: 199.36.158.100                  [ NO DNS RECORD EXISTS ]
                    │                                       │
                    ▼                                       ▼
          [ Firebase Hosting ]                   [ NXDOMAIN / FAIL ]
          (Serves Single SPA)                               │
                    │                                (Cloudflare Worker
                    │                                 is NOT attached)
                    ▼
     [ Browser: React 19 Frontend ]
      ├── URL Router (Custom Regex)
      ├── LocalStorage Mock DB (client.ts: 5,916 LOC)
      └── Firebase JS SDK (Auth)
                    │
                    ▼ HTTPS REST & WSS
        [ Render Web Service ]
        (dineflow-v3.onrender.com)
      ├── FastAPI (Python 3.11)
      ├── Tenant Guard & RBAC
      ├── WebSocket Room Manager
      └── SQLAlchemy 2.0 Async
                    │
                    ▼ Async Engine
        [ PostgreSQL Database ]
        (Hosted on Render)
```

---

## 2. Subsystem Architecture Breakdowns

### 2.1 Frontend Architecture
- **Location:** `frontend/src/`
- **Entry Points:**
  - `main.tsx`: Mounts React DOM to `#root`.
  - `App.tsx`: Central coordinator. Reads `window.location.hostname` and `window.location.pathname`.
- **Portal & Terminal Routing:**
  - `/` → `LandingPage` (Marketing, navigation, CTA).
  - `/wizard`, `/onboarding` → `OnboardingWizard` (Restaurant creation form).
  - `/workspace` → `OwnerApp` (Multi-restaurant dashboard for owner).
  - `/admin`, `/admine/loginer` → `PlatformApp` (Platform Admin management portal).
  - `/customer` → `CustomerApp` (Dine-in menu, cart, order placement).
  - `/kitchen` → `KitchenApp` (Kitchen Display System / KDS).
  - `/waiter` → `WaiterApp` (Waiter call management, floor view).
  - `/bar` → `BarApp` (Drink fulfillment queue).
  - `/inventory` → `InventoryApp` (Stock management, supply tracking).
  - `/billing` → `BillingApp` (Invoice generation, payment marking).

### 2.2 Backend Architecture
- **Location:** `backend/dineflow-backend/app/`
- **Main Application:** `app/main.py`
- **Routers Mounted:**
  - `/api/v1/auth` → Firebase token exchange, staff authentication (`auth/router.py`).
  - `/api/v1/admin` → Platform admin approvals, audit logs, metrics (`platform/router.py`).
  - `/api/v1/restaurants` → Restaurant CRUD, domain resolution, settings (`restaurants/router.py`).
  - `/api/v1/restaurants/{id}/menu` → Categories, menu items (`menu/router.py`).
  - `/api/v1/restaurants/{id}/tables` → Table layouts, QR code generation (`tables/router.py`).
  - `/api/v1/orders` → Customer ordering, KDS status updates (`orders/router.py`).
  - `/api/v1/customer-requests` → Waiter calls, bill requests (`customer_requests/router.py`).
  - `/api/v1/ws/{restaurant_id}` → Live bi-directional WebSockets (`websocket/router.py`).

### 2.3 Database Architecture (PostgreSQL)
- **Tables & Relationships:**
  - `restaurants`: Primary tenant record (`id`, `name`, `slug`, `public_slug`, `owner_uid`, `owner_email`, `lifecycle_status`, `is_approved`, `status`).
  - `restaurant_domains`: Domain mappings (`id`, `restaurant_id`, `hostname`, `domain_type`, `is_primary`).
  - `restaurant_lifecycle_logs`: Audit trail for approval/rejection state transitions.
  - `tables`: Physical tables per restaurant (`id`, `restaurant_id`, `table_number`, `qr_code_url`, `status`).
  - `table_sessions`: Active dine-in sessions per table (`id`, `restaurant_id`, `table_id`, `status`).
  - `orders`: Order header (`id`, `restaurant_id`, `table_id`, `table_session_id`, `order_number`, `status`, `total_amount`).
  - `order_items`: Line items (`id`, `order_id`, `menu_item_id`, `name`, `quantity`, `unit_price`, `target_destination`).
  - `bills`: Invoices and checkout totals (`id`, `restaurant_id`, `table_session_id`, `invoice_number`, `payment_status`).
  - `menu_categories` & `menu_items`: Tenant catalog.
  - `inventory_items` & `suppliers`: Back-of-house procurement.

### 2.4 Authentication Architecture
- **Platform Admin Auth:**
  - Google Firebase Auth popup generates a Firebase ID token.
  - Token sent to backend via `Authorization: Bearer <token>`.
  - Backend verifies token via Firebase Admin Python SDK.
  - Backend strictly asserts `email == 'ayan090912@gmail.com'`. Non-matching emails receive HTTP 403 Forbidden.
- **Restaurant Owner Auth:**
  - Google Firebase Auth popup generates Firebase ID token.
  - Backend matches `owner_uid == token['uid']` or `owner_email == token['email']`.
- **Terminal Staff Auth (Chef, Waiter, Bartender):**
  - Stored in `localStorage` or generated via PIN/credential login.
  - Disconnect: Header spoofing allows passing `X-Staff-Role` without cryptographic tokens.

### 2.5 Tenant & Domain Architecture
- **Canonical Model:** Every restaurant has a unique `public_slug` (e.g. `the-dunk`).
- **Domain Model:** Subdomain format is `https://the-dunk.dinely.food`.
- **Routing Failure:** Because DNS nameservers point to GoDaddy without wildcard records, all requests to subdomains fail before reaching Firebase or Render.

### 2.6 Realtime WebSocket Architecture
- **Connection URL:** `wss://dineflow-v3.onrender.com/api/v1/ws/{restaurant_id}?token={token}`
- **Broadcast Channels:**
  - Tenant room: `restaurant_{restaurant_id}` (notifies Kitchen, Waiter, Bar, Customer).
  - Admin room: `__platform_admin__` (notifies Platform Admin of new restaurant applications).
- **Failure:** On client disconnects, `realtime.ts` triggers reconnect loops, but does not replay missed PostgreSQL events.

---

## 3. Identity Mapping Matrix

| Identity Entity | Issued By | Current Frontend ID Format | Current Backend / DB ID Format | Match / Conflict Status |
| :--- | :--- | :--- | :--- | :--- |
| **User** | Firebase Auth | Firebase `uid` (28 chars) | Firebase `uid` in `owner_uid` | Match |
| **Owner** | Firebase Auth | `usr-owner-${Date.now()}` or Firebase UID | Stored in `restaurants.owner_uid` and `restaurants.owner_email` | **Conflict:** Frontend generates synthetic user IDs when registering via email |
| **Restaurant** | Frontend / Backend | `rest-${Date.now()}` (generated in `client.ts:1434`) | `rest-${timestamp}-${uuid}` or client-supplied string | **Conflict:** Client pre-empts server ID generation |
| **Public Slug** | Frontend / Backend | Derived in `client.ts:1431` via regex | Computed in `generate_unique_public_slug` (router.py:20) | **Conflict:** Both compute slugs independently; risk of collision |
| **Table** | Backend / Frontend | `tbl-${restId}-table_${num}` | `tbl-${rest_id}-table_${num}` | Match format, but orphan if restaurant ID differs |
| **Session** | Backend / Frontend | `sess-${restId}-${tblId}-${timestamp}` | `sess-${restaurant_id}-${tbl_id}-${timestamp}` | Match format |
| **Order** | Backend / Frontend | `ord-${Date.now()}` | `ord-${restaurant_id}-${timestamp}` | **Conflict:** Frontend creates local order before server confirmation |
| **Domain** | Backend / DB | Computed URL string | `dom-${restaurant_id}` in `restaurant_domains` | **Conflict:** In DB as subdomain, but non-existent in public DNS |

---

## 4. Conflicting Sources of Truth

| Domain Area | Source of Truth A | Source of Truth B | Source of Truth C | Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Restaurant ID** | `localStorage['dinely_active_restaurant_id']` | Active route URL / subdomain | PostgreSQL `restaurants.id` | Cross-tenant contamination if user switches restaurants or views as guest |
| **Lifecycle Status** | `client.ts: this.restaurants[i].lifecycleStatus` | `restaurants.lifecycle_status` (PostgreSQL) | `restaurants.is_approved` (PostgreSQL bool) | A restaurant can be marked `is_approved=True` while `lifecycle_status='PENDING_APPROVAL'` |
| **Operational Status** | `client.ts: status ('OPEN' / 'CLOSED')` | `restaurants.status` (PostgreSQL) | Hardcoded defaults in terminal UI | Terminals display "Closed" even when restaurant is live |
| **Tenant Domain** | `window.location.origin` (Returns `https://dinely.food`) | `https://<slug>.dinely.food` (Canonical intent) | `restaurant_domains.hostname` (PostgreSQL) | Canonical public domain resolves to apex platform instead of tenant subdomain |
| **Active Orders** | `client.ts: this.orders` (localStorage) | `orders` table (PostgreSQL) | In-memory WebSocket room state | Kitchen terminal displays orders that were never committed to PostgreSQL |

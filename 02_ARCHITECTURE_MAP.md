# DINELY — 02 ARCHITECTURE MAP & CRITICAL FLOW TRACES

**Document Status:** Complete Forensic Architecture Map  
**Target Systems:** Frontend (React 19 SPA), Backend (FastAPI + SQLAlchemy 2.0 Async), Database (Neon / Render PostgreSQL), Edge Routing (Cloudflare Workers), Auth (Firebase Google Identity), Event Broker (WebSocket ConnectionManager)  
**Classification:** Authoritative Technical Trace  

---

## 1. Global Architectural Topology

```
                                [ CLIENT BROWSER ]
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
          Apex: dinely.food                      Tenant Subdomain: *.dinely.food
      [ DNS: GoDaddy / Cloudflare ]           [ DNS: CNAME *.dinely.food -> Cloudflare ]
                    │                                       │
                    ▼                                       ▼
      [ Firebase Hosting CDN ]                   [ Cloudflare Worker Edge ]
      (dinely-cd6cd.web.app)                     (cloudflare/dinely-tenant-router)
                    │                                       │
                    │                             Extract Subdomain / Slug
                    │                             Proxy to Firebase Hosting
                    │                             Inject X-Dinely-Tenant-Slug
                    │                             Preserve Host Header
                    └───────────────────┬───────────────────┘
                                        ▼
                        [ React 19 Single Page Application ]
                        ├── packages/utils/tenantResolver.ts (Extracts slug from Host)
                        ├── packages/auth/firebase.ts (Google OAuth / Firebase Client)
                        ├── packages/api/client.ts (REST API Client + LocalStorage fallback)
                        └── packages/api/realtime.ts (WebSocket Client with auto-reconnect)
                                        │
                        ┌───────────────┴───────────────┐
                        ▼ HTTPS (REST API)              ▼ WSS (Live Events)
       https://dineflow-v3.onrender.com/api/v1      wss://dineflow-v3.onrender.com/api/v1/ws/{id}
                        │                               │
                        └───────────────┬───────────────┘
                                        ▼
                            [ FastAPI Web Application ]
                            ├── app/common/middleware.py (CORS, Request ID, Tenant Injection)
                            ├── app/common/dependencies.py (get_db, get_caller_context)
                            ├── app/modules/auth/service.py (Firebase Token & CallerContext)
                            ├── app/modules/websocket/manager.py (ConnectionManager Room Broker)
                            └── Routers: auth, platform, restaurants, tables, menu, orders, billing
                                        │
                                        ▼ Asyncpg Connection Pool
                            [ Neon Serverless PostgreSQL ]
                            ├── Multi-Tenant Tables (keyed by restaurant_id: UUID)
                            ├── Global Tables (users, platform admins, audit logs)
                            └── Schema sync: SQLAlchemy declarative + startup ALTER scripts
```

---

## 2. End-to-End Business Flow Traces

### Flow 1: Platform Landing & Tenant Resolution
1. **User Request**: User opens `https://dinely.food` or `https://the-dunk.dinely.food/customer?table=01`.
2. **Edge Proxying**:
   - For `dinely.food`: DNS points directly to Firebase Hosting CDN (`199.36.158.100`). CDN serves static `index.html` + bundle.
   - For `the-dunk.dinely.food`: Handled by Cloudflare Worker (`cloudflare/dinely-tenant-router/worker.js`). Worker checks subdomain `the-dunk`, sets `X-Dinely-Tenant-Slug: the-dunk`, proxies request to Firebase Hosting origin (`https://dinely-cd6cd.web.app`), and responds to client with preserved cookie/CORS.
3. **Frontend Boot**:
   - `frontend/src/main.tsx` mounts `#root`.
   - `frontend/src/App.tsx` calls `packages/utils/tenantResolver.ts`:
     - Evaluates `window.location.hostname`.
     - Detects apex (`dinely.food`) vs tenant subdomain (`the-dunk.dinely.food`).
     - If subdomain: calls `resolveTenantAppFromPath()` -> routes to `CustomerApp` if `/customer` or `/menu`, `KitchenETADashboard` if `/kitchen`, `WaiterTerminalOS` if `/waiter`, etc.
     - If apex: renders `LandingWebsite` for `/`, `WorkspaceSelector` for `/workspace`, `PlatformApp` for `/admin`.
4. **Tenant Verification**:
   - If subdomain is present, `App.tsx` calls `api.resolveTenant(slug)` -> `GET /api/v1/restaurants/public/resolve?subdomain=the-dunk` or `GET /api/v1/restaurants/public/slug/the-dunk`.
   - **Current Failure Point**: When backend on Render hangs or fails, `api.resolveTenant()` never returns, trapping the UI in an infinite loading spinner `"Connecting to Restaurant... Resolving tenant the-dunk"`.

---

### Flow 2: Owner Authentication & Workspace Restoration
1. **Initiation**: Owner visits `https://dinely.food/workspace` or clicks "Sign In" on landing page.
2. **Firebase Auth Flow**:
   - Triggers `signInWithPopup(firebaseAuth, googleProvider)` in `frontend/src/packages/auth/firebase.ts`.
   - Firebase returns Google User credential with `idToken`, `uid`, `email`, `displayName`.
3. **Backend Session Exchange**:
   - Client sends `POST /api/v1/auth/verify` with payload `{ "firebase_token": idToken }`.
   - Handled in `backend/dineflow-backend/app/modules/auth/router.py` -> `auth_service.verify_firebase_token()`.
   - Decodes token via `firebase_admin.auth.verify_id_token()`.
   - Queries `users` table by `firebase_uid` or `email`. If not found, creates user record.
   - Queries `restaurant_memberships` table for all restaurants where `user_id = user.id`.
   - Returns JWT session token + User Profile + array of owned/accessible restaurants.
4. **Workspace Hydration**:
   - `frontend/src/apps/onboarding/WorkspaceSelector.tsx` invokes `api.getOwnerRestaurants()`.
   - Client fetches `GET /api/v1/restaurants/owner/my` with `Authorization: Bearer <token>`.
   - Backend queries `RestaurantMembership` where `user_id == caller.user_id`, joins `Restaurant`, and returns list.
   - **Current Failure Point**: Free-tier Render cold starts or database query pool exhaustion causes `WorkspaceSelector` to hang indefinitely at `"Loading restaurant workspaces..."`.

---

### Flow 3: Restaurant Creation & Admin Approval Lifecycle
1. **Creation Initiation**:
   - From Workspace, Owner clicks "+ Add Restaurant" -> navigates to `/onboarding`.
   - Renders `frontend/src/apps/onboarding/SetupWizard.tsx`.
2. **Wizard Submission**:
   - Step 1: Restaurant Details (Name, Subdomain/Slug, Phone, Address, Currency).
   - Step 2: Theme / Branding (Primary color, Logo URL, Accent color).
   - Step 3: Table Setup (Floor count, table names/numbers).
   - Step 4: Initial Menu Setup (Categories, Items, Prices).
   - Submission triggers `POST /api/v1/restaurants/` with configuration payload.
3. **Backend Service Processing**:
   - Handled by `app/modules/restaurants/router.py` -> `restaurant_service.create_restaurant()`.
   - Generates `restaurant_id = uuid4()`.
   - Validates uniqueness of `slug` / subdomain in `restaurants` and `restaurant_domains`.
   - Writes to `restaurants` table with `status = "DRAFT"`.
   - Writes record to `restaurant_memberships` (`user_id = caller.user_id, restaurant_id = new_id, role = "OWNER"`).
   - Writes tables to `tables` table.
   - Writes initial menu to `menu_categories` and `menu_items`.
   - Writes lifecycle log: `restaurant_lifecycle_logs` with `action = "CREATED", from_status = null, to_status = "DRAFT"`.
4. **Submission for Approval**:
   - Owner submits restaurant for verification: `POST /api/v1/restaurants/{id}/submit`.
   - Backend updates status: `status = "PENDING_APPROVAL"`.
   - Emits event: `manager.broadcast_admin("restaurant_submitted", { restaurant_id, name, slug })`.
5. **Platform Admin Review**:
   - Admin logs into `https://dinely.food/admin` -> `frontend/src/apps/platform/PlatformApp.tsx`.
   - Admin fetches `GET /api/v1/admin/restaurants?status=PENDING_APPROVAL`.
   - Admin clicks "Approve": `POST /api/v1/admin/restaurants/{id}/approve`.
   - Backend transitions status `PENDING_APPROVAL -> LIVE`.
   - Records lifecycle log.
   - Broadcasts event `manager.broadcast_restaurant(restaurant_id, "restaurant_approved", { status: "LIVE" })`.
   - Subdomain `the-dunk.dinely.food` is now active for customer traffic.

---

### Flow 4: Customer QR Scanning, Cart & Order Placement
1. **QR Scan**:
   - Customer scans physical QR table placard encoded with:  
     `https://the-dunk.dinely.food/customer?table=01`
2. **Session Initialization**:
   - `CustomerApp.tsx` mounts on subdomain `the-dunk.dinely.food`.
   - Extracts `table=01` from `window.location.search`.
   - Client calls `POST /api/v1/restaurants/{restaurant_id}/tables/01/session` to obtain or resume a `table_session_id`.
   - Backend checks active session in `table_sessions` where `table_id == table.id` and `is_active == True`. If none, creates new session.
3. **Menu Fetching**:
   - Client requests `GET /api/v1/restaurants/{restaurant_id}/menu`.
   - Backend executes single joined query for active `menu_categories` and available `menu_items`.
   - Renders category navigation and dish cards.
4. **Order Placement**:
   - Customer adds items to local cart, selects modifiers, and presses "Place Order".
   - Client executes `POST /api/v1/orders/` with payload:
     ```json
     {
       "restaurant_id": "907a731b-75e1-4c6e-8d8a-8e50b7194f1c",
       "table_number": "01",
       "table_session_id": "550e8400-e29b-41d4-a716-446655440000",
       "items": [
         { "menu_item_id": "uuid-1", "quantity": 2, "notes": "No onions" },
         { "menu_item_id": "uuid-2", "quantity": 1, "station": "BAR" }
       ]
     }
     ```
5. **Order Dispatch & Database Transaction**:
   - Handled in `app/modules/orders/router.py`.
   - Begins database transaction:
     - Inserts row into `orders` with `status = "PLACED"`, timestamps, total amount.
     - Inserts rows into `order_items`.
     - Commits transaction.
6. **Realtime Broadcast**:
   - Backend calls `ConnectionManager.broadcast_restaurant(restaurant_id, "order_created", order_payload)`.
   - Sends payload to:
     - `restaurant:{id}:kitchen` (All items with station == 'KITCHEN' or unassigned).
     - `restaurant:{id}:bar` (Items with station == 'BAR').
     - `restaurant:{id}:waiter` (Notification of new table order).
     - `restaurant:{id}:customer:{table_session_id}` (Confirmation & live status tracking).

---

### Flow 5: Operational Fulfillment (Kitchen & Bar Terminals)
1. **Terminal Connection**:
   - Kitchen staff at `https://the-dunk.dinely.food/kitchen` connects WebSocket:  
     `wss://dineflow-v3.onrender.com/api/v1/ws/{restaurant_id}?role=KITCHEN`
   - Initial HTTP fetch loads active tickets: `GET /api/v1/orders/restaurant/{id}?status=PLACED,PREPARING`.
2. **Order Receipt & Audio Chime**:
   - On `"order_created"` event: audio chime plays via Web Audio API, and new ticket appears in KDS queue.
3. **Status Transitions**:
   - Chef clicks "Start Preparing":  
     `PATCH /api/v1/orders/{order_id}/status` with `{"status": "PREPARING"}`.
   - Chef clicks "Mark Ready":  
     `PATCH /api/v1/orders/{order_id}/status` with `{"status": "READY"}`.
4. **Waiter Notification**:
   - Backend broadcasts `"order_status_updated"` to `restaurant:{id}:waiter`.
   - Waiter terminal displays alert: `"Table 01 — Order Ready for Pickup"`.

---

### Flow 6: Waiter Floor Service & Customer Assistance Requests
1. **Customer Service Call**:
   - From `CustomerApp`, customer presses "Call Waiter" -> selects reason ("Need Water", "Request Cutlery", "Request Bill").
   - Triggers `POST /api/v1/customer-requests/` with `{ "restaurant_id", "table_number", "request_type": "WATER" }`.
2. **Request Routing**:
   - Backend creates record in `customer_requests` with `status = "PENDING"`.
   - Broadcasts event `"customer_request_created"` to `restaurant:{id}:waiter`.
3. **Floor Response**:
   - Waiter at `https://the-dunk.dinely.food/waiter` sees blinking alert card on Table 01.
   - Waiter clicks "Acknowledge" -> `PATCH /api/v1/customer-requests/{id}` (`status = "IN_PROGRESS"`).
   - Waiter delivers water and clicks "Complete" -> `PATCH /api/v1/customer-requests/{id}` (`status = "COMPLETED"`).

---

### Flow 7: Billing, Payment & Table Session Closure
1. **Bill Generation**:
   - Triggered by Waiter or Cashier terminal:  
     `POST /api/v1/restaurants/{id}/billing/generate` with `{ "table_number": "01" }`.
2. **Calculation Engine**:
   - Backend queries all `orders` for Table 01 where `status != 'CANCELLED'`.
   - Queries `taxes` table for active tax rules for `restaurant_id` (e.g., GST 5%, Service Charge 10%).
   - Calculates Subtotal, Tax Breakdown, Discounts, and Grand Total.
   - Writes bill record to `bills` with `payment_status = "UNPAID"`.
3. **Payment Collection**:
   - Cashier collects cash or card:  
     `POST /api/v1/restaurants/{id}/billing/{bill_id}/pay` with `{ "payment_method": "CASH" | "CARD" | "UPI" }`.
   - Updates `bills.payment_status = "PAID"`.
4. **Session Closure**:
   - Calls `POST /api/v1/restaurants/{id}/tables/{table_number}/close-session`.
   - Sets `table_sessions.is_active = False`, `closed_at = NOW()`.
   - Updates table status to `"DIRTY"` or `"AVAILABLE"`.
   - Broadcasts `"table_session_closed"` to Customer and Waiter terminals. Customer phone refreshes to "Thank You" screen.

---

## 3. Realtime Event Bus & Channel Matrix

| Topic Channel Pattern | Target Roles | Events Broadcasted | Security & Isolation Enforcement |
|---|---|---|---|
| `restaurant:{id}:customer:{session_id}` | Guest at Table | `order_status_updated`, `bill_generated`, `session_closed` | Scoped strictly to matching `table_session_id`. No staff data leaked. |
| `restaurant:{id}:kitchen` | KDS Station Staff, Head Chef | `order_created`, `order_cancelled`, `item_recalled` | Filtered to food items only. Waiter requests excluded. |
| `restaurant:{id}:bar` | Bar Staff, Mixologist | `order_created` (bar items only), `order_cancelled` | Filtered strictly to `station == 'BAR'`. |
| `restaurant:{id}:waiter` | Floor Waiters, Floor Managers | `customer_request_created`, `order_ready`, `bill_requested` | Full floor events for active tables in restaurant. |
| `restaurant:{id}:billing` | Cashier, Accountant, Owner | `bill_generated`, `payment_completed`, `order_added` | Financial calculations and payment status events. |
| `restaurant:{id}:inventory` | Stock Manager, Head Chef | `stock_depleted`, `low_stock_warning` | Inventory adjustments following order deductions. |
| `global:admin` | Dinely Platform Admins | `restaurant_submitted`, `platform_alert` | Isolated platform channel. Regular restaurant tenants cannot subscribe. |

---

## 4. Current Failure Points & Architectural Weaknesses

1. **Unresponsive Backend Dependency**: The frontend Single Page Application currently has NO circuit breaker or timeout on API queries. When `dineflow-v3.onrender.com` is suspended or fails to respond, all critical apps (`WorkspaceSelector`, `CustomerApp`, `KitchenETADashboard`) hang indefinitely in a loading state.
2. **Missing Backend Inventory & Waiter Endpoints**: `app/modules/inventory/` and `app/modules/waiters/` contain no registered routers in `main.py`. The frontend staff terminals use local cache mocks for inventory adjustments and employee management.
3. **Imperative Schema Migrations**: Critical multi-tenant columns (such as `theme_json`, `enabled_modules`, `status`) are patched via raw string SQL execution during application startup (`_background_startup_init()`) rather than declarative Alembic revision files.
4. **Cloudflare Worker Routing Decoupling**: If DNS nameservers are pointed to GoDaddy without Cloudflare proxying enabled, requests to `*.dinely.food` fail at DNS resolution before ever reaching the Cloudflare Worker.

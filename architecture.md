# Dinely System Architecture & Technical Specifications

**Classification**: Production Architecture Reference  
**Version**: 3.0.0 (Production-Ready Target)  
**Last Audited**: September 2026  

---

## 1. Executive Summary & Architecture Philosophy

Dinely is a multi-tenant Cloud Operating System for restaurants inspired by the Shopify model. 

- **Identity**: Decoupled from tenant data. A single authenticated identity (Google / Firebase User) can own multiple independent restaurants.
- **Tenancy**: Every restaurant outlet is an isolated tenant with its own operational ecosystem (tables, menus, orders, KDS, Bar, inventory, staff, UPI/billing configuration).
- **Zero-Trust Boundaries**:
  - No fallback restaurants (Zero tolerance for `CAFE.CO` or `restaurants[0]`).
  - No cross-tenant data leaks.
  - Backend authorization authority via `CallerContext` on FastAPI + Neon PostgreSQL.
  - Frontend state only mirrors backend authorization.

---

## 2. Global Traffic & Routing Planes

```
                                  INTERNET TRAFFIC
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
       Primary Platform Plane                      Public Tenant Plane
       https://dinely.food                         https://<slug>.dinely.app
                   │                                           │
         Firebase Hosting Rewrites                   Firebase Hosting Rewrites
                   │                                           │
            Vite React SPA                              Vite React SPA
                   │                                           │
         App.tsx (Router Engine)                    App.tsx (Router Engine)
      ┌────────────┼────────────┐                              │
      ▼            ▼            ▼                              ▼
Landing/Auth   Workspace   Restaurant OS                  CustomerApp
 (Public)      (Owner)     (Owner/Staff)             (QR / Menu / Ordering)
```

| Plane | Host Pattern | Modules Exposed | Identity Context |
|---|---|---|---|
| **Platform Plane** | `dinely.food`<br>`www.dinely.food` | Landing (`/`), Login (`/login`), Workspace (`/workspace`), Setup Wizard (`/wizard`), Restaurant OS (`/restaurant/dashboard`), Platform Admin (`/admin/*`) | Firebase Auth (`owner_uid`, `email`) |
| **Public Customer Tenant Plane** | `<slug>.dinely.app`<br>`<slug>.localhost` | Digital Menu, QR Table Ordering, Waiter Call, Bill Request, Guest Feedback | Host header -> `public_slug` -> `restaurant_id` |
| **Platform Control Plane** | `dinely.food/admin/*` | Global outlet directory, Pending approval queue, Platform analytics | Role: `PLATFORM_ADMIN` (Firebase custom claim or verified email allowlist) |

---

## 3. Dependency Map

```
[ Frontend: React 18 + Vite + TailwindCSS ]
    ├── Firebase Client SDK (Auth, Google Sign-In)
    ├── DinelyApiClient (Fetch + AbortController + Token Hydration)
    └── RealtimeBus (WebSocket client + Auto-reconnect + Channel routing)
            │
            ▼ (HTTPS REST / WSS)
[ Backend: Python 3.14 + FastAPI + Starlette ]
    ├── Firebase Admin SDK (Local x509 token signature verification)
    ├── TenantAuth Middleware (CallerContext, RBAC, Tenant-ownership enforcement)
    ├── WebSocketManager (Room isolation: room:{restaurant_id}, global admin bus)
    └── SQLAlchemy 2.0 Async (Asyncpg driver + Connection pool)
            │
            ▼ (PostgreSQL Wire Protocol over TLS)
[ Database: Neon Serverless PostgreSQL ]
    ├── restaurants (Tenant root)
    ├── restaurant_tables (Tenant-scoped)
    ├── menu_categories & menu_items (Tenant-scoped)
    ├── orders & order_items (Tenant-scoped)
    ├── bills, taxes, tax_categories (Tenant-scoped)
    ├── inventory_items (Tenant-scoped)
    ├── customer_requests (Tenant-scoped)
    └── restaurant_lifecycle_logs (Audit trail)
```

---

## 4. Tenant Model & Data Schema

Every tenant entity in PostgreSQL strictly references `restaurant_id`:

```
                             +------------------------+
                             |      restaurants       |
                             +------------------------+
                             | id (PK)                |
                             | name                   |
                             | slug (UNIQUE)          |
                             | public_slug (UNIQUE)   |
                             | owner_email            |
                             | owner_uid              |
                             | lifecycle_status       |
                             | is_approved            |
                             | status (OPEN/CLOSED)   |
                             | upi_id                 |
                             | enabled_modules (JSON) |
                             +-----------+------------+
                                         | 1:N
         +-------------------------------+-------------------------------+
         |                               |                               |
         v                               v                               v
+-----------------+             +-----------------+             +-----------------+
|restaurant_tables|             | menu_categories |             |     orders      |
+-----------------+             +-----------------+             +-----------------+
| id (PK)         |             | id (PK)         |             | id (PK)         |
| restaurant_id FK|             | restaurant_id FK|             | restaurant_id FK|
| table_number    |             | name            |             | table_number    |
| qr_code_url     |             +--------+--------+             | status          |
+-----------------+                      | 1:N                  | items (JSON)    |
                                         v                      +--------+--------+
                                +-----------------+                      | 1:1
                                |   menu_items    |                      v
                                +-----------------+             +-----------------+
                                | id (PK)         |             |      bills      |
                                | restaurant_id FK|             +-----------------+
                                | category_id FK  |             | id (PK)         |
                                | name, price     |             | restaurant_id FK|
                                | target (KIT/BAR)|             | subtotal, total |
                                +-----------------+             | payment_status  |
                                                                +-----------------+
```

---

## 5. Authentication & Authorization Flow

```
[ Client: Google Sign-In ]
         │
         ▼
[ Firebase Auth ] ─── Produces Firebase ID Token (JWT)
         │
         ▼
[ HTTP Request: Authorization: Bearer <token> ]
         │
         ▼
[ FastAPI: app/core/security/tenant_auth.py ]
    1. Verify signature via Google public x509 certs (Local, non-blocking, <15ms)
    2. Extract claims: uid, email, role, admin
    3. Construct CallerContext(uid, email, role, is_admin)
    4. For Tenant Operations (POST/PUT/DELETE):
       - If is_admin: Allow
       - If role == OWNER: Verify caller.uid == rest.owner_uid OR caller.email == rest.owner_email (403 if mismatch)
       - If role == STAFF: Verify caller.restaurant_id == rest.id (403 if mismatch)
       - If GUEST/Unauthenticated: 401 Unauthorized
```

---

## 6. Restaurant Lifecycle State Machine

```
              [ DRAFT ]
                  │ (Submit Application)
                  ▼
         [ PENDING_APPROVAL ] ◄───────────────────────────┐
            │            │                                │
 (Admin     │            │ (Admin                         │ (Owner
  Approve)  │            │  Reject)                       │  Resubmit)
            ▼            ▼                                │
         [ LIVE ]    [ REJECTED / CHANGES_REQUIRED ] ─────┘
            │
            ├──────────────► [ SUSPENDED ] (Admin flag)
            │
            └──────────────► [ ARCHIVED / DEACTIVATED ]
```

- **Transitions**: Audited in `restaurant_lifecycle_logs` with `old_status`, `new_status`, `changed_by`, `reason`, `timestamp`.
- **Idempotency**: Duplicate approvals or rejections return safe HTTP 200 with status payload rather than throwing errors.

---

## 7. Realtime WebSocket Architecture

- **Path**: `wss://dineflow-v3.onrender.com/api/v1/ws?restaurant_id={id}&role={role}`
- **Channel Partitioning**:
  - `room:{restaurant_id}`: Private restaurant operational traffic (orders, KDS tickets, waiter alerts, bill requests).
  - `global`: Platform admin approval sync and owner workspace status updates.
- **Resilience**: Sockets employ a 1.5s write timeout (`asyncio.wait_for(ws.send_text(...), timeout=1.5)`). Dead clients are safely pruned without holding up request threads.

---

## 8. Deployment Architecture

| Tier | Provider | Service / Type | URL / Host |
|---|---|---|---|
| **Frontend** | Google Firebase | Firebase Hosting (`dinely-cd6cd`) | `https://dinely.food`<br>`https://dinely-cd6cd.web.app` |
| **Backend API** | Render | Docker / Web Service (Uvicorn + FastAPI) | `https://dineflow-v3.onrender.com` |
| **Database** | Neon Tech | Serverless PostgreSQL 16 (SSL required) | `ep-dry-frog-a1puvn2s-pooler.ap-southeast-1.aws.neon.tech` |
| **Identity** | Google Cloud | Firebase Authentication | Project ID: `dinely-cd6cd` |

---

## 9. Known Technical Debt & Immediate Priorities

1. **Domain Wildcard Mapping**: Needs production verification that `*.dinely.app` CNAME points cleanly to Firebase Hosting with wildcard SSL.
2. **Unified API Client Refactoring**: `frontend/src/packages/api/client.ts` is large (>2,100 lines) and should progressively be split into dedicated domain clients (`RestaurantApiClient`, `AdminApiClient`, `CustomerApiClient`, `BillingApiClient`).
3. **Session Reconnection Protocol**: WebSocket reconnection logic should fetch authoritative missed events after reconnect to guarantee zero dropped KDS tickets.

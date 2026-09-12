# DINELY — 03 PRODUCT REQUIREMENTS & SYSTEM SPECIFICATION

**Document Status:** Complete Forensic Requirements Specification  
**Product Vision:** Multi-Tenant Restaurant SaaS Platform (`https://dinely.food` & `https://<slug>.dinely.food`)  
**Target Delivery:** Enterprise-Grade Production Readiness  

---

## 1. Functional Requirements Matrix (FRM)

### 1.1 Authentication & Identity (AUTH)

| ID | Requirement Description | Priority | Acceptance Criteria | Dependencies |
|---|---|---|---|---|
| **AUTH-01** | Google OAuth via Firebase Authentication | **P0** | Users can sign in with Google on `dinely.food/workspace`. Returns verified Firebase ID token. No password storage on Dinely servers. | Firebase Auth SDK |
| **AUTH-02** | Automatic User Account Provisioning | **P0** | Backend validates Firebase token via Admin SDK. If user does not exist in `users` table, creates record with `firebase_uid`, `email`, `full_name`, `avatar_url`. | DB `users` table |
| **AUTH-03** | Multi-Account & Stale Session Invalidation | **P1** | When user signs out or switches Google account, all cached session tokens, user profiles, and active restaurant pointers are purged from `localStorage` & memory. | Client auth store |
| **AUTH-04** | Operational Staff Terminal Passcode Login | **P1** | Waiter/Kitchen/Bar terminals on `<slug>.dinely.food/<app>` allow 4-digit PIN authentication mapped to `restaurant_memberships.pin_code`, issuing a role-scoped session token. | DB `restaurant_memberships` |
| **AUTH-05** | Platform Admin Verification Gate | **P0** | `/admin/*` routes reject all users who lack `is_platform_admin = True` or whose email is not in the authoritative admin whitelist. Returns 403 Forbidden with security audit log. | `CallerContext` |

---

### 1.2 Multi-Tenancy & Restaurant Isolation (TENANT)

| ID | Requirement Description | Priority | Acceptance Criteria | Dependencies |
|---|---|---|---|---|
| **TENANT-01** | Strict Tenant Scoping by Hostname | **P0** | Requests to `<slug>.dinely.food` automatically extract `slug`, query `restaurants` table, and inject verified `restaurant_id` into request context. | Cloudflare Worker / Host resolver |
| **TENANT-02** | Zero Cross-Tenant Data Leakage | **P0** | Every single database query for tables, menus, orders, bills, and customers MUST include `WHERE restaurant_id = :tenant_id`. No unscoped queries permitted. | SQLAlchemy ORM / Service Layer |
| **TENANT-03** | Elimination of `restaurants[0]` Fallback | **P0** | Under no circumstances should code select the "first" or "fallback" restaurant from an array when resolving tenant context. Missing tenant must produce explicit 404. | Frontend & Backend API |
| **TENANT-04** | Custom Domain Mapping Support | **P1** | Restaurant owners can map custom domains (e.g., `menu.thedunk.com`) via CNAME with automatic SSL termination and tenant resolution. | Cloudflare for SaaS / DNS API |

---

### 1.3 Workspace & Restaurant Creation (ONBOARD)

| ID | Requirement Description | Priority | Acceptance Criteria | Dependencies |
|---|---|---|---|---|
| **ONBOARD-01** | Multi-Restaurant Workspace Dashboard | **P0** | Logged-in owner visiting `dinely.food/workspace` sees all restaurants they own or manage, displaying status badges (`DRAFT`, `PENDING_APPROVAL`, `LIVE`, `REJECTED`). | AUTH-02, Backend API |
| **ONBOARD-02** | Guided Restaurant Setup Wizard | **P0** | 4-step wizard collecting basic venue info, subdomain slug validation, table generation, and initial menu categories. Client must validate slug format (`^[a-z0-9-]+$`). | Frontend `SetupWizard.tsx` |
| **ONBOARD-03** | Subdomain Uniqueness Guarantee | **P0** | API validates that requested slug is not already reserved, active, or pending by another tenant. Returns 409 Conflict if taken. | DB Unique Constraint on `restaurants.slug` |
| **ONBOARD-04** | Default Asset Initialization | **P1** | Upon creation, restaurant automatically receives default dining tables (1-10) and starter menu categories with sample items to prevent empty-terminal crashes. | Backend Service Transaction |

---

### 1.4 Restaurant Lifecycle Management (LIFE)

| ID | Requirement Description | Priority | Acceptance Criteria | Dependencies |
|---|---|---|---|---|
| **LIFE-01** | Explicit State Machine Enforcement | **P0** | Restaurant status can only transition via defined paths: `DRAFT` -> `PENDING_APPROVAL` -> `LIVE` (or `REJECTED`). Suspended/Archived states can be set only by Admin. | DB ENUM & Service Guard |
| **LIFE-02** | Owner Submission for Approval | **P0** | Owner can submit complete `DRAFT` restaurant. Status updates to `PENDING_APPROVAL`, locks editing of critical domain parameters, and notifies Platform Admin. | REST API `POST /{id}/submit` |
| **LIFE-03** | Admin Approval Workflow | **P0** | Platform Admin at `dinely.food/admin` can inspect pending restaurant details, verify brand integrity, and click "Approve" (setting status to `LIVE`) or "Reject" (with reason). | Platform API & WebSocket |
| **LIFE-04** | Live Status Gating for Customer Traffic | **P0** | Public subdomains (`<slug>.dinely.food`) for restaurants that are NOT in `LIVE` status must render an informative maintenance/approval hold screen, not 500 errors. | Frontend App Guard |
| **LIFE-05** | Immutable Audit Trail | **P1** | Every status transition records an entry in `restaurant_lifecycle_logs` containing `actor_id`, `actor_role`, `from_status`, `to_status`, `reason`, and `timestamp`. | DB `restaurant_lifecycle_logs` |

---

### 1.5 Dynamic QR Generation & Table Resolution (QR)

| ID | Requirement Description | Priority | Acceptance Criteria | Dependencies |
|---|---|---|---|---|
| **QR-01** | Production-Accurate QR URL Encoding | **P0** | Generated QR code for Table X must encode: `https://<slug>.dinely.food/customer?table=X`. Never use `window.location.origin`, `localhost`, or query parameter `?tenant=`. | `packages/utils/tenantResolver.ts` |
| **QR-02** | High-Resolution Vector & Print Generation | **P1** | Owner dashboard allows downloading individual or bulk table QR placards in SVG, PDF, and PNG formats with restaurant branding and table label. | Frontend Canvas / SVG export |
| **QR-03** | Table Number Normalization | **P0** | Backend and frontend must normalize table numbers across string representations (`"1"`, `"01"`, `"Table 01"`, `"T-01"`) so customer orders always map to the correct physical table. | `tableUtils.ts` |

---

### 1.6 Customer Experience & Digital Menu (CUST)

| ID | Requirement Description | Priority | Acceptance Criteria | Dependencies |
|---|---|---|---|---|
| **CUST-01** | Seamless Mobile Web Menu | **P0** | Scanned QR opens mobile-optimized responsive menu in <1.5 seconds. No native app download or user account required. | Static CDN + Vite bundle |
| **CUST-02** | Interactive Dietary & Category Filters | **P1** | Customer can filter items by Vegetarian, Vegan, Gluten-Free, Chef Special, and search dish titles in real time. | React UI |
| **CUST-03** | Modifiers & Special Instructions | **P1** | Items support size options (Small/Medium/Large), add-ons (Extra cheese, etc.), and freeform kitchen notes per line item. | DB Schema & Order API |
| **CUST-04** | Live Table Session Binding | **P0** | Customer orders are bound to an active `table_session_id`. Customer can view their cumulative table tab and order status (`PLACED`, `PREPARING`, `SERVED`). | DB `table_sessions` |
| **CUST-05** | Realtime Service Calling | **P0** | Customer can tap "Call Waiter", "Request Water", or "Ask for Bill". Instantly triggers push event to Waiter Terminal with sound. | WebSocket Event Broker |

---

### 1.7 Operational Terminals (OPS: Kitchen, Waiter, Bar, Billing, Inventory)

| ID | Requirement Description | Priority | Acceptance Criteria | Dependencies |
|---|---|---|---|---|
| **OPS-01** | Realtime Kitchen Display System (KDS) | **P0** | Orders appear immediately on `/kitchen` terminal without manual refresh. Displays elapsed prep time with color escalation (green <10m, yellow 10-20m, red >20m). | WebSocket `restaurant:{id}:kitchen` |
| **OPS-02** | Multi-Station Item Routing (Kitchen vs Bar) | **P0** | Food items appear on Kitchen KDS; beverage/alcohol items appear on Bar terminal (`/bar`). Both update order status independently. | Order Item `station` column |
| **OPS-03** | Waiter Floor Management OS | **P0** | Interactive table grid showing table status (Vacant, Active, Calling, Ready for Bill). Audio chime on assistance request. | WebSocket `restaurant:{id}:waiter` |
| **OPS-04** | Tax Calculation & Itemized Billing Engine | **P0** | Billing engine applies configured restaurant taxes (GST, VAT, Service Charge). Generates itemized receipt with tax breakdown. | DB `taxes`, `bills` |
| **OPS-05** | Table Session Closure & Bill Settlement | **P0** | Staff can mark bill PAID via Cash, Card, or UPI, which archives active table session and releases table for next customer. | REST API `/billing/{id}/pay` |
| **OPS-06** | Realtime Inventory Deduction | **P1** | Completed orders automatically deduct ingredient or item stock counts in database. Triggers low-stock warning on inventory terminal when threshold breached. | Backend Inventory Module |

---

### 1.8 Realtime Event Architecture (REALTIME)

| ID | Requirement Description | Priority | Acceptance Criteria | Dependencies |
|---|---|---|---|---|
| **REALTIME-01** | Strict Tenant Channel Isolation | **P0** | WebSocket rooms must follow `restaurant:{id}:{role}`. Subscriptions to other tenants' rooms must be rejected by backend connection manager. | FastAPI WebSocket Manager |
| **REALTIME-02** | Automatic Reconnection with Exponential Backoff | **P0** | If network drops, client automatically attempts reconnect at 1s, 2s, 4s, 8s intervals up to 30s. Fetches missed state on reconnect. | `frontend/src/packages/api/realtime.ts` |
| **REALTIME-03** | Platform Admin Global Room | **P1** | Platform Admin subscribes to `global:admin` room to receive new restaurant submissions and system alerts across the SaaS platform. | WebSocket Manager |

---

## 2. Non-Functional Requirements (NFR)

### 2.1 Performance & Latency
- **NFR-PERF-01**: API response times for read operations (`GET /menu`, `GET /tables`) must be under **150ms** (p95) on warmed instances.
- **NFR-PERF-02**: Realtime event delivery latency from backend dispatch to browser audio chime must be under **300ms** over standard cellular/Wi-Fi.
- **NFR-PERF-03**: Frontend client bundle initial load time must be under **1.8s** on 4G mobile connections.
- **NFR-PERF-04**: Database connection pooling must maintain minimum 5 and maximum 20 concurrent connections per backend worker to prevent Neon serverless connection exhaustion.

### 2.2 Security & Compliance
- **NFR-SEC-01**: All external endpoints must enforce TLS 1.3 encryption.
- **NFR-SEC-02**: All authenticated endpoints must validate caller identity through cryptographically signed Firebase tokens or staff session tokens.
- **NFR-SEC-03**: Cross-Origin Resource Sharing (CORS) must explicitly allow `https://dinely.food`, `https://*.dinely.food`, and local dev hosts. Wildcard `*` with credentials must be strictly forbidden.
- **NFR-SEC-04**: Role-Based Access Control (RBAC) must be validated on the backend service layer before executing any database write or sensitive read operation.

### 2.3 Reliability & Availability
- **NFR-AVAIL-01**: The SaaS platform must target **99.9% uptime** during operational restaurant hours (08:00 to 02:00 local time).
- **NFR-AVAIL-02**: Frontend must never show an unrecoverable infinite loading spinner; every API request must have a client-side timeout of **10,000ms** with an informative retry prompt.
- **NFR-AVAIL-03**: Backend must include graceful cold-start handling and automated health checks (`/healthz`) capable of auto-restarting locked workers.

### 2.4 Data Integrity & Scalability
- **NFR-DATA-01**: Foreign key constraints with `ON DELETE RESTRICT` or `ON DELETE CASCADE` must be enforced across all child tables (`order_items`, `table_sessions`, `bills`).
- **NFR-DATA-02**: Database schema updates must be managed strictly through declarative, reversible Alembic migration scripts. Imperative startup SQL alteration is prohibited in production.
- **NFR-DATA-03**: Multi-tenant database design must support horizontal scaling up to 1,000 active restaurants without cross-tenant table locking.

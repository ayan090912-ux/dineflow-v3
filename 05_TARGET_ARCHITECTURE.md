# DINELY — 05 TARGET ARCHITECTURE & MULTI-TENANT BLUEPRINT

**Document Status:** Approved Target Architectural Specification  
**Architecture Paradigm:** Multi-Tenant Single-Page-Application with Cloudflare Edge Tenant Router, FastAPI Distributed Micro-Services, and Scoped PostgreSQL Relational Engine  
**Authoritative Identity Anchor:** Firebase Auth UID -> Restaurant Membership -> Scoped Tenant Context  

---

## 1. Core Architectural Tenets

1. **Strict Tenant Resolution Invariant**:
   - Every public tenant interaction MUST resolve to a single, immutable `restaurant_id` (UUIDv4) based solely on the verified Hostname (`<slug>.dinely.food` or custom domain).
   - The platform never guesses, defaults to the "first" restaurant, or trusts client-side storage keys to dictate tenant identity.
2. **Dual-Gate Security Architecture**:
   - **Gate 1 (Identity Gate)**: Firebase Authentication verifies caller identity (Google OAuth UID / Email) or Terminal PIN Token.
   - **Gate 2 (Authorization & Tenant Gate)**: Backend `CallerContext` middleware verifies that the caller has an active `RestaurantMembership` for the target `restaurant_id` with the requisite role (`OWNER`, `MANAGER`, `KITCHEN`, `WAITER`, `BAR`, `BILLING`, `INVENTORY`).
3. **Pure Edge Routing**:
   - A single unified frontend bundle (React 19 SPA) serves all domains.
   - Cloudflare Worker proxies subdomains transparently, injecting edge headers (`X-Dinely-Tenant-Slug`, `X-Dinely-Host`) while preserving client cookies, CORS, and WebSocket upgrades.

---

## 2. Complete Domain & URL Topology

```
                  ┌──────────────────────────────────────────────┐
                  │                 INTERNET                     │
                  └──────────────────────┬───────────────────────┘
                                         │
        ┌────────────────────────────────┴────────────────────────────────┐
        ▼                                                                 ▼
[ dinely.food ] (Apex Platform)                        [ *.dinely.food ] (Tenant Subdomains)
├── / ................. Landing Marketing Page         ├── /customer ............ Mobile Digital Menu
├── /workspace ........ Owner Multi-Restaurant Hub     ├── /kitchen ............. Kitchen Display System (KDS)
├── /onboarding ....... Setup Wizard & Restaurant Add  ├── /waiter .............. Waiter Assistance & Floor OS
├── /pending-approval . Submission Holding Screen      ├── /bar ................. Drink & Bar Order Queue
├── /admin ............ Private Platform Admin Portal  ├── /inventory ........... Realtime Stock Management
└── /login ............ Central Google OAuth Gateway   └── /billing ............. POS, Tax & Bill Settlement
```

### Routing Rules & Authority
1. **Platform Apex (`dinely.food`)**:
   - Reserved strictly for Platform Marketing, Owner Workspace, Onboarding Wizard, and Platform Administration.
   - Any attempt to access operational terminals (`/kitchen`, `/waiter`, `/customer`) on the apex root redirects to `/workspace` or prompts for tenant selection.
2. **Tenant Subdomains (`<slug>.dinely.food`)**:
   - Dedicated strictly to the operations and customer dining experience of that specific restaurant tenant.
   - Accessing `/` or `/menu` on a tenant subdomain automatically routes to `/customer`.
   - Admin routes (`/admin`) on a tenant subdomain are strictly forbidden (returns 404).

---

## 3. Data & Identity Flow Architecture

```
[ User Action: Google OAuth Sign-In ]
              │
              ▼
[ Firebase Authentication Service ]
              │ Issues signed JWT ID Token
              ▼
[ Client POST /api/v1/auth/verify ]
              │
              ▼
[ Backend Auth Service ]
              ├── 1. Cryptographically verify Firebase Token with Google Public Keys
              ├── 2. Upsert record in `users` table: (firebase_uid, email, full_name)
              ├── 3. Query `restaurant_memberships` table for all associated restaurants
              └── 4. Issue Dinely Session JWT containing:
                     {
                       "user_id": "uuid",
                       "email": "user@example.com",
                       "is_platform_admin": false,
                       "memberships": [
                         { "restaurant_id": "uuid-1", "role": "OWNER" },
                         { "restaurant_id": "uuid-2", "role": "MANAGER" }
                       ]
                     }
```

### Request Context Middleware Pipeline (`app/common/dependencies.py`)

Every inbound REST and WebSocket request traverses the following dependency pipeline:

```
[ Inbound HTTP Request ]
          │
          ▼
1. Extract Bearer Token from `Authorization` header (or Terminal Token from `X-Terminal-Token`)
          │
          ▼
2. Validate JWT Signature and Expiration
          │
          ▼
3. Construct `CallerContext`:
   - `user_id`: UUID
   - `email`: string
   - `is_platform_admin`: boolean
   - `active_role`: string (derived from target restaurant membership)
   - `authorized_restaurants`: Set[UUID]
          │
          ▼
4. Route Guard Execution:
   - For `/admin/*`: Verify `is_platform_admin == True` -> 403 if unauthorized.
   - For `/restaurants/{id}/*`: Verify `caller.has_access(id, required_roles)` -> 403 if cross-tenant attempt!
   - For `/public/*` and `/customer/*`: Public read permitted; write operations validated against active table session.
```

---

## 4. Database Multi-Tenancy Architecture

### 4.1 Schema Isolation Rules
- **Shared Database, Shared Process, Discriminator Column**:
  - All tenant records reside in unified tables partitioned logically by `restaurant_id: UUID NOT NULL`.
  - Every tenant-owned table MUST declare a Foreign Key constraint:
    ```sql
    CONSTRAINT fk_tenant_restaurant 
    FOREIGN KEY (restaurant_id) 
    REFERENCES restaurants(id) 
    ON DELETE CASCADE
    ```
- **Mandatory Tenant Tables**:
  - `restaurant_memberships` (`restaurant_id`, `user_id`, `role`, `pin_code`)
  - `tables` (`restaurant_id`, `table_number`, `capacity`, `status`)
  - `table_sessions` (`restaurant_id`, `table_id`, `is_active`, `opened_at`, `closed_at`)
  - `menu_categories` (`restaurant_id`, `name`, `display_order`, `is_active`)
  - `menu_items` (`restaurant_id`, `category_id`, `name`, `price`, `station`, `is_available`)
  - `orders` (`restaurant_id`, `table_number`, `table_session_id`, `status`, `total_amount`)
  - `order_items` (`restaurant_id`, `order_id`, `menu_item_id`, `quantity`, `price`, `station`, `status`)
  - `taxes` (`restaurant_id`, `name`, `rate_percentage`, `tax_type`, `is_active`)
  - `bills` (`restaurant_id`, `order_ids`, `table_number`, `subtotal`, `tax_total`, `grand_total`, `payment_status`)
  - `inventory_items` (`restaurant_id`, `name`, `current_stock`, `unit`, `min_threshold`)
  - `customer_requests` (`restaurant_id`, `table_number`, `request_type`, `status`)

### 4.2 Composite Indexing Strategy
To guarantee sub-50ms query times at scale, composite indexes combining `restaurant_id` with lookup keys must be enforced:
```sql
CREATE INDEX idx_orders_tenant_status ON orders (restaurant_id, status, created_at DESC);
CREATE INDEX idx_menu_items_tenant_cat ON menu_items (restaurant_id, category_id, is_available);
CREATE INDEX idx_tables_tenant_num ON tables (restaurant_id, table_number);
CREATE INDEX idx_sessions_tenant_active ON table_sessions (restaurant_id, is_active);
CREATE INDEX idx_cust_req_tenant_pending ON customer_requests (restaurant_id, status, created_at ASC);
```

---

## 5. Realtime WebSocket Architecture

```
                                [ FastAPI ConnectionManager ]
                                               │
             ┌─────────────────────────────────┼─────────────────────────────────┐
             ▼                                 ▼                                 ▼
   [ Room: global:admin ]          [ Room: restaurant:{id}:ops ]       [ Room: restaurant:{id}:cust ]
   - Platform Admins only          - Kitchen / Bar / Waiter / Cashier  - Scoped to table session
   - Event: restaurant_submitted   - Event: order_created              - Event: order_status_update
   - Event: platform_stats         - Event: customer_request_created   - Event: bill_generated
                                   - Event: table_status_changed       - Event: table_session_closed
```

### Connection Handshake Protocol
1. Client establishes WebSocket: `wss://dineflow-v3.onrender.com/api/v1/ws/{restaurant_id}?token=<jwt>&role=<role>`
2. Server validates `token`:
   - If staff/owner: verifies membership for `{restaurant_id}` and claims role `{role}`.
   - If customer: verifies active `table_session_id` query parameter for `{restaurant_id}`.
   - If invalid: immediately closes connection with code `4403 (Forbidden)`.
3. Server joins socket to designated room: `restaurant:{restaurant_id}:{channel}`.
4. Heartbeat Protocol:
   - Server sends `ping` every 30 seconds.
   - Client responds with `pong`.
   - If no pong received within 10 seconds, connection is terminated and resources released.

---

## 6. Edge & Cloudflare Worker Routing Architecture

### Worker Code Pattern (`cloudflare/dinely-tenant-router/worker.js`)
```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    // 1. Apex & Platform reserved hosts -> direct to Origin
    if (host === "dinely.food" || host === "www.dinely.food") {
      return fetch(request);
    }

    // 2. Extract tenant subdomain
    const apexDomain = "dinely.food";
    if (host.endsWith(`.${apexDomain}`)) {
      const slug = host.replace(`.${apexDomain}`, "").trim();

      // Clone request and inject tenant headers
      const newHeaders = new Headers(request.headers);
      newHeaders.set("X-Dinely-Tenant-Slug", slug);
      newHeaders.set("X-Dinely-Host", host);

      // Proxy request to Firebase Hosting SPA origin while preserving URI path & query
      const originUrl = new URL(request.url);
      originUrl.hostname = "dinely-cd6cd.web.app";

      const originRequest = new Request(originUrl.toString(), {
        method: request.method,
        headers: newHeaders,
        body: request.body,
        redirect: "manual"
      });

      const response = await fetch(originRequest);
      const modifiedResponse = new Response(response.body, response);
      modifiedResponse.headers.set("X-Dinely-Routed-By", "Cloudflare-Tenant-Edge");
      return modifiedResponse;
    }

    return fetch(request);
  }
};
```

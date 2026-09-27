# DINELY DOMAIN SYSTEM — FORENSIC ARCHITECTURE REPORT
**Date:** September 13, 2026  
**Scope:** Multi-Tenant Domain & Subdomain Architecture (`*.dinely.food`)  
**Status:** Forensic Audit Complete — Zero Manual Code Modifications Pending Approval  

---

## 1. Executive Summary & Goal

Dinely provides an automated, zero-configuration multi-tenant domain architecture. When a restaurant is onboarded, the platform automatically provisions:
```
https://<restaurant-slug>.dinely.food
```
**Core Guarantees:**
- **Zero per-tenant DNS configuration:** One global Cloudflare wildcard (`*.dinely.food`) proxies all tenants.
- **Zero per-tenant Cloudflare Workers:** A single Edge Worker (`dinely-tenant-router`) handles routing, origin header injection, and redirect rewriting.
- **Zero per-tenant origins/servers:** Firebase Hosting serves the single frontend SPA bundle, while the API backend resolves tenant context dynamically from the database.
- **Strict Isolation & 404:** Non-existent or inactive subdomains strictly return a 404 "Venue Not Found" page. No tenant ever falls back to a default, demo, or adjacent tenant's data.
- **Authoritative Identity:** Tenant identity is derived authoritatively from the HTTP hostname, never from mutable client query parameters (`?tenant=`), localStorage, or positional array lookups.

---

## 2. End-to-End Request Trace Architecture

```
+-----------------------------------------------------------------------------------------+
|                                    1. BROWSER REQUEST                                   |
| Customer navigates to: https://the-dunk.dinely.food/customer                           |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                                  2. CLOUDFLARE DNS                                      |
| Record: *.dinely.food -> Cloudflare Anycast IP (Orange-Cloud Proxied)                   |
| Resolution: 104.21.2.197, 172.67.129.153 (Verified via authoritative DNS query)         |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                       3. CLOUDFLARE WORKER: dinely-tenant-router                        |
| Route: *.dinely.food/*                                                                  |
| - Inspects request.headers (Host / X-Forwarded-Host)                                    |
| - Extracts originalHostname: "the-dunk.dinely.food"                                     |
| - Slices subdomain slug: "the-dunk"                                                     |
| - Validates against RESERVED_SUBDOMAINS (www, api, admin, etc.)                         |
| - Rewrites target URL to Firebase Hosting Origin: https://dinely-cd6cd.web.app/customer |
| - Rewrites request headers:                                                             |
|     Host: dinely-cd6cd.web.app                                                          |
|     X-Forwarded-Host: the-dunk.dinely.food                                              |
|     X-Forwarded-Proto: https                                                            |
|     X-Tenant-Slug: the-dunk                                                             |
| - Fetches origin response                                                               |
| - If origin returns 301/302 redirect, rewrites Location back to original tenant host    |
| - Injects response headers:                                                             |
|     X-Dinely-Routed-By: dinely-tenant-router                                            |
|     X-Dinely-Original-Host: the-dunk.dinely.food                                        |
|     X-Dinely-Tenant-Slug: the-dunk                                                      |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                         4. FRONTEND ORIGIN (Firebase Hosting)                           |
| Returns index.html SPA bundle to the user's browser.                                    |
| (Browser address bar remains strictly on https://the-dunk.dinely.food/customer)         |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                       5. FRONTEND ROUTER & TENANT RESOLVER                              |
| File: frontend/src/packages/utils/tenantResolver.ts & App.tsx                           |
| - getTenantFromHostname() parses window.location.hostname ("the-dunk.dinely.food")      |
| - Returns: { isTenantSubdomain: true, slug: "the-dunk", hostname: "the-dunk.dinely.food"}|
| - App.tsx sets tenantResolutionState = 'RESOLVING'                                      |
| - Invokes: api.resolveRestaurantBySlug("the-dunk")                                      |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                              6. BACKEND API TENANT RESOLVER                             |
| Endpoint: GET /api/v1/restaurants/public/resolve?slug=the-dunk                           |
| Implementation: backend/app/core/tenant/resolver.py -> resolve_public_tenant()           |
|                                                                                         |
| Lookup Sequence:                                                                        |
| A. If hostname provided: Query restaurant_domains WHERE hostname = 'the-dunk.dinely.food'|
|    and verification_status = 'VERIFIED'                                                 |
| B. If slug provided: Query restaurants WHERE public_slug = 'the-dunk'                   |
|    and deleted_at IS NULL                                                               |
|                                                                                         |
| Validation Checks:                                                                      |
| - If not found -> HTTP 404 NOT FOUND ("Tenant 'the-dunk' not found")                    |
| - If lifecycle_status IN ('ARCHIVED', 'DELETED', 'SUSPENDED') -> HTTP 404 NOT FOUND     |
| - If valid -> Returns ResolvedTenantContext with restaurant_id, name, slug,             |
|   public_slug, public_domain, lifecycle_status, is_approved, and raw_restaurant.        |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                           7. DATABASE SCHEMA & DOMAIN MAPPING                           |
| Table: restaurants                                                                      |
| - id: 'rest-xxx'                                                                        |
| - name: 'The Dunk'                                                                      |
| - public_slug: 'the-dunk' (UNIQUE constraint)                                           |
| - domain: 'https://the-dunk.dinely.food'                                                |
| - is_approved: true                                                                     |
| - lifecycle_status: 'LIVE'                                                              |
|                                                                                         |
| Table: restaurant_domains                                                               |
| - id: 'dom-rest-xxx'                                                                    |
| - restaurant_id: 'rest-xxx'                                                             |
| - hostname: 'the-dunk.dinely.food' (UNIQUE constraint)                                  |
| - domain: 'the-dunk.dinely.food'                                                        |
| - domain_type: 'SUBDOMAIN'                                                              |
| - is_primary: true                                                                      |
| - is_verified: true                                                                     |
| - verification_status: 'VERIFIED'                                                       |
+-----------------------------------------------------------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------------+
|                           8. FRONTEND APP HYDRATION & MOUNT                             |
| - App.tsx receives resolved tenant record                                               |
| - sets currentRestaurant and api.setCurrentRestaurantId(rest.id)                         |
| - sets tenantResolutionState = 'RESOLVED'                                               |
| - Connects WebSocket to room:{restaurant.id}                                           |
| - resolveTenantAppFromPath("/customer") -> 'CUSTOMER'                                  |
| - Mounts <CustomerApp restaurant={currentRestaurant} />                                 |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Detailed Component Forensic Audit

### 3.1 Cloudflare DNS
- **Zone:** `dinely.food`
- **Wildcard Record:** `*.dinely.food`
- **Proxy Status:** Proxied (Orange Cloud).
- **Authoritative DNS Check:**
  - `dinely.food` -> `104.21.2.197`, `172.67.129.153` (Cloudflare Anycast)
  - `test-abc.dinely.food` -> `104.21.2.197`, `172.67.129.153`
  - `unknown-abc.dinely.food` -> `104.21.2.197`, `172.67.129.153`
- **Verdict:** Wildcard DNS is active, correctly proxied, and returns Cloudflare edge IPs for all subdomains.

### 3.2 Cloudflare Worker (`dinely-tenant-router`)
- **Configuration:** `cloudflare/dinely-tenant-router/wrangler.toml`
  - Name: `dinely-tenant-router`
  - Routes: `*.dinely.food/*`
  - Origin: `dinely-cd6cd.web.app`
- **Code Execution:** `cloudflare/dinely-tenant-router/src/index.js`
  - Preserves client hostname via `X-Forwarded-Host: <slug>.dinely.food`.
  - Injects `Host: dinely-cd6cd.web.app` so Firebase Hosting renders the SPA without rejecting the unknown host.
  - Rewrites redirects issued by the origin back to the tenant's original hostname, preventing any browser URL leaks.
  - Live probe test on `https://test-abc.dinely.food/` confirmed active telemetry headers:
    - `X-Dinely-Original-Host: test-abc.dinely.food`
    - `X-Dinely-Routed-By: dinely-tenant-router`
    - `X-Dinely-Tenant-Slug: test-abc`
- **Verdict:** Cloudflare Worker is deployed, functional, and correctly rewrites edge headers and redirect locations.

### 3.3 Frontend Tenant Resolver (`tenantResolver.ts` & `App.tsx`)
- **Hostname Parser:** `getTenantFromHostname()` parses `window.location.hostname`. If it ends in `.dinely.food`, extracts the subdomain.
- **Authoritative Identity Rule:** If running on a tenant subdomain (`<slug>.dinely.food`), the hostname is authoritative. Query parameter fallbacks (`?tenant=`) are strictly prohibited and ignored on tenant subdomains.
- **Unknown Tenant Behavior:** If `api.resolveRestaurantBySlug()` returns 404 or `null`, `tenantResolutionState` transitions to `NOT_FOUND`.
- **Render Output:** Renders `NotFoundPage` with title `"Venue Not Found"` and a button returning to the Dinely platform (`https://dinely.food`). Never falls back to a default restaurant, demo venue, or previous session.
- **Verdict:** Authoritative hostname resolution and strict 404 rendering are properly implemented.

### 3.4 Backend Tenant Resolver (`app/core/tenant/resolver.py`)
- **Endpoint:** `GET /api/v1/restaurants/public/resolve?hostname=...&slug=...`
- **Database Query:**
  - Query 1: `RestaurantDomain` by `hostname` or `domain`.
  - Query 2: `Restaurant` by `public_slug`, `slug`, or `id`.
- **Status Filter:**
  - If tenant status is `ARCHIVED`, `DELETED`, or `SUSPENDED`, returns HTTP 404.
  - If tenant is not found, returns HTTP 404 with detail `"Tenant '<identifier>' not found."`.
- **Verdict:** Canonical resolver queries authoritative PostgreSQL tables and guarantees strict 404 for unknown/inactive tenants.

### 3.5 Database Domain Creation & Collision Safety
- **Table Constraints:**
  - `restaurants.public_slug`: `VARCHAR(255) UNIQUE`
  - `restaurant_domains.hostname`: `VARCHAR(255) UNIQUE`
- **Slug Generator:** `generate_unique_public_slug(db, name)`
  - Converts name to lowercase URL-safe slug: `re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")`.
  - Iterates collision counter (`the-dunk`, `the-dunk-2`, `the-dunk-3`) checking database existence.
  - Enforced by database unique constraint against race conditions.
- **Automatic Provisioning:** On `create_restaurant` (and idempotently verified on `approve_restaurant`):
  - Automatically inserts `RestaurantDomain` with `hostname = f"{public_slug}.dinely.food"`.
  - Automatically marks `is_primary = True`, `is_verified = True`, `verification_status = "VERIFIED"`.
- **Verdict:** Fully automated. No manual DNS entry or Cloudflare configuration required.

---

## 4. Architectural Verification Matrix

| Architecture Layer | Verification Method | Status | Findings |
| :--- | :--- | :--- | :--- |
| **DNS Wildcard** | Authoritative query for `*.dinely.food` | **VERIFIED** | All subdomains resolve to Cloudflare Anycast IPs. |
| **Edge Proxy** | Worker route `*.dinely.food/*` | **VERIFIED** | `dinely-tenant-router` injects `X-Dinely-Routed-By` and proxy headers. |
| **Origin Forwarding** | Firebase Hosting reverse proxy | **VERIFIED** | Returns SPA `index.html` with HTTP 200 without changing address bar. |
| **Frontend Resolver** | `getTenantFromHostname()` | **VERIFIED** | Hostname is authoritative; query params ignored on subdomains. |
| **Backend Resolver** | `/api/v1/restaurants/public/resolve` | **VERIFIED** | Checks `restaurant_domains` & `restaurants`; returns 404 on unknown. |
| **Slug & Domain DB** | Schema unique constraints | **VERIFIED** | `public_slug` and `hostname` are uniquely indexed in PostgreSQL. |
| **Automatic Creation** | `create_restaurant` lifecycle | **VERIFIED** | Domain mapping created atomically with restaurant record. |

---

## 5. Potential Pitfalls Audited & Mitigation
1. **Header Spoofing (SEC-AUDIT):** External clients attempting to send spoofed `X-Tenant-Slug` or `X-Forwarded-Host` directly to the backend cannot alter public resolution because `/restaurants/public/resolve` relies strictly on query parameters validated against database domain records, and Cloudflare Worker unconditionally overrides incoming headers with verified edge data.
2. **Redirect Leaks:** When Firebase Hosting or backend redirects to root domain or `.web.app`, `dinely-tenant-router` rewrites `Location` header back to the client's original tenant hostname (`https://<slug>.dinely.food`), preventing browser address bar drift.
3. **Cache Bleed:** Firebase Hosting responses specify `Cache-Control: no-cache, no-store, must-revalidate` for dynamic tenant HTML routes, ensuring Tenant A's state is never served to Tenant B.

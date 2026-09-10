# Dinely Domain & Routing Architecture

## 1. Domain Topology Overview

Dinely operates a multi-tenant public routing infrastructure partitioned into two main layers:

```
+-----------------------------------------------------------------------------------+
|                                 EDGE (Cloudflare)                                 |
|                                                                                   |
|  dinely.food (Platform / Owner)                  *.dinely.food (Tenant Subdomain) |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        Cloudflare Worker: dinely-tenant-router                    |
|                        Route: https://*.dinely.food/*                             |
|                        Preserves Host Header -> Origin: dinely-cd6cd.web.app       |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                     Frontend SPA (Firebase Hosting Origin)                        |
|                                                                                   |
|  Reads hostname -> extracts public_slug -> calls backend /resolve                |
|  - If platform domain (dinely.food): Renders Landing / Auth / Workspace           |
|  - If tenant subdomain (e.g. the-dunk.dinely.food): Renders Customer Menu & App   |
|  - If unrecognized tenant: Displays 404 Restaurant Not Found                      |
+-----------------------------------------------------------------------------------+
```

---

## 2. Canonical Domain Formats

1. **Main Platform Domain**:
   - URL: `https://dinely.food`
   - Purpose: Marketing landing page, owner authentication, multi-restaurant workspace selector, restaurant onboarding wizard, and private platform administration.

2. **Public Restaurant Tenant Subdomain**:
   - URL: `https://<public-slug>.dinely.food`
   - Example: `https://the-dunk.dinely.food`
   - Purpose: Tenant-isolated digital menu, table ordering, calling waiters, bill requests, guest feedback.

3. **Public QR Code URL Format**:
   - URL: `https://<public-slug>.dinely.food/customer?table=<table-number>&tableId=<table-id>`
   - Example: `https://the-dunk.dinely.food/customer?table=01&tableId=tbl-101`
   - Authority: Scoped directly to the tenant's hostname. Does NOT use query parameter fallback (`?tenant=...`) or `window.location.origin` from administrative views.

---

## 3. Database Domain Registry Table (`restaurant_domains`)

```sql
CREATE TABLE IF NOT EXISTS restaurant_domains (
    id VARCHAR(255) PRIMARY KEY,
    restaurant_id VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    hostname VARCHAR(255) UNIQUE NOT NULL,
    domain VARCHAR(255),
    domain_type VARCHAR(50) DEFAULT 'SUBDOMAIN', -- 'SUBDOMAIN' or 'CUSTOM'
    verification_status VARCHAR(50) DEFAULT 'ACTIVE',
    is_primary BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_restaurant_domains_hostname ON restaurant_domains(hostname);
CREATE INDEX IF NOT EXISTS idx_restaurant_domains_restaurant_id ON restaurant_domains(restaurant_id);
```

---

## 4. Tenant Resolution Sequence

When a request arrives at `https://<subdomain>.dinely.food`:
1. Cloudflare passes the request through the `dinely-tenant-router` Worker.
2. The Worker forwards the request to the SPA origin while preserving the original `Host` header.
3. The React application reads `window.location.hostname` using `getTenantFromHostname()`.
4. If a subdomain is detected (`<subdomain> != 'dinely'` and `<subdomain> != 'www'`):
   - Client queries `GET /api/v1/restaurants/public/resolve?slug=<subdomain>`.
   - Backend queries `restaurant_domains` and `restaurants` table by `hostname`, `domain`, and `public_slug`.
   - If restaurant is active and approved (`lifecycle_status == 'LIVE'`), returns `restaurant_id`, `name`, `theme`, and active modules.
   - If not found or status is not `LIVE`, returns HTTP `404 Not Found` with a dedicated tenant-not-found screen.

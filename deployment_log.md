# DINELY Production Deployment & Security Hardening Log

**Date:** 2026-09-27  
**Environment:** AWS EC2 Production (`ap-south-1`)  
**Instance ID:** `i-0997b0b381dfb3fd0` (`dinely-production`)  
**Public IP / Elastic IP:** `3.7.195.143` (Allocation: `eipalloc-04928d58ca7e87bc6`, Association: `eipassoc-0d73ee1c90de71cb3`)  
**Security Group:** `sg-0861a810cec2dd7f4` (Inbound: 80, 443 open)  
**Database:** Neon PostgreSQL (Pooled endpoint: `ep-twilight-poetry-ax0c8cxr-pooler.c-4.us-east-2.aws.neon.tech/neondb`)  

---

## 1. Secrets Management & Rotation
- **AWS SSM Parameter Store (Version 4, SecureString):**
  - `/dinely/production/DATABASE_URL`: Rotated Neon asyncpg connection string with `sslmode=require&channel_binding=require`.
  - `/dinely/production/DATABASE_URL_SYNC`: Synchronous PostgreSQL driver connection string.
  - `/dinely/production/JWT_ACCESS_SECRET_KEY`: Cryptographically secure 64-character hex secret.
  - `/dinely/production/JWT_REFRESH_SECRET_KEY`: Cryptographically secure 64-character hex secret.
- **EC2 Runtime Configuration:**
  - File: `/opt/dinely/.env`
  - Permissions: `600`, Ownership: `root:root`
  - Populated strictly from SSM Parameter Store. Zero plaintext secrets in repository or terminal logs.

---

## 2. Database Connection Hardening
- **SNI Matching Fix:**
  - Resolved `InvalidAuthorizationSpecificationError` by ensuring `endpoint_id` in `app/core/database/connection.py` retains `-pooler` suffix when connecting to pooled Neon hostnames (`options=endpoint=ep-twilight-poetry-ax0c8cxr-pooler`).
  - Database connectivity test: **`DATABASE_CONNECTIVITY=OK`** verified directly on Neon via SQLAlchemy async engine.

---

## 3. Containerized Production Architecture
- **Docker Compose:**
  - `dinely_backend`: FastAPI running under Uvicorn, port 8080 (private internal). Status: `Up (healthy)`.
  - `dinely_web`: Production Nginx reverse proxy serving compiled React SPA, proxying `/api/` and upgrading `/api/v1/ws`. Port 80 (public). Status: `Up`.
- **Health Checks:**
  - `/healthz`: HTTP 200 `{"status":"healthy","version":"2.0.0","commit":"v3-hardening-prod-1"}`.
  - `/readyz`: HTTP 200 `{"status":"ready","database":"connected","version":"2.0.0"}`.

---

## 4. Multi-Tenant Isolation & Resolution
- **Platform Domain Resolution:**
  - Host `dinely.food` -> HTTP 200 (`isPlatformDomain: true`, serving platform context).
- **Tenant A Resolution:**
  - Host `the-fly.dinely.food` -> HTTP 200 (Resolved: `THE fly`, ID: `rest-1788659067434`, 8 tables, 6 menu items).
- **Tenant B Resolution:**
  - Host `pizza-house.dinely.food` -> HTTP 200 (Resolved: `Pizza House`, ID: `rest-pizza-house`, 4 tables, 4 menu items).
- **Tenant C Resolution:**
  - Host `the-leo.dinely.food` -> HTTP 200 (Resolved: `THE LEO`, ID: `rest-1790501818990-3601c6`).
- **Invalid Subdomain Hardening:**
  - Host `unknown-tenant-999.dinely.food` -> HTTP 404 (Expected rejection).
- **Menu Isolation:**
  - Cross-tenant menu overlap: 0 items. Strict isolation verified.

---

## 5. End-to-End Order Lifecycle & WebSocket Verification
- **Order Placement:**
  - Created order `ord-rest-1788659067434-1790502979440` on `the-fly.dinely.food` for Table 01.
  - Status: HTTP 201 Created, Total: ₹29.0, Initial Status: `PENDING`.
- **Order Querying:**
  - Customer session polling via `GET /api/v1/orders/customer` returned order accurately.
- **Kitchen Operational Workflow:**
  - Chef role updated order status to `IN_KITCHEN` / `PREPARING` with estimated prep time (ETA: +12 min).
  - Kitchen marked order `READY`. All status transitions persisted to Neon DB.
- **Cross-Tenant Attack Resistance:**
  - Pizza House waiter querying `/api/v1/orders/restaurant/rest-pizza-house`: Tenant A order NOT leaked (`False`).
  - Pizza House customer query: Tenant A order NOT leaked (`False`).
  - Pizza House staff attempting mutation on Tenant A order: **HTTP 403 Forbidden** (Strict tenant barrier).
- **WebSocket Verification:**
  - Customer tenant-scoped handshake `ws://localhost/api/v1/ws?restaurant_id=...&role=CUSTOMER` -> **HTTP 101 Switching Protocols**.
  - Unauthenticated privileged role (`role=OWNER` without token) -> **HTTP 403 Forbidden** (Auth protection active).

---

## 6. Public Edge & Cloudflare Production Cutover
- **Elastic IP Origin:**
  - Associated `3.7.195.143` with EC2 `i-0997b0b381dfb3fd0`.
  - Direct HTTP: `http://3.7.195.143/healthz` -> HTTP 200 OK.
- **Cloudflare Edge Routing:**
  - Cloudflare Worker `dinely-tenant-router` deployed to Zone `dinely.food` (`db79ba1e0bcff77efa85dc7abd2cd32a`).
  - Routes: `*.dinely.food/*` and `dinely.food/*`.
  - Upstream: `ec2-3-7-195-143.ap-south-1.compute.amazonaws.com` (Elastic IP origin).
  - Preserves incoming `Host` header, `X-Forwarded-Host`, `X-Forwarded-Proto: https`, and WebSockets.
- **Live HTTPS External Verification:**
  - `https://dinely.food` -> HTTP 200 (Clean SPA HTML from EC2 Nginx, 0 Firebase headers).
  - `https://the-fly.dinely.food` -> HTTP 200.
  - `https://pizza-house.dinely.food` -> HTTP 200.
  - `https://the-leo.dinely.food` -> HTTP 200.
  - `https://dinely.food/healthz` -> HTTP 200 `{"status":"healthy","version":"2.0.0"}`.
  - `https://dinely.food/readyz` -> HTTP 200 `{"status":"ready","database":"connected"}`.
  - `https://dinely.food/api/v1/restaurants/public/resolve?hostname=dinely.food` -> HTTP 200 (`isPlatformDomain: true`).
  - `https://the-fly.dinely.food/api/v1/restaurants/public/resolve` -> HTTP 200 (`THE fly`, `rest-1788659067434`).
  - `https://pizza-house.dinely.food/api/v1/restaurants/public/resolve` -> HTTP 200 (`Pizza House`, `rest-pizza-house`).
  - `https://the-leo.dinely.food/api/v1/restaurants/public/resolve` -> HTTP 200 (`THE LEO`, `rest-1790501818990-3601c6`).

---
**Deployment Verification Result:** COMPLETE & FULLY OPERATIONAL. Cloudflare traffic successfully cuts over to EC2 Elastic IP origin with zero Firebase leaks.


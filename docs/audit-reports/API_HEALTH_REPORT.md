# Dinely V3 — Production API & Integration Health Audit

**Audit Timestamp:** 2026-11-05T09:20:00+05:30  
**Environment Target:** Production Cluster (`https://dinely.food`, `https://the-start.dinely.food`, `https://max-kart.dinely.food`)  
**Host Target:** AWS EC2 `i-0997b0b381dfb3fd0` (Region: `ap-south-1` Mumbai)  
**Database Host:** `dinely-db-mumbai.cfaueau2o1gp.ap-south-1.rds.amazonaws.com` (AWS RDS PostgreSQL 16)  
**Security Policy:** Zero credential exposure, safe provider-supported verification requests only.

---

## 1. Executive API Integration Health Table

| Integration | Configuration | Authentication | HTTP / WS Response | Latency (ms) | Result |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **AWS Application Load Balancer (`/healthz`)** | Production Nginx/ALB reverse proxy to Uvicorn | Public Health Probe | `HTTP 200 {"status":"healthy"}` | 77.8 ms | **PASS** |
| **AWS RDS PostgreSQL 16 (`/readyz`)** | Managed Multi-AZ DB (`dinely-db-mumbai`) | Async connection pool check | `HTTP 200 {"database":"connected"}` | 92.6 ms | **PASS** |
| **AWS S3 Object Storage (`ap-south-1`)** | Persistent asset bucket (`dinely-storage-ap-south-1`) | Public CDN Read for Assets | `HTTP 200 (Migration probe verified)` | 362.1 ms | **PASS** |
| **Cloudflare Anycast CDN & SSL** | Edge proxy with Let's Encrypt / ACM Wildcard | TLS 1.3 Strict (`*.dinely.food`) | `HTTP 200 (CF-Ray & Brotli active)` | 75.0 ms | **PASS** |
| **Firebase Auth Service (`dinely-cd6cd`)** | Google Identity Toolkit SDK + OAuth provider | Bearer Firebase ID Tokens | `HTTP 200 (Google Discovery OK)` | 728.4 ms | **PASS** |
| **Tenant Subdomain Resolver (Restaurant OS)** | Host header routing (`the-start.dinely.food`) | Public Domain Ingress | `HTTP 200 (slug: the-start, type: BAR)` | 83.0 ms | **PASS** |
| **Tenant Subdomain Resolver (Food Cart OS)** | Host header routing (`max-kart.dinely.food`) | Public Domain Ingress | `HTTP 200 (slug: max-kart, type: FOOD_CART)` | 71.8 ms | **PASS** |
| **Menu Ingestion Engine (`/menu`)** | Category & Item ORM hierarchy with stations | Public Customer Ingress | `HTTP 200 (5 categories, 9 active items)` | 230.2 ms | **PASS** |
| **Table State Management (`/tables`)** | Floorplan area grid & occupancy mapping | Public Dining Ingress | `HTTP 200 (14 tables resolved)` | 103.3 ms | **PASS** |
| **Staff Terminal Login (`/terminal-login`)** | Bcrypt PIN verification & scoped JWT issuer | Passcode + Role Authorization | `HTTP 200 (Access JWT generated)` | 97.0 ms | **PASS** |
| **Kitchen Queue Service (`/orders/restaurant/{id}`)** | Station decomposition (`station=KITCHEN`) | Bearer JWT (`KITCHEN` Role) | `HTTP 200 (Active kitchen queue)` | 97.2 ms | **PASS** |
| **Bar Queue Service (`/orders/restaurant/{id}`)** | Station decomposition (`station=BAR`) | Bearer JWT (`BAR` Role) | `HTTP 200 (Active beverage queue)` | 95.4 ms | **PASS** |
| **Hookah Queue Service (`/orders/restaurant/{id}`)** | Station decomposition (`station=HOOKAH`) | Bearer JWT (`HOOKAH` Role) | `HTTP 200 (Active shisha queue)` | 98.1 ms | **PASS** |
| **Waiter Queue Service (`/orders/restaurant/{id}`)** | Cross-station ready dish dispatch | Bearer JWT (`WAITER` Role) | `HTTP 200 (Active dispatch queue)` | 225.5 ms | **PASS** |
| **Food Cart Code Lookup (`/lookup-code/{code}`)** | Monospace 5-digit index (`C0001`–`C9999`) | Public Counter Verification | `HTTP 200 (Order details resolved)` | 88.5 ms | **PASS** |
| **Food Cart Code Redemption (`/redeem-code`)** | Order handover state transition & ledger update | Role / Staff Guard | `HTTP 200 (Redemption successful)` | 92.1 ms | **PASS** |
| **Daily Business Day (`/business-day/current`)** | Shift float reconciliation & cash/UPI split | Authenticated Staff / Owner | `HTTP 200 (Active business day open)` | 137.0 ms | **PASS** |
| **Realtime WebSocket Protocol (`/api/v1/ws`)** | Full-duplex RFC 6455 persistent socket | Ping-pong keepalive protocol | `101 Switching Protocols -> "pong"` | 75.7 ms | **PASS** |
| **Platform Admin Security Guard (`/admin/*`)** | Strict fail-closed RBAC access control | Super Admin Email Allowlist | `HTTP 401 (Unauthenticated rejected)` | 80.0 ms | **PASS** |

---

## 2. API Configuration & Environment Audit

1. **Environment Variables Audit:**
   - `ENVIRONMENT`: Set to `production` on AWS EC2 (`development` with SQLite for local regression test runs).
   - `DATABASE_URL`: Validated and normalized with `sslmode=require` enforcement for production PostgreSQL.
   - `JWT_ACCESS_SECRET_KEY` & `JWT_REFRESH_SECRET_KEY`: High-entropy 64-character hex keys configured in production.
   - `FIREBASE_PROJECT_ID`: Set to `dinely-cd6cd`.
   - `CORS_ORIGINS`: Explicitly whitelisted: `https://dinely.food`, `https://*.dinely.food`, `https://dinely-cd6cd.web.app`, `https://dinely-cd6cd.firebaseapp.com`.
   - `RATE_LIMIT_ENABLED`: Enabled (`True`), verified live with `HTTP 429` enforcement upon 20 consecutive rapid login bursts.

2. **Error Handling & Resilience:**
   - Exception handling wrapped in Starlette `http_exception_handler` with unique `x-correlation-id` tracing headers.
   - Database disconnections cleanly handled via connection pool pre-pinging (`pool_pre_ping=True`).
   - Rate limit responses return `type: "rate_limit_exceeded"` with explicit `retry_after_seconds` headers.

---

## 3. Final API Audit Status

**OVERALL STATUS: PASS — Verified with live network evidence.**

# AWS Migration Audit: DineFlow / Dinely v3

**Date:** October 27, 2026  
**Project:** DineFlow / Dinely v3  
**Primary Domain:** `dinely.food`  
**Subdomains:** `*.dinely.food` (e.g. `max-kart.dinely.food`, `delhi-kathi-stand.dinely.food`, `ayaan.dinely.food`)  
**AWS Account ID:** `549047258450`  
**Primary Region:** `ap-south-1` (Asia Pacific - Mumbai)  

---

## 1. Executive Summary

This audit assesses the infrastructure, software components, operational dependencies, and deployment topology of the **DineFlow v3** multi-tenant restaurant and venue operating system. 

The primary objective is the total, verified migration to AWS, ensuring zero operational downtime, strict isolation from unrelated AWS workloads, elimination of single-point-of-failure edge quotas (such as Cloudflare Error 1027), and complete preservation of all production data, schemas, and real-time operational workflows.

---

## 2. Repository & Subsystem Inventory

### 2.1 Frontend Architecture
- **Framework:** React 19 with TypeScript, bundled using Vite 6.
- **Location:** `frontend/`
- **Application Workflows Hosted in Single SPA:**
  - **Public Landing Page & Creation Wizard:** `dinely.food` (Landing website, pricing, feature showcase, business setup wizard).
  - **Restaurant & Bar OS:** `dinely.food/app` (Operations center, live dining floor, floorplans, menu catalog, tax, reporting).
  - **Food Cart OS:** `<slug>.dinely.food/cart` (Cart order terminal, pickup coupon verification, audio alert queue).
  - **Wedding & Events OS:** `dinely.food/portal` (Event management, station routing, day-of timeline, banquet table configuration).
  - **Customer Ordering Storefronts:** `<slug>.dinely.food` (Digital QR dining menu, mobile cart ordering with pickup vouchers, wedding guest order app).
  - **Specialized Operational Terminals:**
    - Kitchen ETA Dashboard: `/kitchen`
    - Waiter Terminal: `/waiter`
    - Bar Station Terminal: `/bar`
    - Hookah Lounge Terminal: `/hookah`
- **Build Output:** Static production bundle in `frontend/dist/`.
- **Runtime Web Server:** Nginx Alpine (`frontend/nginx.conf`), serving static assets, handling client-side SPA routing (`try_files $uri $uri/ /index.html`), reverse-proxying API traffic to backend on port 8080, managing WebSocket upgrades on `/api/v1/ws`, and proxying Firebase Auth helper calls on `/__/`.

### 2.2 Backend Services & API
- **Framework:** FastAPI (Python 3.9+) with Pydantic v2 and Uvicorn.
- **Location:** `backend/dineflow-backend/`
- **Database ORM & Driver:** SQLAlchemy 2.0 Async with `asyncpg` for non-blocking I/O, plus sync SQLAlchemy with `psycopg2` for offline Alembic schema migrations.
- **Key Modules:**
  - `app/modules/orders`: Complete order lifecycle, state machine, pickup vouchers, ETA calculation, station tickets.
  - `app/modules/restaurants`: Multi-tenant restaurant entity management, slug resolution, lifecycle state.
  - `app/modules/menus`: Category management, menu items, variants, dietary tags, image references.
  - `app/modules/tables`: Dining tables, QR code tokens, active table sessions, dining bill generation.
  - `app/modules/billing`: Invoice generation, tax breakdown, payments, split billing.
  - `app/modules/events`: Wedding workspaces, event sessions, guest table ordering, non-commercial station fulfillment.
  - `app/modules/inventory`: Ingredient stock tracking, depletion events, suppliers.
  - `app/modules/auth`: Dual-token JWT (access & refresh) with Argon2id password hashing, platform admin guardrails.
  - `app/modules/customer_requests`: Waiter call assistance (water, cutlery, bill, assistance).

### 2.3 Real-Time Notification & Communication System
- **Implementation:** `frontend/src/packages/api/realtime.ts` and backend `app/modules/orders/websocket.py` & SSE endpoints.
- **Event Bus:** `realtimeBus` singleton supporting WebSocket connection at `/api/v1/ws/{restaurant_id}`, Server-Sent Events (SSE) at `/api/v1/orders/stream/sse`, and automatic poll-backoff fallback.
- **Station Scoping:** Events broadcast granular station metadata (`KITCHEN`, `BAR`, `HOOKAH`, `WAITER`) preventing cross-terminal notification storms.

### 2.4 Authentication & Identity
- **Staff & Admin:** In-house JWT authentication signed with `HS256` using `JWT_ACCESS_SECRET_KEY` and `JWT_REFRESH_SECRET_KEY`. Passwords securely hashed with Argon2 (`time_cost=3`, `memory_cost=65536`).
- **Customer Anonymous/Session Auth:** Scoped table-session tokens and cart customer tokens.
- **Google OAuth / Firebase Helper:** Native reverse proxy in Nginx at `/__/auth/*` forwarding to Firebase Auth (`https://dinely-cd6cd.firebaseapp.com/__/`) with SSL SNI and original host headers.

### 2.5 Persistent Storage & Assets
- **Engine:** AWS S3 (`boto3`) implemented in `app/core/storage/provider.py` (`S3Storage`).
- **Active S3 Bucket:** `dinely-storage-ap-south-1` in `ap-south-1`.
- **Security:** AES256 server-side encryption, versioning enabled, CORS policy allowing `https://dinely.food` and `https://*.dinely.food`.
- **Access Control:** IAM role `DinelyEC2SSMRole` granted least-privilege access strictly to `dinely-storage-ap-south-1`.

---

## 3. Discovered Production Database Configuration

- **Provider:** Amazon RDS for PostgreSQL.
- **Instance Identifier:** `dinely-db-mumbai`.
- **Database Engine & Version:** PostgreSQL 16.9.
- **Endpoint:** `dinely-db-mumbai.cfaueau2o1gp.ap-south-1.rds.amazonaws.com:5432`.
- **Database Name:** `neondb`.
- **Network Isolation:** Private VPC subnet (`vpc-0259561b2f176fdce`). `PubliclyAccessible: False`.
- **Security Group:** `sg-00c486733f4fb8753`, accepting ingress traffic on port 5432 strictly from application security group `sg-0861a810cec2dd7f4`.
- **Data Footprint:** 33 tables, 12 restaurants/venues, 87 orders, 136 order items, 28 bills, 53 customer requests, 71 dining tables, 51 table sessions, 17 wedding events, 84 event tables.
- **Migration & Schema Tool:** Alembic (`alembic_version` head current).

---

## 4. Root Cause of Previous Outage (Cloudflare Error 1027)

### Analysis:
1. **The Architecture Flaw:** Previously, a Cloudflare Worker (`dinely-tenant-router`) was configured on a wildcard route `*.dinely.food/*`.
2. **Quota Depletion:** Because every static file (JS chunks, CSS, images), health check probe, rapid terminal polling query, and WebSocket handshake was executed through the serverless Worker script, the free-tier daily request quota (100,000 requests) was completely exhausted.
3. **The Outage:** Once the request limit was reached, Cloudflare returned HTTP 1027 ("Worker resource limit exceeded"), taking down the entire storefront and all operational terminals simultaneously.
4. **Resolution Strategy:**
   - Multi-tenant host header resolution and routing is **natively handled by Nginx** on the application server.
   - Cloudflare must function strictly as DNS and standard CDN proxy (or DNS-only), passing traffic directly to the AWS origin without Worker interception.
   - Alternatively, traffic routes directly via AWS Route 53 and Application Load Balancer / Elastic IP, entirely decoupling the application from Cloudflare Workers.

---

## 5. AWS Resource & Isolation Audit

An audit of AWS Account `549047258450` revealed:

| Resource Type | Resource Identifier | Purpose / Project | Isolation Status |
| :--- | :--- | :--- | :--- |
| **EC2 Instance** | `i-0997b0b381dfb3fd0` (`t3.small`) | Dinely Production Compute (`3.7.195.143`) | **DineFlow Dedicated** |
| **RDS Instance** | `dinely-db-mumbai` (`db.t4g.micro`) | Dinely PostgreSQL 16.9 Database | **DineFlow Dedicated** |
| **S3 Bucket** | `anshika-birthday-music-vault` | Unrelated Project (Created 2026-10-22) | **DO NOT TOUCH / UNRELATED** |
| **S3 Bucket** | `dinely-storage-ap-south-1` | Dinely Persistent Uploads & DB Backups | **DineFlow Dedicated** |
| **IAM Role** | `DinelyEC2SSMRole` | EC2 Instance Profile (SSM + S3 storage) | **DineFlow Dedicated** |
| **IAM User** | `dinely-deployer` | Scoped CI/CD Deployment User | **DineFlow Dedicated** |
| **CloudWatch Log** | `/aws/dinely/production` | Application Logs (30-day retention) | **DineFlow Dedicated** |
| **CloudWatch Alarm** | `dinely-ec2-status-check-failed` | EC2 System & Instance Health Alarm | **DineFlow Dedicated** |
| **CloudWatch Alarm** | `dinely-ec2-high-cpu` | CPU Utilization Alarm (>85% for 15m) | **DineFlow Dedicated** |
| **AWS Budget** | `DineFlow-Monthly-Control` | $30.00 USD/month budget alert | **DineFlow Dedicated** |

> [!CAUTION]
> **Resource Isolation Warning:** S3 bucket `anshika-birthday-music-vault` belongs to an external project. All DineFlow operations must be strictly scoped to `dinely-storage-ap-south-1` and DineFlow-specific security groups.

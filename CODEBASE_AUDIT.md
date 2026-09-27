# Dinely Production Codebase Inventory & Audit Report

## Executive Summary
This document provides a comprehensive audit of the Dinely multi-tenant restaurant SaaS codebase spanning frontend (React/Vite), backend (FastAPI/PostgreSQL/Asyncpg), infrastructure (AWS EC2, ALB, ACM, Route 53, RDS, S3), and auxiliary scripts.

---

## 1. Frontend Architecture Inventory

| Component / Subsystem | Path | Status | Classification | Purpose / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Main App Shell** | `src/App.tsx` | ACTIVE | PRODUCTION | Root SPA dispatcher, tenant resolution, auth state management, dynamic route loading |
| **Theme Engine** | `src/packages/theme/ThemeEngine.tsx` | ACTIVE | PRODUCTION | Dynamic CSS variable injection for tenant-specific themes and brand colors |
| **Tenant Resolver** | `src/packages/utils/tenantResolver.ts` | ACTIVE | PRODUCTION | Hostname and subdomain parsing (`<slug>.dinely.food`), custom domain support |
| **Auth State Machine** | `src/packages/auth/authStateMachine.ts` | ACTIVE | PRODUCTION | Reactive state machine managing initializing, authenticated, unauthenticated, and error states |
| **Firebase Auth Client** | `src/packages/auth/firebase.ts` | ACTIVE | PRODUCTION | Safe web configuration for Google Sign-In and token lifecycle management |
| **API Client** | `src/packages/api/client.ts` | ACTIVE | PRODUCTION | Singleton HTTP client connecting to relative `/api/v1` behind reverse proxy |
| **WebSocket Client** | `src/packages/api/realtime.ts` | ACTIVE | PRODUCTION | Realtime bus with tenant scoping (`wss://${loc.host}/api/v1/ws`) and auto-reconnect |
| **Landing Website** | `src/apps/landing/LandingWebsite.tsx` | ACTIVE | PRODUCTION | Apex domain (`dinely.food`) public landing page, pricing, and features |
| **Platform Admin** | `src/apps/platform/PlatformApp.tsx` | ACTIVE | PRODUCTION | Master control plane (`dinely.food/admin`), metrics, tenant directory, approvals |
| **Restaurant Onboarding** | `src/apps/onboarding/RestaurantSignupPage.tsx` | ACTIVE | PRODUCTION | Canonical tenant creation wizard at `/signup` with live slug availability check |
| **Restaurant Portal** | `src/apps/restaurant/RestaurantApp.tsx` | ACTIVE | PRODUCTION | Restaurant owner/staff management suite (menu, tables, orders, analytics) |
| **Customer App** | `src/apps/customer/CustomerApp.tsx` | ACTIVE | PRODUCTION | Tenant customer ordering interface (`<slug>.dinely.food/customer`) |
| **Waiter Terminal** | `src/apps/waiter/WaiterTerminalOS.tsx` | ACTIVE | PRODUCTION | Tablet-optimized floor operations, table assignment, live orders |
| **Kitchen KDS** | `src/apps/restaurant/KitchenETADashboard.tsx` | ACTIVE | PRODUCTION | Realtime kitchen display system receiving live customer order tickets |
| **Bar Terminal** | `src/apps/bar/BarTerminal.tsx` | ACTIVE | PRODUCTION | Specialized terminal for drink and beverage preparation |
| **Inventory Terminal** | `src/apps/inventory/InventoryTerminalOS.tsx` | ACTIVE | PRODUCTION | Stock levels, ingredient depletion tracking, supplier orders |
| **Operations Center** | `src/apps/operations/RestaurantOperationsCenter.tsx` | ACTIVE | PRODUCTION | Floor management, table layout visualizer, active sessions |
| **Role Login** | `src/apps/auth/RoleLoginPage.tsx` | ACTIVE | PRODUCTION | PIN/staff authentication for terminal interfaces |
| **Legacy Mock Data** | `src/packages/data/mockData.ts` | USED | FALLBACK | Empty array definitions and default branding colors; safe fallback |
| **Firebase Hosting Config**| `frontend/firebase.json` | DEPRECATED | OBSOLETE | Legacy Firebase hosting configuration (migrated to AWS ALB/EC2) |
| **Vercel Config** | `frontend/vercel.json`, `vercel.json` | DEPRECATED | OBSOLETE | Legacy Vercel deployment manifests |
| **Railway Config** | `railway.json`, `backend/dineflow-backend/railway.json` | DEPRECATED | OBSOLETE | Legacy Railway deployment configuration |

---

## 2. Backend Architecture Inventory

| Component / Module | Path | Status | Classification | Purpose / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Core ASGI Engine** | `app/main.py` | ACTIVE | PRODUCTION | FastAPI initialization, lifespan background migrations, CORS, error handling |
| **Tenant Resolver** | `app/core/tenant/resolver.py` | ACTIVE | PRODUCTION | Canonical tenant resolver (extracts slug, queries `restaurant_domains`, enforces tenant UUID) |
| **Logging Middleware** | `app/core/middlewares/logging.py` | ACTIVE | PRODUCTION | Structured request logs with `request_id`, `hostname`, `resolved_restaurant_id`, redacted secrets |
| **Security Headers** | `app/core/middlewares/security_headers.py`| ACTIVE | PRODUCTION | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy |
| **Payload Limit** | `app/core/middlewares/payload_limit.py` | ACTIVE | PRODUCTION | Enforces 25MB max request size across all endpoints |
| **Rate Limiter** | `app/core/middlewares/rate_limit.py` | ACTIVE | PRODUCTION | In-memory token bucket rate limiting |
| **Storage Provider** | `app/core/storage/provider.py` | ACTIVE | PRODUCTION | S3 (`boto3`) tenant-safe object storage (`restaurants/{id}/...`) with local/Cloudinary fallback |
| **Database Connection** | `app/core/database/connection.py` | ACTIVE | PRODUCTION | Async SQLAlchemy session pool (`asyncpg`), connection pre-ping, recycling |
| **Restaurant Router** | `app/modules/restaurants/router.py` | ACTIVE | PRODUCTION | Public tenant resolution, slug validation, tenant creation, settings |
| **Menu Router** | `app/modules/menu/router.py` | ACTIVE | PRODUCTION | Multi-tenant menu categories, items, modifiers scoped by `restaurant_id` |
| **Table Router** | `app/modules/tables/router.py` | ACTIVE | PRODUCTION | Multi-tenant floor tables, QR code generation, session management |
| **Order Router** | `app/modules/orders/router.py` | ACTIVE | PRODUCTION | Multi-tenant order placement, status updates, kitchen dispatch |
| **Billing Router** | `app/modules/billing/router.py` | ACTIVE | PRODUCTION | Invoices, taxes, UPI QR payment generation |
| **Customer Requests** | `app/modules/customer_requests/router.py`| ACTIVE | PRODUCTION | Live waiter call bell, water/cutlery requests scoped by table |
| **Platform Control Plane**| `app/modules/platform/router.py` | ACTIVE | PRODUCTION | Admin statistics, all-restaurant listing, approval workflows |
| **WebSocket Router** | `app/modules/websocket/router.py` | ACTIVE | PRODUCTION | Multi-channel realtime hub (`restaurant:{id}:{role}`) with token auth |

---

## 3. Infrastructure & Deployment Inventory

| Resource | File / Service | Status | Classification | Purpose / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Nginx Reverse Proxy** | `frontend/nginx.conf` | ACTIVE | PRODUCTION | Listens on port 80, routes `/api/*` and WebSockets to FastAPI, serves static React SPA |
| **Frontend Dockerfile** | `frontend/Dockerfile` | ACTIVE | PRODUCTION | Multi-stage build (`node:20-alpine` -> `nginx:alpine`) |
| **Backend Dockerfile** | `backend/dineflow-backend/Dockerfile` | ACTIVE | PRODUCTION | Python 3.12-slim container running Uvicorn with `--proxy-headers` |
| **Production Compose** | `docker-compose.prod.yml` | ACTIVE | PRODUCTION | Orchestrates `backend` and `web` with health checks on EC2 |
| **EC2 Bootstrap** | `scripts/aws_ec2_setup.sh` | ACTIVE | DEPLOYMENT | Ubuntu 24.04 LTS provisioning script (Docker, compose, UFW) |
| **RDS Migration Script**| `scripts/restore_rds.py` | ACTIVE | DEPLOYMENT | Restores verified SQL backup into AWS RDS PostgreSQL with row count audits |
| **AWS Deployment Guide**| `AWS_DEPLOYMENT.md` | ACTIVE | DOCUMENTATION | Comprehensive AWS runbook for `ap-south-1` (Mumbai) |
| **Architecture Map** | `PRODUCTION_ARCHITECTURE.md` | ACTIVE | DOCUMENTATION | End-to-end request flow diagram and tenant isolation matrix |
| **Temporary Scratch** | `scratch/` | UNUSED | SCRATCH | Ephemeral debug scripts from earlier troubleshooting |
| **Root Legacy Docs** | `01_SYSTEM_INVENTORY.md`, etc. | USED | DOCUMENTATION | Prior forensic reports; preserved for operational history |

---

## 4. Dead Code & Obsolete Artifacts Identified for Safe Cleanup

1. **Obsolete Deployment Files (Safe to remove):**
   - `railway.json` and `backend/dineflow-backend/railway.json`: Railway manifests no longer used on AWS.
   - `vercel.json` and `frontend/vercel.json`: Vercel configuration files no longer used on AWS.
   - `CURRENT_RENDER_CONFIGURATION.md`: Outdated document outlining discontinued Render deployment.
   - `scratch/`: Scratch folder containing temporary exploratory test scripts.
2. **Obsolete Dependencies & References:**
   - Unused legacy origins in `CORS_ORIGINS` (`onrender.com`).
   - Obsolete development references in `frontend/src`.

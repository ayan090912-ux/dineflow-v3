# Dinely — Production Security Baseline

## Executive Summary
This document defines the production security standards, architectural controls, and threat-mitigation protocols for the Dinely multi-tenant restaurant operating system across its Cloud Run backend, Cloudflare Edge, Firebase Authentication, and Neon PostgreSQL data layers.

---

## 1. Threat Model & Defense-in-Depth Architecture

Dinely adheres to a 5-layer defense model:
```
[Client / Bot / Customer / Staff]
               │
               ▼
[Layer 1: Cloudflare Edge]
├── L3/L4/L7 DDoS Shielding
├── Cloudflare Bot Fight Mode & Managed WAF
├── Edge Rate Limiting Rules (/api/v1/auth/*, /api/v1/orders)
└── Edge Cache-Control for Public Resolution & Menus
               │
               ▼
[Layer 2: Google Cloud Run Infrastructure]
├── Hard Service Scaling Ceiling (min: 0, max: 3 instances)
├── Dedicated Least-Privilege Service Account (dinely-backend-runner)
├── Concurrency Cap (80 req/container) & Execution Timeout (3600s for WS)
└── Cloud Run Container Isolation (read-only root, non-root UID 10001)
               │
               ▼
[Layer 3: FastAPI Application Security & Abuse Defense]
├── SecurityHeadersMiddleware (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
├── PayloadLimitMiddleware (1MB JSON, 5MB Multipart, immediate 413)
├── SlidingWindowRateLimiter (10/min auth, 5/min restaurant, 20/min order, 60/min resolve)
├── Sanitized LoggingMiddleware (URL query & header credential redaction)
└── Global Production Exception Handling (zero trace/SQL leakage, correlation IDs)
               │
               ▼
[Layer 4: Cryptographic Authentication & RBAC]
├── Google Firebase RS256 Public Key Verification (Owner & Platform Admin)
├── Backend HS256 JWT Signed Sessions (Operational Staff Terminals)
├── Strict Unauthenticated Rejection (HTTP 401 Unauthorized)
└── Strict Tenant Membership & IDOR Guard (HTTP 403 Forbidden)
               │
               ▼
[Layer 5: Neon PostgreSQL & Data Protection]
├── SSL Enforced (ssl=require) via AWS ap-southeast-1 pooler
├── Prepared Statement Caching Disabled (Pooler transaction safety)
├── Statement Timeout (command_timeout=30s) & Connection Recycling (60s)
└── Idempotency Keys on mutating operations (Orders, Bills, Table Sessions)
```

---

## 2. Authentication Protocol

### 2.1 Credential Verification
- **Platform Admin**:
  - Exclusively authenticated via Google Firebase OAuth ID tokens.
  - Password authentication is permanently disabled on `/api/v1/auth/platform/login` (returns 403).
  - Validated against cryptographic RS256 Google public X.509 certs and strictly checked against `PLATFORM_ADMIN_EMAIL` (`ayan090912@gmail.com`) and database whitelist.
- **Restaurant Owners**:
  - Authenticate via Firebase Authentication (`dinely-cd6cd`).
  - Owner UID and email are bound to the tenant in `restaurants` and `restaurant_memberships`.
- **Operational Staff Terminals (Kitchen, Waiter, Bar, Inventory, Billing)**:
  - Terminal logins require restaurant ID validation + staff PIN via `/api/v1/auth/terminal-login`.
  - Upon successful verification, issues an HS256 cryptographically signed JWT containing `{sub: staff_id, role: STAFF_ROLE, restaurant_id: id}`.
  - Staff terminal headers without a valid cryptographic token are rejected in production.

### 2.2 Rejection Standards
- **Missing or Invalid Token**: `HTTP 401 Unauthorized`.
- **Valid Token but Insufficient Role / Mismatched Tenant**: `HTTP 403 Forbidden`.
- **Client State Distrust**: The backend NEVER trusts `localStorage`, `sessionStorage`, client role headers, or query parameters as proof of identity.

---

## 3. Strict Multi-Tenant Isolation (Anti-IDOR)

### 3.1 Tenant Scope Verification
Every protected route enforces four-point authorization:
1. **Authenticated Identity**: Caller UID/email verified from token.
2. **Tenant Membership**: Caller verified as owner, admin, or active member of `restaurant_id`.
3. **Role Authorization**: Caller's role matches required capability for the endpoint.
4. **Target Resource Verification**: The target resource (order, menu item, bill, table, session) must belong to `restaurant_id`.

### 3.2 Cross-Tenant Bleed Prevention
- Attempting to access or mutate Tenant B resources with Tenant A credentials strictly returns `HTTP 403 Forbidden`.
- Database queries consistently scope queries with `WHERE restaurant_id = :authorized_restaurant_id`.

---

## 4. Abuse Prevention & Rate Limiting

### 4.1 Sliding-Window Rate Limit Matrix
| Endpoint Category | Method & Path Prefix | Limit | Window | Action on Exceed |
| :--- | :--- | :--- | :--- | :--- |
| **Auth / PIN Login** | `POST /api/v1/auth/terminal-login`<br>`POST /api/v1/auth/staff/login`<br>`POST /api/v1/auth/platform/login` | 10 req | 60s | 429 Too Many Requests (`Retry-After: 60`) |
| **Restaurant Creation** | `POST /api/v1/restaurants` | 5 req | 60s | 429 Too Many Requests |
| **Customer Orders** | `POST /api/v1/orders` | 20 req | 60s | 429 Too Many Requests |
| **Customer Service Requests**| `POST /api/v1/customer-requests` | 15 req | 60s | 429 Too Many Requests |
| **Public Resolution** | `GET /api/v1/restaurants/public/resolve`<br>`GET /api/v1/restaurants/public/slug` | 60 req | 60s | 429 Too Many Requests |
| **Operational Terminals** | Authenticated staff/owner routes | 120 req | 60s | 429 Too Many Requests |
| **Health Checks** | `/healthz`, `/readyz` | Exempt | N/A | Always 200 OK |

### 4.2 Payload Size Limiting
- JSON bodies: Max 1MB (1,048,576 bytes).
- Multipart uploads: Max 5MB (5,242,880 bytes).
- Oversized requests are rejected immediately with `413 Payload Too Large` before memory buffering.

---

## 5. Realtime WebSocket Protection

### 5.1 Connection Quotas & Throttling
- **Per-IP Connection Cap**: Maximum 10 concurrent active WebSockets per client IP.
- **Global Connection Cap**: Maximum 500 total active WebSockets per container instance.
- **Reconnect Storm Throttling**: Maximum 5 connection attempts per 5 seconds per IP. Reconnect loops exceeding this are closed with WebSocket close code `1008 Policy Violation`.

### 5.2 Tenant & Role Isolation
- Privileged subscriptions (`PLATFORM_ADMIN`, `OWNER`, `WAITER`, `KITCHEN`, `BAR`, `INVENTORY`) strictly require a valid cryptographic token.
- `broadcast_event()` only delivers payloads to connections registered to that exact `restaurant_id`.
- `broadcast_to_platform_admin()` only delivers to verified platform admin connections on `__platform_admin__`.

---

## 6. Information Leakage & Logging Sanitization

### 6.1 Token Redaction
- `LoggingMiddleware` intercepts and strips sensitive query parameters (`token`, `jwt`, `secret`, `key`, `password`, `auth`) using regex replacement `\1=[REDACTED]`.
- Request headers (`Authorization`, `X-Firebase-ID-Token`, cookies) are never output to server logs.

### 6.2 Error Sanitization
- In production (`DEBUG=false`), unhandled exceptions caught by FastAPI return:
  ```json
  {
    "detail": "An internal server error occurred. Please try again later.",
    "status_code": 500,
    "correlation_id": "uuid-v4"
  }
  ```
- Raw SQL queries, database hostnames, stack traces, and filesystem paths are suppressed from client responses. Detailed errors are logged server-side accompanied by the correlation ID.

---

## 7. Security HTTP Headers
All responses from Dinely backend include:
```http
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=(), microphone=()
```

---

## 8. Database Safety & Connection Limits
- **SSL Connection**: Enforced `ssl=require`.
- **Pooler Compatibility**: `statement_cache_size=0` and `prepared_statement_cache_size=0` for Neon transaction poolers.
- **Statement Timeout**: `command_timeout=30` prevents long-running queries from hanging connection slots.
- **Pool Sizing**: Pool size 10, max overflow 20 per container. With `max-instances=3`, maximum concurrent database connections from Cloud Run will never exceed 90, well within Neon connection limits.

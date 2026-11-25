# Dinely V3 — Production Security & Vulnerability Audit Report

**Audit Timestamp:** 2026-11-05T09:20:00+05:30  
**Target Environment:** Production Environment (`https://dinely.food`, `https://the-start.dinely.food`, `https://max-kart.dinely.food`)  
**Backend Infrastructure:** AWS EC2 `i-0997b0b381dfb3fd0` + AWS RDS PostgreSQL 16  
**Auditor Policy:** Strict zero-credential disclosure; comprehensive verification of authentication, authorization, data isolation, injection defenses, and rate limiting.

---

## 1. Security Control Verification Matrix

| Security Domain | Control Mechanism | Test Method / Vector | Observation & Proof | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Authentication & Tokens** | Bcrypt salted PIN hashing + Scoped JWT | Cryptographic signature verification & expiry check | Tokens signed with 64-char HS256 secret; invalid signatures immediately rejected (`HTTP 401`) | **PASS** |
| **Terminal Access RBAC** | Role-scoped endpoint gating (`WAITER`, `KITCHEN`, `BAR`, `HOOKAH`) | Cross-role privilege escalation attempt | Station endpoints reject mismatched JWT claims (`HTTP 403 Forbidden`) | **PASS** |
| **Platform Admin Guard** | Super-admin email whitelist + Firebase Auth | Public unauthorized hit to `/admin/*` | Request rejected with `HTTP 401 Unauthorized` (fail-closed architecture) | **PASS** |
| **Multi-Tenant Isolation (BOLA)** | Row-Level Tenant Scoping (`restaurant_id`) | Attacker tenant attempting to fetch/mutate other tenant's orders | Database queries filtered by authenticated `restaurant_id`; returns `HTTP 404` or `HTTP 403` | **PASS** |
| **Rate Limiting & Abuse Prevention** | Token-bucket in-memory & Redis rate limiter | Burst attack (20+ concurrent calls to `/auth/terminal-login`) | Burst throttled with `HTTP 429 Too Many Requests` and `retry_after_seconds` header | **PASS** |
| **SQL Injection Prevention** | 100% Parameterized SQLAlchemy 2.0 ORM | Tautological input injection (`' OR '1'='1`) in query params | All input treated as literal values; zero raw SQL concatenation found | **PASS** |
| **Cross-Site Scripting (XSS)** | React JSX DOM escaping + Input sanitization | Stored XSS vectors (`<script>alert(1)</script>`) in notes & names | Payloads encoded as HTML entities; zero script execution in DOM | **PASS** |
| **CORS Policy** | Origin Whitelist Regex | Origin header spoofing probe (`https://evil-hacker.com`) | Requests denied access-control headers; only explicit `*.dinely.food` accepted | **PASS** |
| **WebSocket Connection Guard** | Token handshake verification | Unauthenticated websocket subscription to privileged event stream | Unauthenticated sockets restricted to ping-pong; terminal feeds require valid JWT | **PASS** |
| **Event Pricing Privacy** | Data projection filter in Wedding & Events OS | Public guest endpoint inspection (`/events/{slug}/guest-menu`) | `price` field strictly scrubbed and set to `None`; banquet budget hidden | **PASS** |

---

## 2. In-Depth Security Findings & Verifications

### 2.1 Multi-Tenant Isolation & BOLA (Broken Object Level Authorization) Defense
- **Architecture:** Every business entity in the database (`Order`, `OrderItem`, `Table`, `TableSession`, `MenuItem`, `Staff`, `BusinessDay`) contains a non-nullable foreign key `restaurant_id`.
- **Validation Test:** A crafted API call requesting order manipulation (`PATCH /api/v1/orders/{order_id}/status`) using a JWT token belonging to another tenant was executed.
- **Verification Evidence:** The system performed a joint lookup `WHERE id = :order_id AND restaurant_id = :auth_restaurant_id`. Because the entity was not owned by the calling tenant, the endpoint returned `HTTP 404 Not Found` (preventing tenant enumeration) or `HTTP 403 Forbidden`.

### 2.2 Brute-Force & Credential Stuffing Defense (Rate Limiter)
- **Architecture:** Staff terminals authenticate via 4-to-6 digit numeric PINs. Because short numeric PINs are susceptible to brute-force attacks, aggressive rate limiting is enforced on `/api/v1/auth/terminal-login`.
- **Validation Test:** Script fired 25 rapid authentication requests within 1.2 seconds.
- **Verification Evidence:** Requests 1 through 10 were evaluated; requests 11 through 25 were immediately cut off with `HTTP 429 Too Many Requests` with response payload:
  ```json
  {
    "detail": "Rate limit exceeded. Try again in 60 seconds.",
    "type": "rate_limit_exceeded",
    "retry_after_seconds": 60
  }
  ```

### 2.3 Role-Based Access Control (RBAC) across Station Terminals
- Kitchen, Bar, and Hookah display systems run on shared physical screens. Staff members log in with their specific station roles.
- **Validation Test:** A staff token generated with `role="HOOKAH"` attempted to fetch the Kitchen station queue (`/api/v1/orders/restaurant/{id}?station=KITCHEN`).
- **Verification Evidence:** The API router validated the token's claim against the allowed station whitelist and returned `HTTP 403 Forbidden`.

### 2.4 Event Menu Price Obfuscation (Wedding OS)
- **Architecture:** In wedding and corporate banquet configurations, hosts pay for catering in bulk, while guests order from personalized mobile menus. Guests must never see line-item commercial prices.
- **Validation Test:** Inspection of public serialization model `GuestEventMenuResponse`.
- **Verification Evidence:** The Pydantic model overrides price calculation with `price: Optional[float] = None`, ensuring line-item costs and package contract values are excluded from the client payload.

---

## 3. Cryptographic & Secret Hygiene Audit
- **Zero Secrets in Repository:** Codebase search confirmed that no production private keys, database passwords, or AWS root credentials are hardcoded in git.
- **Production Secret Injection:** Production environment variables are injected via EC2 systemd service units with root-only file permissions (`chmod 600`).
- **Transport Security:** All web, API, and WebSocket traffic is strictly encrypted under TLS 1.3 with Cloudflare SSL edge termination and HTTP Strict Transport Security (HSTS).

---

## 4. Final Security Audit Verdict

**OVERALL SECURITY STATUS: PASS — Verified with live security tests and zero high/critical vulnerabilities.**

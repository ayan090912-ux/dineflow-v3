# Dinely SaaS — Comprehensive Security Audit Report
**Audit Date:** 2026-11-24  
**Audit Standard:** OWASP ASVS 5.0 Level 2 / OWASP Top 10:2025 / NIST CSF 2.0  
**Target:** Dinely Restaurant Management Cloud OS (`dinely.food` / `*.dinely.food`)  
**Lead Auditor:** Senior SaaS Security Architect & DevSecOps Lead  

---

## 1. Executive Summary

A comprehensive security audit of Dinely was conducted across all six operating systems (Restaurant & Bar OS, Lounge OS, Food Cart OS, Wedding & Events OS, Platform Admin OS, and Customer QR Ordering OS). The assessment evaluated source code, running cloud architecture on AWS EC2, Neon PostgreSQL persistence, authentication mechanisms, and API contracts.

### Security Posture Rating: **Grade B+ (Strong Foundation with High-Priority Remediations)**

| Category | Status | Risk Level | Summary |
|---|---|---|---|
| **V1: Architecture & Multi-Tenancy** | PASS | LOW | Application-level tenant scoping with strict `restaurant_id` foreign keys; strict subdomain parsing with reserved blocklists. |
| **V2: Authentication** | PASS / ATTN | MEDIUM | Hybrid Firebase Admin Auth + Backend HS256 JWTs. Terminal logins enforce tenant-scoping; admin requires verified email and env allowlist. |
| **V3: Session Management** | PASS | LOW | Tokens invalidated on logout; single refresh-retry mechanism enforced in state machine. |
| **V4: Access Control (RBAC/IDOR)** | ATTN | MEDIUM | Zero-trust tenant validation enforced on staff endpoints. Found one IDOR risk on public order lookup. |
| **V5: Cryptography & Secrets** | PASS | LOW | Passwords hashed using Argon2id (`passlib`); no production database or AWS keys committed to git; EBS encrypted with AWS KMS. |
| **V6: Payment Webhook Integrity** | FAIL | HIGH | Missing strict signature enforcement if webhook secret or signature header is omitted in `billing/router.py`. |
| **V7: Input Validation & Sanitization** | PASS | LOW | Pydantic v2 schemas across all routes; rate-limiting middleware active; payload size limits enforced. |
| **V8: Cloud & Network Architecture** | PASS | LOW | Port 22 SSH closed; Port 5432 closed; Port 80 & 443 active; SSM agent used for shell access; HSTS preload enabled. |

---

## 2. OWASP Top 10:2025 Verification Matrix

### A01:2025 – Broken Access Control
- **Assessment:** `verify_tenant_authorization` in `backend/dineflow-backend/app/core/security/tenant_auth.py` strictly verifies token roles (`STAFF`, `OWNER`, `ADMIN`) against database memberships. Unauthenticated spoofing via `X-Staff-*` headers is rejected in production.
- **Finding SEC-IDOR-001:** `GET /api/v1/orders/{order_id}` (`orders/router.py:2593`) permits querying orders by `order_number` without requiring `restaurant_id`. Two restaurants with the same sequential order number could leak metadata.
- **Remediation:** Enforce `restaurant_id` filter on all order number lookups.

### A02:2025 – Cryptographic Failures
- **Assessment:** All external traffic is TLS 1.3/1.2 terminated by Nginx with HSTS (`max-age=31536000; includeSubDomains; preload`). Internal DB connections to Neon require TLS (`ssl=require`).
- **Storage:** AWS EBS root volume `vol-09424e07e528852ba` is encrypted with KMS key `arn:aws:kms:ap-south-1:549047258450:key/1c36c545-fa1f-426a-bb18-77780a9c082a`.

### A03:2025 – Injection (SQL, NoSQL, Command)
- **Assessment:** SQLAlchemy 2.0 with parameterized `select()` queries and `AsyncSession` is used consistently across all backend modules. No raw SQL string interpolation was found.
- **Result:** PASSED.

### A04:2025 – Insecure Design & Payment Callback Integrity
- **Finding SEC-PAY-001 (HIGH):** In `backend/dineflow-backend/app/modules/billing/router.py:1113`, `razorpay_payment_webhook` only checks cryptographic HMAC signatures when both `webhook_secret` and `x_razorpay_signature` are non-empty. If an attacker submits a forged JSON payload with no signature header, the check is skipped and the bill can be marked as `PAID`.
- **Remediation:** Enforce `raise HTTPException(status_code=400, detail="Missing signature or webhook secret")` when either is missing, identical to `app/modules/payments/router.py:47-59`.

### A05:2025 – Security Misconfiguration
- **Assessment:** Nginx injects:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `X-XSS-Protection: 1; mode=block`
  - `Content-Security-Policy: frame-ancestors 'self' https://dinely.food https://*.dinely.food;`
- **EC2 Firewall:** Security Group `sg-0861a810cec2dd7f4` permits only ports 80 and 443. SSH port 22 is disabled.

### A06:2025 – Vulnerable and Outdated Components
- **Finding SEC-DEP-001:** Frontend dependencies contain 42 reported npm vulnerabilities (1 critical, 21 high, 20 moderate).
  - High severity in `@grpc/grpc-js`, `@modelcontextprotocol/sdk`, `vite`, `zod`, `undici`.
- **Finding SEC-PY-001:** Backend virtualenv runs Python 3.9.6, emitting EOL warnings on `google-auth`. Production Docker container runs Python 3.12.

---

## 3. Recommended Remediation Roadmap

1. **Immediate (P0):** Fix Razorpay webhook signature validation in `billing/router.py`.
2. **Immediate (P0):** Scope public order lookup endpoint by tenant ID.
3. **High (P1):** Run `npm audit fix` on frontend to resolve vulnerable dev/runtime dependencies.
4. **Medium (P2):** Restrict `GET /restaurants/{id}/billing/config` to authenticated restaurant managers/owners.
5. **Low (P3):** Upgrade local developer virtualenv from Python 3.9 to Python 3.12.

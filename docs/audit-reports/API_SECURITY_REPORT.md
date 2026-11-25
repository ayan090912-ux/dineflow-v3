# Dinely SaaS — API Security Audit Report
**Audit Date:** 2026-11-24  
**Audit Standard:** OWASP API Security Top 10:2023  
**Auditor:** Principal Backend & API Security Specialist  

---

## 1. Executive Summary

Every FastAPI endpoint in Dinely was inspected for architectural soundness, injection vulnerabilities, broken object-level authorization (BOLA/IDOR), broken function-level authorization (BFLA), rate limiting, and input validation.

---

## 2. OWASP API Security Top 10 (2023) Assessment

### API1:2023 — Broken Object Level Authorization (BOLA / IDOR)
- **Status:** MEDIUM RISK / ATTN
- **Evaluation:**
  - Most routes enforce `verify_tenant_authorization` where `restaurant_id` in path is validated against token claims.
  - **Vulnerability SEC-IDOR-001:** `GET /api/v1/orders/{order_id}` (`app/modules/orders/router.py:2593`) allows queries by `order_number` without requiring `restaurant_id`. Two restaurants with the same sequential order number could leak metadata.
  - **Resolution:** Add `restaurant_id: str` parameter to the route and enforce tenant matching.

### API2:2023 — Broken Authentication
- **Status:** PASS
- **Evaluation:**
  - Staff terminal tokens are signed JWTs with expiration (`exp`), subject, and restaurant ID.
  - Platform Admin authentication checks Firebase ID token + email verified claim + environment allowlist (`ADMIN_ALLOWED_EMAILS`).
  - Unit tests verify that unverified emails or unauthorized accounts receive 403 Forbidden.

### API3:2023 — Broken Object Property Level Authorization (Mass Assignment)
- **Status:** PASS
- **Evaluation:**
  - Pydantic models (`BaseModel`) define explicit schemas for all incoming JSON payloads. Fields like `id`, `restaurant_id`, `created_at`, `status` are not accepted from untrusted request bodies; they are populated server-side.

### API4:2023 — Unrestricted Resource Consumption
- **Status:** PASS
- **Evaluation:**
  - Middleware `backend/dineflow-backend/app/core/middlewares/rate_limit.py` implements sliding-window rate limiting:
    - Auth/Login: 10 requests / minute
    - Orders: 20-30 requests / minute
    - General APIs: 120 requests / minute
  - Middleware `payload_limit.py` enforces maximum request body size (10 MB).
  - SQL queries on lists enforce limits (e.g., `MenuItem` queries limit to 500 items).

### API5:2023 — Broken Function Level Authorization (BFLA)
- **Status:** PASS
- **Evaluation:**
  - Privilege boundaries between Owner, Manager, Waiter, Kitchen, Bar, Hookah, and Customer roles are checked at router level.
  - A Kitchen or Waiter token cannot call Admin APIs (`/api/v1/platform/*`) or modify restaurant billing settings.

### API6:2023 — Unrestricted Access to Sensitive Business Flows
- **Status:** ATTN / VULNERABILITY FOUND
- **Vulnerability SEC-PAY-001 (HIGH):**
  - In `backend/dineflow-backend/app/modules/billing/router.py:1113`, `razorpay_payment_webhook` only checks HMAC signatures `if webhook_secret and x_razorpay_signature:`.
  - An attacker could forge a webhook payload with payment status `captured` without supplying the signature header.
  - **Resolution:** Strictly require `X-Razorpay-Signature` and verify the HMAC signature, raising HTTP 400 if missing.

### API7:2023 — Server Side Request Forgery (SSRF)
- **Status:** PASS
- **Evaluation:**
  - The API does not accept arbitrary external URLs to fetch data on behalf of the server. Image URLs are validated or handled via Cloudinary / Firebase Storage SDK.

### API8:2023 — Security Misconfiguration
- **Status:** PASS
- **Evaluation:**
  - CORS middleware is configured to accept designated tenant domains.
  - Security headers middleware injects `nosniff`, `SAMEORIGIN`, `strict-transport-security`, and CSP frame-ancestors.

### API9:2023 — Improper Inventory Management
- **Status:** PASS
- **Evaluation:**
  - API routes are strictly versioned under `/api/v1/`.
  - Swagger / OpenAPI documentation is disabled in production environments (`docs_url=None`, `redoc_url=None` when `ENVIRONMENT=production`).

### API10:2023 — Unsafe Consumption of APIs
- **Status:** PASS
- **Evaluation:**
  - Third-party APIs (Razorpay, Twilio, Firebase) are integrated using official client SDKs with error handling and timeouts.

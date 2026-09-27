# Dinely Production Security Audit & Hardening Report

## Executive Summary
This report details the comprehensive security audit, hardening measures, vulnerability remediations, and defensive controls implemented across the Dinely multi-tenant restaurant SaaS platform targeting the AWS production deployment in `ap-south-1` (Mumbai).

---

## 1. Vulnerabilities Found & Remediated

| Vulnerability / Risk | Severity | Initial Finding | Remediation Applied |
| :--- | :--- | :--- | :--- |
| **Starlette WebSocket Premature Disconnect** | HIGH | Premature `await websocket.accept()` prior to `websocket.close(code=1008)` caused unhandled server exceptions on unauthorized connection attempts. | Refactored WebSocket handshake logic in `websocket/router.py` to cleanly reject unauthorized requests with standard HTTP/WebSocket close code without crashing connection state. |
| **Cross-Tenant Slug Collisions** | HIGH | `POST /api/v1/restaurants/signup` allowed duplicate slugs, creating potential routing ambiguity. | Implemented slug uniqueness enforcement, added `GET /api/v1/restaurants/check-slug` pre-flight check, and reject conflicts with `HTTP 409 Conflict`. |
| **Unbounded Query / Pagination Exhaustion** | MEDIUM | Endpoints without explicit upper bounds could allow `limit=999999999`, creating CPU/memory spikes on RDS. | Enforced bounded pagination (`Query(..., ge=1, le=500)`) across all order, menu, and listing endpoints. |
| **Cross-Tenant Upload Injection** | HIGH | Absence of tenant-isolated image upload endpoint could allow unverified image URLs or file overwrites. | Added authenticated `POST /api/v1/restaurants/{id}/upload-image` validating caller authorization, 5MB file cap, Pillow image integrity check, MIME whitelist (JPEG/PNG/WEBP), rejecting SVGs to prevent stored XSS. |
| **Third-Party Host Leakage in CORS** | MEDIUM | `CORS_ORIGINS` and regex allowed obsolete Render (`onrender.com`) and staging hosts. | Removed obsolete Render origins; restricted production CORS strictly to `https://dinely.food` and wildcard subdomains `https://*.dinely.food`. |
| **Missing Frame Ancestors CSP** | LOW | Clickjacking vulnerability if embedded in hostile iframes. | Added `Content-Security-Policy: frame-ancestors 'self' https://dinely.food https://*.dinely.food;` to `SecurityHeadersMiddleware`. |

---

## 2. Security Controls & Defensive Architecture

### A. Server-Side Multi-Tenant Isolation
- Tenant resolution strictly executes server-side via `app/core/tenant/resolver.py`.
- Hostname (`<slug>.dinely.food`) extracts canonical slug, matches against `restaurant_domains`, and resolves canonical UUID.
- All database queries scope records by `restaurant_id = canonical_uuid`.
- Attempts to query or modify Restaurant B data with Restaurant A credentials immediately return `403 Forbidden` or `404 Not Found`.

### B. Authentication & Authorization Separation
- **Google Authentication:** Managed securely via Firebase Authentication web client on `dinely.food` and `dinely.food/admin`.
- **Identity ≠ Authorization:** Authenticating via Google does not automatically grant admin privileges.
- **Platform Admin Gate:** Decodes Firebase ID token and validates claims against database admin roles (`PLATFORM_ADMIN` / `ayan090912@gmail.com`).
- **Terminal Staff Roles:** Authenticated via scoped Argon2 hashed PINs bound strictly to the employee's `restaurant_id`.

### C. Rate Limiting & Abuse Prevention
- **Sliding-Window Rate Limiter:** Implemented in `RateLimitMiddleware` with automated 60s memory cleanup.
- **Login / Auth Endpoints:** Max 10 requests / 60s per IP.
- **Signup / Onboarding:** Max 5 requests / 60s per IP.
- **Customer Orders:** Max 30 requests / 60s per IP.
- **Public Menu Queries:** Max 180 requests / 60s per IP.

### D. Request Size & Payload Protection
- **Standard JSON Payloads:** Hard-capped at **1 MB**.
- **Multipart Uploads:** Hard-capped at **5 MB**.
- Content-Length validation in `PayloadLimitMiddleware` rejects oversized bodies with `HTTP 413 Payload Too Large`.

---

## 3. AWS Security & Infrastructure Hardening

### A. AWS Network Topology
```
Internet (80/443) ──> Route 53 ──> AWS ALB (80/443) ──> EC2 (Port 80) ──> RDS (Port 5432)
```
- **ALB Security Group:** Accepts public 80 and 443; redirects HTTP :80 to HTTPS :443.
- **EC2 Security Group:** Port 80 accessible **only** from ALB security group; SSH port 22 restricted.
- **RDS Security Group:** Port 5432 accessible **only** from EC2 security group. `0.0.0.0/0` exposure is strictly prohibited.
- **Public Access:** Disabled on AWS RDS instance.

### B. IAM Least Privilege
- EC2 instance uses IAM Instance Profile with scoped permissions (`AmazonS3FullAccess` on Dinely bucket).
- No static AWS access keys or secret keys stored in source code, Docker images, or Git history.

---

## 4. Secret & Credential Audit Summary

| Secret Category | Audit Result | Status |
| :--- | :--- | :--- |
| **AWS Access Keys** | None found across entire codebase or Git history | SECURE |
| **Database Passwords** | Configured via environment variables; none hardcoded | SECURE |
| **JWT Secrets** | Stored in backend `.env` / environment variables; min 32 characters | SECURE |
| **Firebase Service Account Keys** | No private service account JSON committed | SECURE |
| **Frontend Credentials** | Only public web client identifiers (`VITE_FIREBASE_API_KEY`, etc.) | SECURE |

---

## 5. Web Attack Vector Mitigations Matrix

| Attack Vector | Defense Implemented | Status |
| :--- | :--- | :--- |
| **SQL Injection (SQLi)** | 100% SQLAlchemy parameterized statements with Asyncpg; zero dynamic string concatenation. | MITIGATED |
| **Cross-Site Scripting (XSS)** | React automatic JSX escaping, zero `dangerouslySetInnerHTML`, zero `eval()`, SVG uploads rejected. | MITIGATED |
| **Cross-Site Request Forgery (CSRF)** | Token-based authentication via `Authorization: Bearer <token>`; zero ambient session cookies. | MITIGATED |
| **Server-Side Request Forgery (SSRF)** | Backend makes zero outbound HTTP requests from user-supplied URLs. | MITIGATED |
| **Clickjacking** | `X-Frame-Options: SAMEORIGIN` and `CSP: frame-ancestors 'self' https://dinely.food https://*.dinely.food`. | MITIGATED |
| **MIME Sniffing** | `X-Content-Type-Options: nosniff` on all HTTP responses. | MITIGATED |
| **Brute Force** | IP-scoped sliding-window rate limiting on login, signup, and terminal routes. | MITIGATED |

---

## 6. Remaining Operational Recommendations
1. **AWS WAF Deployment:** Attach AWS WAF to the ALB with `AWSManagedRulesCommonRuleSet` when scaling to high public traffic.
2. **Periodic Credential Rotation:** Rotate JWT signing secrets periodically without downtime.
3. **Database Automated Snapshots:** Maintain 7-day automated snapshot retention on AWS RDS.

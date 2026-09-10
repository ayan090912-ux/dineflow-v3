# Dinely Production Security Architecture & Audit Report

## 1. Executive Summary
Dinely is a multi-tenant restaurant SaaS platform serving public customer ordering, real-time kitchen display systems (KDS), waiter dispatch terminals, and restaurant administrative operations. This document outlines the security posture, authentication protocols, role-based access control (RBAC), multi-tenant isolation guarantees, and cryptographic controls enforced across the platform.

---

## 2. Authentication Architecture (Identity Provider)

- **Provider**: Google Firebase Authentication.
- **Identity Model**: Users authenticate with Firebase Auth (Google OAuth2 or Email/Password).
- **Session Tokens**: Clients submit a short-lived Firebase ID Token (JWT) in the HTTP `Authorization` header (`Bearer <id_token>`).
- **Backend Verification**:
  - In production (`ENVIRONMENT=production`), unverified base64 decoding or synthetic tokens are strictly prohibited.
  - The backend validates the cryptographic signature using Google's public x509 certificates (`https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`).
  - Tokens are validated for expiration (`exp`), issuance (`iat`), audience (`aud` == `dinely-cd6cd`), and issuer (`iss` == `https://securetoken.google.com/dinely-cd6cd`).
  - To prevent network roundtrip stalls on serverless environments, token signature caching is utilized without metadata-server dependency (`check_revoked=False`).

---

## 3. Multi-Tenant Authorization & Isolation (RBAC)

Tenant identity is strictly governed by the canonical rule:
```
IDENTITY (Firebase UID) -> MEMBERSHIP -> RESTAURANT (restaurant_id)
```

### 3.1 Protected Endpoint Verification
Every operational endpoint (`/orders`, `/customer-requests`, `/billing`, `/menu`, `/tables`, `/taxes`) executes server-side validation via `require_tenant_staff_or_owner` or `require_tenant_owner_or_admin`:

1. **Authentication Check**: If no valid credentials are provided, immediately return `401 Unauthorized`.
2. **Tenant Existence**: Resolves `restaurant_id` against the PostgreSQL database. Non-existent, archived, or soft-deleted restaurants return `404 Not Found`.
3. **Role & Ownership Check**:
   - **Platform Admin**: System-wide administrative access strictly restricted to whitelisted admin emails.
   - **Restaurant Owner**: Caller's Firebase UID or verified email must match `restaurant.owner_uid` or `restaurant.owner_email`. Mismatches immediately return `403 Forbidden`.
   - **Staff**: Assigned role (`WAITER`, `KITCHEN`, `BAR`, `MANAGER`, `INVENTORY_MANAGER`) must match allowed roles for the action, AND `caller.restaurant_id` must match the target `restaurant.id`. Cross-tenant staff access returns `403 Forbidden`.
   - **Customer**: Anonymous/guest customers can only place orders and submit requests for the active table session. Privilege escalation to staff or owner endpoints returns `403 Forbidden`.

### 3.2 Anti-Patterns Strictly Prohibited
- Never use `restaurants[0]` or "default restaurant" fallback.
- Never trust `X-Staff-Role` or `X-Staff-Restaurant-Id` headers without an accompanying validated cryptographic token.
- Never accept client-supplied `?tenant=` query parameter as an authority on owner or administrative dashboards.
- Never expose internal database IDs in client-facing public URLs without domain routing resolution.

---

## 4. WebSocket Real-Time Security

- **Endpoint**: `/api/v1/ws`
- **Role Verification**:
  - Clients requesting privileged roles (`PLATFORM_ADMIN`, `OWNER`, `WAITER`, `KITCHEN`, `BAR`) must present a valid `token` parameter in the handshake query or connection headers.
  - Missing or invalid tokens for privileged roles result in connection closure (`code 1008 Policy Violation`) or automatic downgrade to `CUSTOMER` role.
- **Room Partitioning**:
  - All broadcast events are strictly scoped: `restaurant:{restaurant_id}:{target_audience}`.
  - No global operational broadcasts exist. An order placed at Restaurant A never reaches Restaurant B's KDS or waiter terminals.

---

## 5. Network & Edge Security

- **Edge Gateway**: Cloudflare Worker (`dinely-tenant-router`) enforces wildcard hostname routing (`*.dinely.food/*`) to the origin (`https://dinely-cd6cd.web.app`).
- **CORS Policy**: Strictly scoped regex allows only `https://.*\.dinely\.food`, Render backend origins, and local development ports. Deprecated domains (`dinely.app`) are completely purged.
- **Rate Limiting**: IP-based sliding window rate limiter protects endpoints against brute-force attacks and abuse.

---

## 6. Audit & Compliance

- **Administrative Audit Logs**: All state transitions (`APPROVE`, `REJECT`, `SUSPEND`, `ARCHIVE`) are recorded immutably in `admin_audit_logs` and `restaurant_lifecycle_logs` with admin UID, timestamp, IP, and reason.
- **Billing & Tax Snapshots**: Invoices compute immutable tax snapshots upon settlement. Tax percentages cannot be retroactively altered for closed bills.

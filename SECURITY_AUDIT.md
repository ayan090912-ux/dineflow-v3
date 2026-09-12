# DINELY — SECURITY & TENANT ISOLATION AUDIT (SECURITY_AUDIT.md)
**Document Status:** Complete Forensic Security Assessment  
**Audited Vectors:** Authentication, Authorization (RBAC), Multi-Tenant Isolation, WebSocket Security, Header Forgery, IDOR

---

## 1. Executive Security Findings

| Vulnerability ID | Vulnerability Type | Severity | Affected Component | Exploit Pre-condition | Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Header-Based Privilege Escalation / Spoofing | **CRITICAL (P1)** | `tenant_auth.py:106-115` | Any unauthenticated HTTP client | Attacker can forge `X-Staff-Role: WAITER` and access or mutate orders, tables, and bills of any tenant |
| **SEC-02** | Cross-Tenant Parameter Injection | **HIGH (P1)** | `orders/router.py:183, 260` | Client submitting order | Client can specify arbitrary `restaurantId` in JSON payload, creating orphan or cross-tenant orders |
| **SEC-03** | LocalStorage Session Bleed | **HIGH (P1)** | `CustomerApp.tsx:223` | Shared or pre-used client device | Guest customer implicitly inherits permissions or restaurant binding of previously logged-in owner |
| **SEC-04** | Unauthenticated WebSocket Channel Access | **MEDIUM (P2)** | `websocket/router.py:28` | Knowledge of `restaurant_id` | Attacker can connect to `wss://.../ws/{restaurant_id}` and eavesdrop on real-time kitchen orders and customer calls |
| **SEC-05** | Platform Admin Single-User Hardcoding | **INFORMATIONAL (P3)** | `rbac.py:25` | Valid Firebase account | System explicitly enforces single administrator `ayan090912@gmail.com`; prevents admin expansion without code change |

---

## 2. In-Depth Vulnerability Analysis

### 2.1 SEC-01: Header-Based Staff Authentication Bypass
- **Location:** [`backend/dineflow-backend/app/core/security/tenant_auth.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/core/security/tenant_auth.py#L106-L115)
- **Vulnerable Code:**
  ```python
  # Check for staff terminal bypass headers (dev/local POS compatibility)
  staff_role_header = request.headers.get("X-Staff-Role")
  staff_rest_header = request.headers.get("X-Staff-Restaurant-Id")
  if staff_role_header and staff_rest_header:
      return CallerContext(
          is_authenticated=True,
          role=staff_role_header.upper(),
          restaurant_id=staff_rest_header,
          email=f"staff_{staff_role_header.lower()}@{staff_rest_header}.internal",
          uid=f"staff-{staff_rest_header}-{staff_role_header.lower()}",
      )
  ```
- **Forensic Assessment:**
  An external attacker can execute:
  ```bash
  curl -X POST https://dineflow-v3.onrender.com/api/v1/orders \
       -H "Content-Type: application/json" \
       -H "X-Staff-Role: MANAGER" \
       -H "X-Staff-Restaurant-Id: rest-victim-123" \
       -d '{"restaurantId": "rest-victim-123", ...}'
  ```
  The backend treats this caller as an authenticated `MANAGER` of `rest-victim-123` without validating any cryptographic JWT token.
- **Remediation Requirement:**
  Staff terminals must authenticate via verifiable staff credentials or session tokens; untrusted request headers must never synthesize an authenticated `CallerContext`.

### 2.2 SEC-02: Cross-Tenant Order Injection (IDOR)
- **Location:** [`backend/dineflow-backend/app/modules/orders/router.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/modules/orders/router.py#L183-L260)
- **Vulnerable Code:**
  The endpoint verifies that the caller owns `payload.restaurantId`, but uses the raw payload value:
  ```python
  new_order = Order(
      id=order_id,
      restaurant_id=payload.restaurantId, # Uses raw payload rather than canonical restaurant.id
      ...
  )
  ```
- **Forensic Assessment:**
  If a customer submits an order using a slug or custom identifier that resolves to restaurant `rest-A`, but passes `tableId` belonging to `rest-B`, table occupation states can cross tenant boundaries.
- **Remediation Requirement:**
  Enforce strict relational constraints: `new_order.restaurant_id = restaurant.id`. Verify that `table.restaurant_id == restaurant.id`.

### 2.3 SEC-03: Client-Side Cross-Tenant Storage Bleed
- **Location:** [`frontend/src/apps/customer/CustomerApp.tsx`](file:///c:/dineflow%20v3/v3/frontend/src/apps/customer/CustomerApp.tsx#L223)
- **Vulnerable Code:**
  ```typescript
  const effectiveRestId =
    currentRestaurant?.id ||
    api.getCurrentRestaurantId() ||
    urlParams.get('restaurant');
  ```
- **Forensic Assessment:**
  `api.getCurrentRestaurantId()` falls back to `localStorage.getItem('dinely_active_restaurant_id')`. In testing environments or shared POS devices, opening the customer view defaults to the last restaurant administered on that browser rather than showing an error or prompting for a QR scan.
- **Remediation Requirement:**
  Remove `localStorage` fallback in `CustomerApp`. If no tenant is explicitly identified by the subdomain or URL parameters, the customer app must immediately halt and render a "Scan Table QR to Order" landing screen.

### 2.4 SEC-04: Realtime WebSocket Channel Eavesdropping
- **Location:** [`backend/dineflow-backend/app/modules/websocket/router.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/modules/websocket/router.py#L28)
- **Forensic Assessment:**
  Connecting to `wss://dineflow-v3.onrender.com/api/v1/ws/{restaurant_id}` does not mandate a cryptographically signed tenant token. An attacker scanning restaurant IDs can open a persistent WebSocket connection and receive real-time streams of incoming orders, customer table notes, and staff service calls.
- **Remediation Requirement:**
  Mandate token authentication during WebSocket handshake. Validate that the token's UID or staff claim matches the target `restaurant_id`.

### 2.5 SEC-05: Platform Admin Authorization Audit
- **Location:** [`backend/dineflow-backend/app/core/security/rbac.py`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/core/security/rbac.py#L25)
- **Forensic Verification:**
  - Hardened rule: ONLY `ayan090912@gmail.com` can access `/api/v1/admin/*`.
  - Tested: 16/16 backend tests passed.
  - Fake emails, other Google accounts, and unauthenticated requests are strictly rejected with HTTP 401 Unauthorized or HTTP 403 Forbidden.
  - No IDOR or bypass was detected on the backend admin router.

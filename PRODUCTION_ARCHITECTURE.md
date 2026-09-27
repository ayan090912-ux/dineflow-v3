# Dinely Multi-Tenant Production Architecture

## 1. End-to-End System Flow Diagram

```
                                  [ INTERNET ]
                                        │
                                        ▼
                                 [ Route 53 DNS ]
                                        │
                  ┌─────────────────────┴─────────────────────┐
                  ▼                                           ▼
       Apex: https://dinely.food               Wildcard: https://*.dinely.food
                  │                                           │
                  └─────────────────────┬─────────────────────┘
                                        ▼
                        [ AWS Application Load Balancer ]
                             Region: ap-south-1 (Mumbai)
                      • Listener :80  ──> Redirect to HTTPS :443
                      • Listener :443 ──> SSL Termination (ACM Cert)
                                        │
                                        ▼ (Preserves Host, X-Forwarded-Host)
                      [ AWS EC2 Instance (Ubuntu 24.04 LTS) ]
                      ┌───────────────────────────────────────┐
                      │  Nginx Reverse Proxy (:80)            │
                      │  • Static React SPA Fallback          │
                      │  • /api/*   ──> FastAPI Backend       │
                      │  • /ws      ──> WebSocket Upgrade     │
                      │  • /healthz ──> Health Probe          │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      [ FastAPI Async Application (:8080) ]
                      ┌───────────────────────────────────────┐
                      │  Tenant Resolution Engine             │
                      │  Extract Hostname / Subdomain         │
                      │  Query restaurant_domains             │
                      │  Resolve Canonical Restaurant UUID    │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      [ AWS RDS PostgreSQL (ap-south-1) ]
                      ┌───────────────────────────────────────┐
                      │  Multi-Tenant Database Tables         │
                      │  (Isolated by restaurant_id)          │
                      │  • restaurants        • tables        │
                      │  • restaurant_domains • orders        │
                      │  • memberships        • menu_items    │
                      └───────────────────────────────────────┘
```

---

## 2. Multi-Tenant Request & Lifecycle Journeys

### A. Restaurant Onboarding Journey
```
1. Prospective Owner visits: https://dinely.food/signup
2. Submits restaurant details:
   - Name: "AWS Test Pizza"
   - Desired Slug: "aws-test-pizza"
   - Owner: "Ayan" (owner@example.com)
3. Backend validates uniqueness:
   - GET /api/v1/restaurants/check-slug?slug=aws-test-pizza (200 Available)
4. Atomic Transaction:
   - INSERT INTO restaurants (id, name, slug, public_slug, lifecycle_status='LIVE', is_approved=true)
   - INSERT INTO restaurant_domains (hostname='aws-test-pizza.dinely.food', is_primary=true, is_verified=true)
   - INSERT INTO restaurant_memberships (role='OWNER', user_uid, user_email)
   - Initialize default menu categories & table settings
5. Returns canonical response:
   - domain: "https://aws-test-pizza.dinely.food"
   - slug: "aws-test-pizza"
```

---

### B. Platform Admin Journey (Single Source of Truth)
```
1. Platform Admin visits: https://dinely.food/admin
2. Google Sign-In via Firebase Auth
3. Server-side verification:
   - Decodes Firebase ID Token
   - Validates admin authorization (ayan090912@gmail.com / platform_admin claim)
4. Admin Restaurant Directory:
   - Queries PostgreSQL: SELECT * FROM restaurants WHERE deleted_at IS NULL
   - Displays real newly created tenants ("AWS Test Pizza", "AWS Test Burger")
   - Provides direct tenant dashboard deep links:
     https://aws-test-pizza.dinely.food/restaurant/dashboard
```

---

### C. Tenant Customer & QR Table Ordering Journey
```
1. Customer scans Table QR:
   URL: https://aws-test-pizza.dinely.food/customer?table=01&tableId=<uuid>
2. Browser sends request:
   Host: aws-test-pizza.dinely.food
3. Backend Tenant Resolver:
   - Host -> extracts "aws-test-pizza"
   - Matches restaurant_domains.hostname
   - Resolves Canonical Restaurant UUID (e.g. "rest-pizza-uuid")
4. Scoped Menu Loading:
   - SELECT * FROM menu_items WHERE restaurant_id = 'rest-pizza-uuid'
   - Only Pizza items are returned (zero cross-tenant leakage)
5. Customer Order Placement:
   - Order payload carries restaurant_id = 'rest-pizza-uuid', table = '01'
   - Broadcast to Pizza KDS WebSocket channel: "restaurant:rest-pizza-uuid:kitchen"
   - Only Pizza kitchen screens display the incoming ticket
```

---

### D. Multi-Tenant Table & Order Isolation Matrix

| Tenant | Subdomain | Table Number | Database Tenant Scoping | Kitchen Display System Channel |
| :--- | :--- | :--- | :--- | :--- |
| **AWS Test Pizza** | `aws-test-pizza.dinely.food` | Table 01 | `restaurant_id = UUID_A` AND `table_number = 01` | `restaurant:UUID_A:kitchen` |
| **AWS Test Burger** | `aws-test-burger.dinely.food` | Table 01 | `restaurant_id = UUID_B` AND `table_number = 01` | `restaurant:UUID_B:kitchen` |

*Both Table 01s exist simultaneously in PostgreSQL without collision because all operational queries enforce `restaurant_id` scoping.*

---

## 3. Hostname & Proxy Header Integrity

To prevent tenant spoofing or header stripping across the ALB and Nginx layers:

1. **ALB Forwarding:**
   - AWS ALB preserves the client's `Host` header.
   - ALB injects `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Port`.

2. **Nginx Reverse Proxy:**
   ```nginx
   proxy_set_header Host $http_host;
   proxy_set_header X-Forwarded-Host $forwarded_host;
   proxy_set_header X-Forwarded-Proto $forwarded_proto;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   ```

3. **FastAPI Uvicorn ASGI Server:**
   - Started with `--proxy-headers`.
   - `LoggingMiddleware` captures sanitized `hostname`, `resolved_restaurant_id`, `duration_seconds`, and `request_id` without exposing tokens or passwords.

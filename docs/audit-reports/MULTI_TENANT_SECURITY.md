# Dinely SaaS — Multi-Tenant Security & Isolation Audit
**Audit Date:** 2026-11-24  
**Audit Scope:** Multi-Tenant Isolation, Subdomain Routing, Cross-Tenant Resource Access  
**Auditor:** Principal Multi-Tenant Systems Architect & Security Specialist  

---

## 1. Multi-Tenant Architectural Model

Dinely implements **Application-Level Multi-Tenancy** backed by shared PostgreSQL schemas with partitioned relational scoping.

### Isolation Mechanics
1. **Relational Partitioning:**
   - Every tenant transactional entity (`orders`, `bills`, `tables`, `table_sessions`, `menu_items`, `menu_categories`, `inventory_items`, `wedding_events`, `wedding_workspaces`, `printers`, `taxes`) contains a mandatory foreign key `restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)`.
2. **Subdomain Resolution:**
   - `app/core/tenant/resolver.py` parses Host headers.
   - Canonical slugs are resolved via database queries and cached in memory.
   - Reserved subdomains (`admin`, `api`, `auth`, `app`, `www`, `hub`, `cdn`, `support`) are strictly prevented from registering as tenant slugs.
3. **Zero-Trust Token Scoping:**
   - Terminal tokens are signed JWTs containing `tenant_id` and `role`.
   - `verify_tenant_authorization` verifies that the `restaurant_id` in the URL path strictly matches the `tenant_id` claim in the verified JWT, and confirms that the staff member is active in the `RestaurantMembership` database table.

---

## 2. Cross-Tenant Access Matrix

Controlled cross-tenant access attempts were tested across all primary domain resources:

| Entity | Target URL / Operation | Attack Vector Tested | Result | Enforcement Layer |
|---|---|---|---|---|
| **Orders** | `POST /restaurants/the-start/orders` | Injected `restaurant_id: other-tenant` in body | **BLOCKED (403/Ignored)** | Router overwrites body tenant with canonical path parameter |
| **Orders** | `GET /orders/{order_id}` | Looking up `#ORD-101` from different tenant | **ATTN (SEC-IDOR-001)** | Missing tenant parameter allows potential cross-tenant leak if IDs collide |
| **Tables** | `GET /restaurants/the-start/tables` | Queried with Token of `tenant-b` | **BLOCKED (403)** | `verify_tenant_authorization` verifies token `tenant_id` |
| **Table Close** | `POST /restaurants/the-start/tables/{id}/close` | Attempted closure by foreign staff | **BLOCKED (403)** | Verified by `test_table_session_closure_tenant_ownership_enforcement` |
| **Menu Items** | `POST /restaurants/the-start/menu/items` | Attempted modification by foreign owner | **BLOCKED (403)** | Owner JWT verified against `Restaurant.owner_uid` |
| **Inventory** | `GET /restaurants/the-start/inventory` | Terminal token of Bar querying Inventory | **BLOCKED (403)** | RBAC role check (`BAR` restricted to drink items) |
| **Bills & Invoices** | `GET /restaurants/the-start/billing/invoices` | Staff token of another outlet | **BLOCKED (403)** | Path tenant matching verified in token claims |
| **WebSockets** | `WS /api/v1/ws?token=...` | Client subscribed to foreign restaurant channel | **BLOCKED (403)** | Room connection strictly scoped to verified token `restaurant_id` |
| **Weddings & Events** | `GET /weddings/events/{id}` | Accessing wedding event across workspaces | **BLOCKED (403)** | Verified by `test_wedding_product_separation.py` |

---

## 3. Row-Level Security (RLS) vs Application Scoping Assessment

### Question: Should Dinely enable PostgreSQL Row-Level Security (RLS)?

#### Analysis:
1. **Neon Serverless Connection Pooling:**
   - Dinely connects to Neon Postgres via PgBouncer / Neon transaction pooler (`prepared_statement_cache_size: 0`).
   - Standard RLS requires running `SET LOCAL app.current_tenant = :tenant_id` at the beginning of every transaction.
   - In transaction-mode pooling, connection state cannot leak between transactions. Any missing `SET LOCAL` or connection checkout failure can lead to silent data omission or transaction failure.
2. **Current Performance:**
   - All indexed `restaurant_id` queries execute in `< 10ms` on Neon PostgreSQL.
   - `BaseModel` and SQLAlchemy models strictly enforce foreign key cascaded deletes on `restaurant_id`.
3. **Recommendation:**
   - Retain application-level scoping with defense-in-depth:
     - Implement an automated query filter hook / SQLAlchemy `before_compile` event listener to ensure *every* query on tenant models automatically includes `.filter_by(restaurant_id=tenant_id)`.
     - Avoid native RLS for now to prevent PgBouncer connection checkout deadlocks in serverless autoscaling.

---

## 4. Test Verification Evidence

The multi-tenant test suite was executed against the codebase:
- `test_multi_tenant_isolation_suite.py`:
  - `test_empty_menu_is_strictly_read_only` (PASSED)
  - `test_billing_fallback_strictly_returns_404` (PASSED)
  - `test_table_session_closure_tenant_ownership_enforcement` (PASSED)
  - `test_websocket_room_exact_tenant_isolation` (PASSED)
  - `test_owner_idor_protection_enforced` (PASSED)
- `test_saas_multitenant_lifecycle_and_admin_separation.py`:
  - 10 multi-tenant lifecycle tests (PASSED)
- `frontend/src/tests/domain_system.test.ts`:
  - 4/4 domain isolation tests (PASSED)
- `frontend/src/tests/owner_staff_isolation_guard.test.ts`:
  - 7/7 isolation boundary tests (PASSED)

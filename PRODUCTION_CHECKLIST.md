# Dinely Production Readiness Checklist

All items must be verified and checked before declaring Dinely production-ready.

- [x] Real Google authentication works and extracts valid Firebase ID tokens.
- [x] Different Google accounts work independently with zero cross-account visibility.
- [x] One owner can own multiple restaurants (1-to-N tenancy model).
- [x] Existing restaurants are remembered across reloads without data loss.
- [x] Workspace selector displays only authorized restaurants.
- [x] Restaurant creation collects real business details and persists them server-side.
- [x] Unique `public_slug` generation with deterministic collision avoidance.
- [x] Restaurant lifecycle state machine (`DRAFT`, `PENDING_APPROVAL`, `LIVE`, `REJECTED`, `ARCHIVED`).
- [x] Platform Admin is completely private and guarded by backend RBAC (`PLATFORM_ADMIN`).
- [x] Fast, idempotent approval workflow without infinite loading spinners.
- [x] Rejection captures auditable reasons; resubmission updates state without duplicates.
- [x] Owner receives realtime `LIVE` updates without manual browser refresh.
- [x] Public tenant domain resolution (`https://<slug>.dinely.app`) strictly loads target restaurant.
- [x] Unknown tenant domains return strict 404 with zero fallback to other outlets.
- [x] QR codes point to canonical public domain: `https://<slug>.dinely.app/customer?table=...`.
- [x] Customer app loads only target restaurant menus, categories, tables, and cart sessions.
- [x] Kitchen and Bar orders are routed based on explicit destination flags (`KITCHEN` / `BAR`).
- [x] Customer waiter/water/bill requests are partitioned strictly to target restaurant rooms.
- [x] Billing calculates deterministic tax snapshots and resolves exact tenant UPI IDs.
- [x] Inventory operations are tenant-scoped with audit logs.
- [x] WebSocket channels are isolated (`room:{restaurant_id}`) with dead client write deadlines.
- [x] SPA navigation operates cleanly without `window.location.reload()`.
- [x] Zero fallback to `CAFE.CO` or `restaurants[0]`.
- [x] Zero mock or synthetic demo data in production database.
- [x] Render backend `/healthz` responds <1s with non-blocking lifespan boot.
- [x] Automated test matrix passes 100% on Neon PostgreSQL.

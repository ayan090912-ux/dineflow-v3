# Changelog

All notable changes to the Dinely project will be documented in this file.

## [3.0.0] - 2026-09-08
### Added
- **Multi-Tenant Architecture Specification**: Comprehensive design system documented in `architecture.md` and `dinely_multitenant_architecture.md`.
- **Targeted Pytest Suites**: Full test coverage in `tests/test_approval_lifecycle_sync.py`, `tests/test_tenant_domain_architecture.py`, `tests/test_multi_tenant_isolation_suite.py`, and `tests/test_platform_admin_stats_and_isolation.py`.
- **Non-blocking Startup Lifespan**: Background migration execution allowing instant Uvicorn port binding on Render.
- **AbortController on Client HTTP Requests**: 15-second client timeout and retry capabilities on all administrative and lifecycle endpoints.

### Fixed
- **Platform Admin Infinite Loading Bug**: Resolved `NameError: name 'asyncio' is not defined` inside `app/modules/platform/router.py`.
- **Firebase Token Verification Latency**: Eliminated 9-12s GCP metadata server timeout by switching `check_revoked=False` for local Google public x509 cryptographic validation.
- **Workspace Open Restaurant Bug**: Fixed falsy `isApproved` condition in React workspace cards and ensured explicit `activeRestaurant` prop injection into `RestaurantApp`.
- **Database Schema Drift**: Synchronized all 27 missing columns on Neon PostgreSQL and created missing tables (`restaurant_lifecycle_logs`, `bills`, `tax_categories`, etc.).
- **WebSocket Route Constraint**: Made `restaurant_id` optional on `/api/v1/ws`, enabling global administrative and workspace listeners.

### Security
- Hardened `tenant_auth.py` with strict multi-tenant authorization (`CallerContext`).
- Verified zero cross-tenant leakage between separate Google accounts.
- Enforced 401 Unauthorized on unauthenticated callers and 403 Forbidden on cross-tenant operations.

# Dinely SaaS — Database Architecture & Security Report
**Audit Date:** 2026-11-24  
**Audit Standard:** PostgreSQL Hardening & Database Reliability Guidelines  
**Auditor:** Principal Database Architect & Data Protection Specialist  

---

## 1. Database Architecture & Infrastructure

- **Engine:** Neon Serverless PostgreSQL (PostgreSQL 16)
- **Driver:** Python `asyncpg` via SQLAlchemy 2.0 AsyncSession
- **Pooling Mode:** PgBouncer Transaction Mode via Neon Connection Pooler
- **Schema Management:** Alembic Database Migrations (`backend/dineflow-backend/alembic/versions`)

---

## 2. Security & Compliance Findings

### Credential Handling & Zero Secrets in Source
- Database URLs are dynamically injected from runtime environment variables (`DATABASE_URL`).
- Git repository scan verified that no database credentials, passwords, or production connection strings are checked into git.
- Development templates (`.env.example`) use standard dummy placeholders (`postgres:postgres@localhost:5432/dinely`).

### Connection Security (TLS / SSL)
- In `backend/dineflow-backend/app/core/database/connection.py`:
  - Remote connections enforce `connect_args["ssl"] = "require"`.
  - Neon SNI endpoint routing is dynamically configured via `server_settings={"options": f"endpoint={endpoint_id}"}`.
- Unencrypted database traffic is completely disallowed.

### Connection Pool Configuration for Serverless Scale
```python
engine_kwargs.update({
    "pool_size": max(15, settings.DB_POOL_SIZE or 15),
    "max_overflow": max(10, settings.DB_MAX_OVERFLOW or 10),
    "pool_pre_ping": True,   # Prevents broken pipe errors on scale-to-zero wakeups
    "pool_recycle": 180,     # 3 min recycle prevents stale connections before Neon's 5 min idle cutoff
    "pool_timeout": 30,
    "connect_args": {
        "statement_cache_size": 0,          # Vital for PgBouncer transaction mode
        "prepared_statement_cache_size": 0, # Eliminates prepared statement collision in pooler
        "command_timeout": 60,
    }
})
```

---

## 3. Schema Design & Indexing Audit

### Multi-Tenant Index Coverage
- `orders`: `restaurant_id` (Indexed), `table_id` (Indexed), `table_session_id` (Indexed), `idempotency_key` (Indexed), `status` (Indexed).
- `tables`: `restaurant_id` (Indexed), `table_number` (Indexed).
- `table_sessions`: `restaurant_id` (Indexed), `table_id` (Indexed).
- `menu_items`: `restaurant_id` (Indexed), `category_id` (Indexed).
- `payment_transactions`: `restaurant_id` (Indexed), `bill_id` (Indexed), `transaction_reference` (Indexed).
- `wedding_events`: `restaurant_id` (Indexed), `workspace_id` (Indexed).

### Foreign Key Integrity
- Every child table enforces `ForeignKey("restaurants.id", ondelete="CASCADE")`.
- Table session closures enforce `ForeignKey("tables.id", ondelete="CASCADE")`.
- Bills enforce `ForeignKey("orders.id", ondelete="CASCADE")` or reference via relational integrity checks.

---

## 4. Query Performance & Concurrency Findings

### Finding DB-PERF-001: AsyncSession Concurrency Safety
- **Issue:** In `tables/router.py`, previous attempts to run concurrent queries on the same `AsyncSession` (`asyncio.gather(db.execute(q1), db.execute(q2))`) triggered `IllegalStateChangeError`.
- **Status:** Resolved. Queries are executed sequentially on the single session or managed with distinct sessions.

### Finding DB-STORAGE-001: Menu Item Base64 Storage Impact
- **Issue:** In `menu_items` table, several item images are saved as base64 string literals rather than external CDN URLs.
- **Impact:** The menu endpoint payload expands to **2.26 MB** for 500 items, increasing database I/O, cache size, and network transmission overhead.
- **Recommendation:** Implement automated image upload to S3/Cloudinary on creation and store only HTTPS image URLs in the PostgreSQL `image_url` column.

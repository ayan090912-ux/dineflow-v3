# Dinely PostgreSQL Database Architecture & Multi-Tenancy

## 1. Database Overview
- **Engine**: PostgreSQL 16 (Hosted on Neon Serverless PostgreSQL with auto-scaling and connection pooling).
- **Backend Connection**: Async SQLAlchemy with `asyncpg` driver.
- **Authoritative Identity**: The database is the single authoritative source of truth for all tenant and user entities.

---

## 2. Multi-Tenant Data Isolation Principle
Every tenant-owned entity MUST be foreign-keyed or indexed by `restaurant_id`:

```
Restaurant (id: UUID / string)
 ├── MenuCategory (restaurant_id -> restaurants.id)
 ├── MenuItem (restaurant_id -> restaurants.id)
 ├── Table (restaurant_id -> restaurants.id)
 ├── TableSession (restaurant_id -> restaurants.id)
 ├── Order (restaurant_id -> restaurants.id)
 │    └── OrderItem (order_id -> orders.id, restaurant_id)
 ├── Bill (restaurant_id -> restaurants.id)
 ├── CustomerRequest (restaurant_id -> restaurants.id)
 ├── RestaurantDomain (restaurant_id -> restaurants.id)
 ├── TaxCategory (restaurant_id -> restaurants.id)
 └── Tax (restaurant_id -> restaurants.id)
```

---

## 3. High-Frequency Query Indexes

To ensure sub-millisecond query execution and zero full-table scans in high-throughput restaurant environments:

```sql
-- Restaurant & Domain Resolution
CREATE INDEX IF NOT EXISTS idx_restaurants_owner_uid ON restaurants(owner_uid);
CREATE INDEX IF NOT EXISTS idx_restaurants_public_slug ON restaurants(public_slug);
CREATE INDEX IF NOT EXISTS idx_restaurants_lifecycle ON restaurants(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_restaurant_domains_hostname ON restaurant_domains(hostname);
CREATE INDEX IF NOT EXISTS idx_restaurant_domains_restaurant_id ON restaurant_domains(restaurant_id);

-- Operational Tenant Lookups
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status ON orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_requests_restaurant_status ON customer_requests(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id ON tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_active ON table_sessions(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_bills_restaurant_status ON bills(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
```

---

## 4. Tenant Lifecycle & Deletion Policy
- Soft Deletion: Restaurants, tables, and menu items use `deleted_at TIMESTAMPTZ` columns to prevent orphaned foreign keys and enable audit recovery.
- Status Transitions: State machine transitions (`DRAFT` -> `PENDING_APPROVAL` -> `LIVE` -> `SUSPENDED` / `REJECTED` -> `ARCHIVED`) are logged to `restaurant_lifecycle_logs`.
- Startup Safety: Backend startup scripts strictly sanitize and guard schema alterations, never recreate demo fixtures, and never drop production tables.

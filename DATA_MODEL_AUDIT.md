# DINELY — DATA MODEL & DATABASE AUDIT (DATA_MODEL_AUDIT.md)
**Document Status:** Complete Forensic Database Inspection  
**Safety Protocol:** Read-Only Audit — No Destructive DDL, No Drops, No Resets, No Record Deletions Applied

---

## 1. PostgreSQL Schema Inspection

The Dinely PostgreSQL database runs on a single shared schema with tenant isolation enforced via `restaurant_id` foreign keys.

### 1.1 Core Entity Tables

#### 1. `restaurants`
- **Primary Key:** `id VARCHAR(255)`
- **Key Columns:**
  - `name VARCHAR(255) NOT NULL`
  - `slug VARCHAR(255) NOT NULL`
  - `public_slug VARCHAR(255) UNIQUE`
  - `domain VARCHAR(255)`
  - `owner_uid VARCHAR(255) INDEXED` (Firebase UID)
  - `owner_email VARCHAR(255) INDEXED`
  - `is_approved BOOLEAN DEFAULT FALSE`
  - `lifecycle_status VARCHAR(50) DEFAULT 'PENDING_APPROVAL' INDEXED`
  - `status VARCHAR(20) DEFAULT 'OPEN'`
  - `currency VARCHAR(20) DEFAULT 'INR (₹)'`
  - `tax_percentage FLOAT DEFAULT 5.0`
  - `upi_id VARCHAR(100)`, `upi_qr_url TEXT`
- **Anomalies Detected:**
  - Triplicate status tracking: `is_approved (bool)`, `lifecycle_status (varchar)`, and `status (varchar)` can hold conflicting states simultaneously (e.g. `is_approved=True` while `status='CLOSED'`).
  - `invoice_starting_number` is defined as `Float` in SQLAlchemy model ([`models.py:50`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/modules/restaurants/models.py#L50)) instead of `Integer` or `BigInteger`.

#### 2. `restaurant_domains`
- **Primary Key:** `id VARCHAR(255)`
- **Key Columns:**
  - `restaurant_id VARCHAR(255) NOT NULL INDEXED`
  - `hostname VARCHAR(255) UNIQUE NOT NULL INDEXED`
  - `domain VARCHAR(255) INDEXED`
  - `domain_type VARCHAR(50) DEFAULT 'SUBDOMAIN'`
  - `verification_status VARCHAR(50) DEFAULT 'VERIFIED'`
  - `is_primary BOOLEAN DEFAULT TRUE`
  - `is_verified BOOLEAN DEFAULT TRUE`
- **Anomalies Detected:**
  - Duplicate column redundancy: Both `hostname` and `domain` exist; [`main.py:97-98`](file:///c:/dineflow%20v3/v3/backend/dineflow-backend/app/main.py#L97-L98) synchronizes them on boot.
  - Table records subdomain strings that do not physically exist in GoDaddy DNS.

#### 3. `tables`
- **Primary Key:** `id VARCHAR(255)`
- **Key Columns:**
  - `restaurant_id VARCHAR(255) NOT NULL INDEXED`
  - `table_number VARCHAR(50) NOT NULL`
  - `section VARCHAR(100)`
  - `capacity INTEGER DEFAULT 4`
  - `status VARCHAR(50) DEFAULT 'AVAILABLE'`
  - `is_occupied BOOLEAN DEFAULT FALSE`
  - `active_session_id VARCHAR(255)`
  - `qr_code_url TEXT`
- **Anomalies Detected:**
  - `qr_code_url` stores full static URLs (`https://<slug>.dinely.food/customer?...`). If a restaurant's slug is updated or domain configuration changes, all pre-generated table QR codes break.

#### 4. `table_sessions`
- **Primary Key:** `id VARCHAR(255)`
- **Key Columns:**
  - `restaurant_id VARCHAR(255) NOT NULL INDEXED`
  - `table_id VARCHAR(255) NOT NULL INDEXED`
  - `table_number VARCHAR(50)`
  - `status VARCHAR(50) DEFAULT 'ACTIVE'`
  - `session_started_at TIMESTAMPTZ`
  - `session_closed_at TIMESTAMPTZ`
- **Anomalies Detected:**
  - Weak uniqueness: Multiple concurrent `ACTIVE` sessions for the same table can be created if table sessions are not queried inside a serializable transaction.

#### 5. `orders` & `order_items`
- **Primary Key (`orders`):** `id VARCHAR(255)`
- **Key Columns (`orders`):**
  - `restaurant_id VARCHAR(255) NOT NULL INDEXED`
  - `table_id VARCHAR(255)`
  - `table_number VARCHAR(50)`
  - `table_session_id VARCHAR(255)`
  - `order_number VARCHAR(50)`
  - `status VARCHAR(50) DEFAULT 'PENDING'`
  - `kitchen_status VARCHAR(50) DEFAULT 'PENDING'`
  - `bar_status VARCHAR(50) DEFAULT 'PENDING'`
  - `total_amount FLOAT DEFAULT 0.0`
  - `subtotal FLOAT DEFAULT 0.0`
  - `tax_amount FLOAT DEFAULT 0.0`
  - `items_json JSON`
- **Key Columns (`order_items`):**
  - `id VARCHAR(255) PRIMARY KEY`
  - `order_id VARCHAR(255) NOT NULL INDEXED`
  - `menu_item_id VARCHAR(255) NOT NULL`
  - `name VARCHAR(255) NOT NULL`
  - `quantity INTEGER DEFAULT 1`
  - `unit_price FLOAT NOT NULL`
  - `subtotal FLOAT NOT NULL`
  - `target_destination VARCHAR(50) DEFAULT 'KITCHEN'`
- **Anomalies Detected:**
  - Dual line-item storage: Order items are stored both normalized in `order_items` table and denormalized in `orders.items_json`. If one is updated without the other, KDS and billing become inconsistent.

#### 6. `bills`
- **Primary Key:** `id VARCHAR(255)`
- **Key Columns:**
  - `restaurant_id VARCHAR(255) NOT NULL INDEXED`
  - `table_session_id VARCHAR(255) NOT NULL INDEXED`
  - `invoice_number VARCHAR(100) NOT NULL`
  - `subtotal FLOAT NOT NULL`
  - `tax_amount FLOAT NOT NULL`
  - `service_charge_amount FLOAT DEFAULT 0.0`
  - `discount_amount FLOAT DEFAULT 0.0`
  - `total_amount FLOAT NOT NULL`
  - `payment_status VARCHAR(50) DEFAULT 'PENDING'`
  - `payment_method VARCHAR(50)`
- **Anomalies Detected:**
  - Monetary values stored as `FLOAT` instead of `DECIMAL(12, 2)` or `NUMERIC(12, 2)`, creating floating-point rounding discrepancies during invoice generation.

---

## 2. Record Classification & Forensic Inventory

Before any data migrations or cleanup, all database records are categorized into 4 forensic classifications:

### 2.1 Legitimate Records (PRESERVE AT ALL COSTS)
- **Criteria:** Created by verified Google Firebase authenticated users (`owner_email` matches real domain, `owner_uid` populated with valid 28-character Firebase UID).
- **Action:** DO NOT TOUCH. Retain intact.

### 2.2 Demo Records (FLAGGED)
- **Criteria:** Seed records with names like `The Bistro Cafe`, `Urban Tandoor`, `CAFE.CO`.
- **Action:** Retain in database. Do not delete. If needed, toggle `lifecycle_status = 'ARCHIVED'` or filter from Platform Admin view via UI flags.

### 2.3 Test Records (FLAGGED)
- **Criteria:** Created during automated test execution (`id LIKE 'rest-test-%'`, `owner_email LIKE '%@test.dinely.internal'`).
- **Action:** DO NOT delete via raw SQL in production. Allow testing framework to clean up its own isolated fixtures.

### 2.4 Legacy Records (FLAGGED)
- **Criteria:** Records referencing `.dinely.app` domains or old schema structures from v1/v2.
- **Action:** Preserve for backward compatibility audit.

---

## 3. Recommended Database Schema Improvements (Post-Audit)

1. **Foreign Key Integrity:** Add explicit foreign key constraints with `ON DELETE CASCADE` or `RESTRICT`:
   ```sql
   ALTER TABLE orders ADD CONSTRAINT fk_orders_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE RESTRICT;
   ALTER TABLE tables ADD CONSTRAINT fk_tables_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE RESTRICT;
   ```
2. **Monetary Precision:** Migrate `FLOAT` columns to `NUMERIC(12, 2)` across `orders`, `order_items`, and `bills`:
   ```sql
   ALTER TABLE bills ALTER COLUMN total_amount TYPE NUMERIC(12, 2);
   ```
3. **Consolidate Lifecycle State:** Deprecate `is_approved` and `status` in favor of a single authoritative `lifecycle_status` enum:
   `DRAFT` → `PENDING_APPROVAL` → `LIVE` → `SUSPENDED` → `ARCHIVED`.

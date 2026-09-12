# DINELY — DATA AUDIT & NON-DESTRUCTIVE CLEANUP PLAN

**Document Status:** Approved Non-Destructive Data Plan  
**Mandate:** Zero Data Loss — Safe Categorization, Non-Destructive Archival, and Dry-Run Verification  
**Strict Safety Rule:** DO NOT DELETE PRODUCTION OR TEST DATA DIRECTLY. Execute all operations via Soft-Delete / Archival Flags with Complete Database Backups.  

---

## 1. Conceptual Data Categorization

Based on the audit of existing database models and seed scripts, records in the Neon PostgreSQL database fall into four distinct categories:

### 1.1 Pure Demo & Synthetic Mock Data
- **Characteristics:** Created by test scripts, seed routines, or developer sandbox sessions.
- **Typical Patterns:**
  - Names: `"The Dunk (Demo)"`, `"Cafe Co (Demo)"`, `"Test Venue 123"`, `"Sample Restaurant"`.
  - Slugs: `the-dunk-demo`, `test-restaurant-*`, `sample-cafe`, `rest-demo`.
  - User Emails: `*@example.com`, `testuser*@gmail.com`, `demo@dinely.food`.
  - Table Names: Default 1-10 with no real dining history.

### 1.2 Legacy Prototype Data
- **Characteristics:** Relics from earlier system iterations (v1/v2 schema or early v3 migrations).
- **Typical Patterns:**
  - Records created before August 2026.
  - Rows with `NULL` in newer columns (`theme_json`, `enabled_modules`, `status`).
  - Orphaned memberships or orders with broken foreign keys.

### 1.3 Active Platform Admin & Founder Records
- **Characteristics:** Authoritative system configuration records and administrator accounts.
- **Typical Patterns:**
  - Email: `ayan090912@gmail.com` (Authoritative Platform Superadmin).
  - Associated restaurants configured for production demonstration and validation.
  - **CRITICAL**: These records MUST be whitelisted and NEVER modified by automated cleanup.

### 1.4 Real or Prospective Production Tenant Data
- **Characteristics:** Restaurants created by legitimate owners signing in via Google OAuth.
- **Typical Patterns:**
  - Real brand names, real phone numbers, real business addresses.
  - Active Firebase UIDs linked to valid Google accounts.
  - Subdomains matching registered businesses.

---

## 2. Safety Precautions Before Any Database Operation

> [!CAUTION]
> Under NO circumstances should `DROP TABLE`, `TRUNCATE`, or unconstrained `DELETE FROM` statements be executed against the production database!

### Mandatory Pre-Cleanup Checklist:
1. **Full Database Snapshot**:
   - Execute a complete logical backup using `pg_dump`:
     ```bash
     pg_dump -h <neon-host> -U <user> -d <dbname> -F c -b -v -f "dinely_backup_$(date +%Y%m%d_%H%M%S).dump"
     ```
   - Store backup artifact in secure, versioned cloud storage (e.g., S3 / GCS).
2. **Neon Point-in-Time Restore (PITR) Verification**:
   - Verify that Neon branch snapshotting is active, allowing instant recovery to any second within the retention window.
3. **Dry-Run Query Execution**:
   - Always run an equivalent `SELECT COUNT(*)` and inspect individual row details before executing any data modification.

---

## 3. Non-Destructive Archival Strategy (Soft Delete)

Instead of permanently deleting old or test records, Dinely must employ a **Soft-Delete / Archival State Machine**:

### Step 1: Add Auditable Archival Columns
Ensure the `restaurants` table possesses explicit archival metadata:
```sql
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS is_test_record BOOLEAN DEFAULT FALSE;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS archived_by UUID DEFAULT NULL;
```

### Step 2: Dry-Run Inspection Query
Identify candidate test restaurants without modifying any records:
```sql
-- DRY RUN: Inspect candidate test restaurants
SELECT 
    id, 
    name, 
    slug, 
    status, 
    created_at, 
    (SELECT email FROM users WHERE id = restaurants.owner_id) as owner_email
FROM restaurants
WHERE 
    slug LIKE '%demo%' 
    OR slug LIKE '%test%' 
    OR name ILIKE '%sample%'
    OR id IN (
        SELECT restaurant_id FROM restaurant_memberships 
        JOIN users ON users.id = restaurant_memberships.user_id 
        WHERE users.email LIKE '%@example.com'
    )
ORDER BY created_at DESC;
```

### Step 3: Execute Controlled Soft-Archive
Transition candidate test restaurants to `ARCHIVED` status:
```sql
-- CONTROLLED ARCHIVAL: Mark test records safely
UPDATE restaurants
SET 
    status = 'ARCHIVED',
    is_test_record = TRUE,
    archived_at = NOW()
WHERE 
    status != 'ARCHIVED'
    AND (
        slug LIKE '%demo%' 
        OR slug LIKE '%test%' 
        OR name ILIKE '%sample%'
        OR id IN (
            SELECT restaurant_id FROM restaurant_memberships 
            JOIN users ON users.id = restaurant_memberships.user_id 
            WHERE users.email LIKE '%@example.com'
        )
    )
    -- Explicit Protection Whitelist: NEVER archive founder/admin restaurants
    AND owner_id NOT IN (
        SELECT id FROM users WHERE email = 'ayan090912@gmail.com'
    );
```

---

## 4. Rollback & Reversibility Guarantee

Because records are soft-archived rather than deleted:
- **Instant Restoration**: Any mistakenly archived restaurant can be restored to `LIVE` or `DRAFT` in one command:
  ```sql
  UPDATE restaurants 
  SET status = 'LIVE', is_test_record = FALSE, archived_at = NULL 
  WHERE id = '<target-uuid>';
  ```
- **Referential Integrity Preserved**: All associated child records (`tables`, `menu_items`, `orders`, `bills`) remain 100% intact, preventing foreign key constraint violations or orphaned data anomalies.
- **Filtered Admin Views**: The Platform Admin UI (`PlatformApp.tsx`) can provide a toggle: `[ ] Show Archived / Test Restaurants`, keeping the production queue clean while retaining historical compliance.

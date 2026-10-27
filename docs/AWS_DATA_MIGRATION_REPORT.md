# AWS Data Migration & Integrity Report: DineFlow / Dinely v3

**Date:** October 27, 2026  
**Source Database Engine:** PostgreSQL 16 (Neon / Original Cloud DB)  
**Destination Database:** AWS RDS for PostgreSQL 16.9 (`dinely-db-mumbai`)  
**Database Host:** `dinely-db-mumbai.cfaueau2o1gp.ap-south-1.rds.amazonaws.com:5432`  
**Database Name:** `neondb`  
**Migration Mode:** Full Schema & Data Verification with Live Snapshot Backup  

---

## 1. Verified Backup Artifacts

Prior to and during the migration validation, verified full SQL dumps were generated and placed in multi-location redundant storage:

1. **EC2 Host Local Storage:**
   - Path: `/opt/dinely/backups/dinely_rds_backup_20261027_073614.sql`
   - Size: 2,651,702 bytes (~2.53 MB)
   - Line Count: 3,292 SQL statements
2. **AWS S3 Versioned Bucket:**
   - URI: `s3://dinely-storage-ap-south-1/backups/dinely_rds_backup_20261027_073614.sql`
   - Encryption: AES256 server-side encryption
3. **Local Workspace Offline Archive:**
   - Path: `backups/dinely_rds_backup_20261027_073614.sql`

---

## 2. Table-by-Table Record Audit

All 33 relational tables were audited against the authoritative RDS production instance:

| Table Name | Live Record Count | Integrity & Schema Status |
| :--- | :--- | :--- |
| `alembic_version` | 1 | Consistent (Current head) |
| `restaurants` | 12 | Validated (Includes all live tenants) |
| `restaurant_domains` | 14 | Validated (Multi-tenant domain mapping intact) |
| `restaurant_lifecycle_logs`| 30 | Historical lifecycle events preserved |
| `restaurant_memberships` | 18 | Staff role assignments intact |
| `restaurant_printers` | 1 | Hardware printer profile preserved |
| `orders` | 87 | Validated (Across all OS types) |
| `order_items` | 136 | Validated (Relational foreign keys verified) |
| `bills` | 28 | Validated (Financial sums match orders) |
| `invoice_taxes` | 33 | Validated (GST/VAT breakdowns preserved) |
| `payment_transactions` | 1 | Payment audit record intact |
| `tables` | 71 | Physical dining floor tables preserved |
| `table_sessions` | 51 | Historic and active dining sessions intact |
| `customer_requests` | 53 | Waiter assistance call records preserved |
| `menu_categories` | 37 | Category ordering and metadata intact |
| `menu_items` | 39 | Item pricing, descriptions, images intact |
| `global_menu_library` | 43 | Master catalog templates preserved |
| `business_days` | 30 | Historical shift register preserved |
| `wedding_workspaces` | 12 | Wedding OS tenant records intact |
| `wedding_events` | 17 | Active and completed events preserved |
| `wedding_access_requests` | 26 | Guest access credentials preserved |
| `event_tables` | 84 | Banquet table arrangements intact |
| `event_assistance_requests`| 8 | Event floor requests preserved |
| `inventory_items` | 2 | Stock inventory records preserved |
| `terminals` | 3 | Terminal device configurations intact |
| `platform_admins` | 1 | Root platform admin record intact |
| `refresh_tokens` | 0 | Cleared on cycle (Security compliant) |
| `suppliers` | 0 | Empty catalog table |
| `tax_audit_logs` | 0 | Empty audit table |
| `tax_categories` | 0 | Empty tax category table |
| `tax_menu_items` | 0 | Empty tax junction table |
| `taxes` | 0 | Empty tax table |
| `playing_with_neon` | 10 | Neon migration sandbox table |

---

## 3. Critical Business Tenant Verification

All key business accounts across the three operating systems are present and active in the RDS database:

1. **Food Cart OS Tenants:**
   - `MAX KART` (`rest-1792792919776-6cb5d4` / `max-kart.dinely.food`): Active. Customer mobile storefront, pickup coupon generator, and terminal receiving verified.
   - `Delhi Kathi Stand` (`rest-delhi-kathi-stand-01` / `delhi-kathi-stand.dinely.food`): Active.
   - `Mumbai Street Rolls` (`rest-mumbai-street-rolls-01` / `mumbai-street-rolls.dinely.food`): Active.
2. **Restaurant & Bar OS Tenants:**
   - `ayaan` (`rest-1792997110836-e6db46` / `ayaan.dinely.food`): Active BAR entity.
   - `Garhi Shau` (`rest-1792565118020-47e322` / `garhi-shau.dinely.food`): Active RESTAURANT entity.
   - `local vender` (`rest-1792151659078-4f1d79` / `local-vender.dinely.food`): Active RESTAURANT entity.
   - `THE MAN` (`rest-1791979497852-e7f133` / `the-man.dinely.food`): Active RESTAURANT entity.
3. **Wedding & Events OS Tenants:**
   - `Grand Palace Banquet & Events` (`rest-live-evt-da4d38` / `grand-palace-da4d38.dinely.food`): Active WEDDING_ORDERING entity with 17 registered events and 84 event tables.

---

## 4. Rollback Plan

If a database recovery or rollback is required:
1. SSH / SSM into EC2 instance `i-0997b0b381dfb3fd0`.
2. Stop active backend container to prevent incoming writes:
   ```bash
   docker stop dinely_backend
   ```
3. Restore database state from the verified backup:
   ```bash
   psql "$DATABASE_URL_SYNC" -f /opt/dinely/backups/dinely_rds_backup_20261027_073614.sql
   ```
4. Restart backend container:
   ```bash
   docker start dinely_backend
   ```
5. Confirm `/healthz` and `/readyz` probes return HTTP 200.

import asyncio
from app.core.database.connection import AsyncSessionLocal, engine, Base
from sqlalchemy import text

# Import all models so Base.metadata has everything
from app.modules.restaurants.models import Restaurant, RestaurantLifecycleLog
from app.modules.tables.models import Table, TableSession
from app.modules.orders.models import Order, OrderItem, Bill
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.taxes.models import Tax, TaxCategory, TaxMenuItem, InvoiceTaxSnapshot, TaxAuditLog

async def main():
    print("=== STARTING NEON POSTGRESQL PRODUCTION MIGRATION ===")
    
    # 1. Create any missing tables using Base.metadata
    async with engine.begin() as conn:
        print("1. Creating missing tables via Base.metadata.create_all...")
        await conn.run_sync(Base.metadata.create_all)
        print("   -> Missing tables created successfully.")

    # 2. Alter existing tables to add any missing columns safely
    async with AsyncSessionLocal() as db:
        print("2. Ensuring all columns exist in 'restaurants' table...")
        restaurant_alter_queries = [
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_slug VARCHAR(255);",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_restaurants_public_slug ON restaurants (public_slug) WHERE deleted_at IS NULL;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_uid VARCHAR(255);",
            "CREATE INDEX IF NOT EXISTS ix_restaurants_owner_uid ON restaurants (owner_uid);",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL';",
            "CREATE INDEX IF NOT EXISTS ix_restaurants_lifecycle_status ON restaurants (lifecycle_status);",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS rejection_reason TEXT;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS requested_changes TEXT;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255);",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMP WITH TIME ZONE;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS dismissed_by VARCHAR(255);",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS dismiss_reason TEXT;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255);",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS state_code VARCHAR(10);",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gstin VARCHAR(50);",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS pan VARCHAR(50);",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV-';",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS invoice_starting_number DOUBLE PRECISION NOT NULL DEFAULT 1001;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS service_charge_percentage DOUBLE PRECISION NOT NULL DEFAULT 0.0;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS service_charge_enabled BOOLEAN NOT NULL DEFAULT FALSE;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100);",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_merchant_name VARCHAR(255);",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_qr_url TEXT;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_enabled BOOLEAN NOT NULL DEFAULT TRUE;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS billing_settings_json JSON;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS enabled_modules JSON;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS has_inventory BOOLEAN NOT NULL DEFAULT TRUE;",
            "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS has_billing BOOLEAN NOT NULL DEFAULT TRUE;",
        ]

        for q in restaurant_alter_queries:
            await db.execute(text(q))
        
        # 3. Synchronize existing restaurant records in Neon:
        print("3. Updating existing restaurant records with public_slug and lifecycle_status...")
        await db.execute(text("""
            UPDATE restaurants
            SET public_slug = CASE 
                WHEN slug IS NOT NULL AND slug != '' THEN slug
                ELSE LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || id
            END
            WHERE public_slug IS NULL;
        """))
        await db.execute(text("""
            UPDATE restaurants
            SET lifecycle_status = CASE 
                WHEN is_approved = true THEN 'LIVE'
                ELSE 'PENDING_APPROVAL'
            END
            WHERE lifecycle_status IS NULL OR lifecycle_status = 'PENDING_APPROVAL';
        """))

        # 4. Alter 'order_items' table:
        print("4. Ensuring columns in 'order_items' table...")
        await db.execute(text("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS target_destination VARCHAR(20) DEFAULT 'KITCHEN';"))

        # 5. Alter 'orders' table:
        print("5. Ensuring columns in 'orders' table...")
        await db.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_breakdown_json JSON;"))

        # 6. Alter 'taxes' table:
        print("6. Ensuring columns in 'taxes' table...")
        tax_alter_queries = [
            "ALTER TABLE taxes ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'PERCENTAGE';",
            "ALTER TABLE taxes ADD COLUMN IF NOT EXISTS rate DOUBLE PRECISION NOT NULL DEFAULT 0.0;",
            "ALTER TABLE taxes ADD COLUMN IF NOT EXISTS fixed_amount DOUBLE PRECISION DEFAULT 0.0;",
            "ALTER TABLE taxes ADD COLUMN IF NOT EXISTS applies_to VARCHAR(30) NOT NULL DEFAULT 'ORDER';",
            "ALTER TABLE taxes ADD COLUMN IF NOT EXISTS applicable_order_types JSON;",
            "ALTER TABLE taxes ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';",
        ]
        for q in tax_alter_queries:
            await db.execute(text(q))

        await db.commit()
        print("   -> Schema migration successfully committed to Neon PostgreSQL!")

if __name__ == "__main__":
    asyncio.run(main())

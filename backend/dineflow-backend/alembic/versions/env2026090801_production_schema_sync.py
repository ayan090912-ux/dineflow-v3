"""Production schema synchronization for Neon PostgreSQL

Revision ID: env2026090801
Revises: env2026082601
Create Date: 2026-09-08 07:07:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026090801'
down_revision: Union[str, None] = 'env2026082601'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. restaurants table additions
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_slug VARCHAR(255);")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_restaurants_public_slug ON restaurants (public_slug) WHERE deleted_at IS NULL;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_uid VARCHAR(255);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_restaurants_owner_uid ON restaurants (owner_uid);")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL';")
    op.execute("CREATE INDEX IF NOT EXISTS ix_restaurants_lifecycle_status ON restaurants (lifecycle_status);")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS rejection_reason TEXT;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS requested_changes TEXT;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255);")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMP WITH TIME ZONE;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS dismissed_by VARCHAR(255);")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS dismiss_reason TEXT;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255);")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS state_code VARCHAR(10);")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gstin VARCHAR(50);")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS pan VARCHAR(50);")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV-';")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS invoice_starting_number DOUBLE PRECISION NOT NULL DEFAULT 1001;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS service_charge_percentage DOUBLE PRECISION NOT NULL DEFAULT 0.0;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS service_charge_enabled BOOLEAN NOT NULL DEFAULT FALSE;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100);")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_merchant_name VARCHAR(255);")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_qr_url TEXT;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_enabled BOOLEAN NOT NULL DEFAULT TRUE;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS billing_settings_json JSON;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS enabled_modules JSON;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS has_inventory BOOLEAN NOT NULL DEFAULT TRUE;")
    op.execute("ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS has_billing BOOLEAN NOT NULL DEFAULT TRUE;")

    # 2. restaurant_lifecycle_logs table
    op.execute("""
        CREATE TABLE IF NOT EXISTS restaurant_lifecycle_logs (
            id VARCHAR(255) PRIMARY KEY,
            restaurant_id VARCHAR(255) NOT NULL,
            event_type VARCHAR(50) NOT NULL,
            previous_status VARCHAR(50),
            new_status VARCHAR(50) NOT NULL,
            reason TEXT,
            performed_by VARCHAR(255),
            performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_restaurant_lifecycle_logs_restaurant_id ON restaurant_lifecycle_logs (restaurant_id);
    """)

    # 3. bills table
    op.execute("""
        CREATE TABLE IF NOT EXISTS bills (
            id VARCHAR(255) PRIMARY KEY,
            restaurant_id VARCHAR(255) NOT NULL,
            table_id VARCHAR(255) NOT NULL,
            table_number VARCHAR(50) NOT NULL,
            table_session_id VARCHAR(255) NOT NULL,
            invoice_number VARCHAR(50),
            subtotal DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            discount_percentage DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            service_charge_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            service_charge_percentage DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            tax_percentage DOUBLE PRECISION NOT NULL DEFAULT 5.0,
            tax_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            round_off_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            grand_total DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
            payment_status VARCHAR(40) NOT NULL DEFAULT 'UNPAID',
            payment_method VARCHAR(50),
            payment_verified_by VARCHAR(100),
            payment_reference VARCHAR(100),
            tax_breakdown_json JSON,
            items_snapshot_json JSON,
            orders_snapshot_json JSON,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_bills_restaurant_id ON bills (restaurant_id);
        CREATE INDEX IF NOT EXISTS ix_bills_table_id ON bills (table_id);
        CREATE INDEX IF NOT EXISTS ix_bills_table_session_id ON bills (table_session_id);
        CREATE INDEX IF NOT EXISTS ix_bills_invoice_number ON bills (invoice_number);
    """)

    # 4. order_items and orders alterations
    op.execute("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS target_destination VARCHAR(20) DEFAULT 'KITCHEN';")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_breakdown_json JSON;")

    # 5. taxes table alterations
    op.execute("ALTER TABLE taxes ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'PERCENTAGE';")
    op.execute("ALTER TABLE taxes ADD COLUMN IF NOT EXISTS rate DOUBLE PRECISION NOT NULL DEFAULT 0.0;")
    op.execute("ALTER TABLE taxes ADD COLUMN IF NOT EXISTS fixed_amount DOUBLE PRECISION DEFAULT 0.0;")
    op.execute("ALTER TABLE taxes ADD COLUMN IF NOT EXISTS applies_to VARCHAR(30) NOT NULL DEFAULT 'ORDER';")
    op.execute("ALTER TABLE taxes ADD COLUMN IF NOT EXISTS applicable_order_types JSON;")
    op.execute("ALTER TABLE taxes ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';")

def downgrade() -> None:
    pass

"""Add inventory_items, suppliers, and high-performance composite tenant indexes

Revision ID: env2026091201
Revises: env2026090801
Create Date: 2026-09-12 10:45:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026091201'
down_revision: Union[str, None] = 'env2026090801'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. suppliers table
    op.execute("""
        CREATE TABLE IF NOT EXISTS suppliers (
            id VARCHAR(255) PRIMARY KEY,
            restaurant_id VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            contact_person VARCHAR(255),
            phone VARCHAR(50),
            email VARCHAR(255),
            supply_category VARCHAR(100),
            address TEXT,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_suppliers_restaurant_id ON suppliers (restaurant_id);
    """)

    # 2. inventory_items table
    op.execute("""
        CREATE TABLE IF NOT EXISTS inventory_items (
            id VARCHAR(255) PRIMARY KEY,
            restaurant_id VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            category VARCHAR(100) NOT NULL DEFAULT 'Pantry',
            station VARCHAR(50) NOT NULL DEFAULT 'KITCHEN',
            quantity DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            unit VARCHAR(50) NOT NULL DEFAULT 'kg',
            min_threshold DOUBLE PRECISION NOT NULL DEFAULT 2.0,
            cost_per_unit DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            supplier_id VARCHAR(255),
            supplier_name VARCHAR(255),
            supplier_contact VARCHAR(100),
            storage_location VARCHAR(255),
            last_restocked VARCHAR(50),
            status VARCHAR(50) NOT NULL DEFAULT 'IN_STOCK',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_inventory_items_restaurant_id ON inventory_items (restaurant_id);
        CREATE INDEX IF NOT EXISTS ix_inventory_items_station ON inventory_items (restaurant_id, station);
        CREATE INDEX IF NOT EXISTS ix_inventory_items_status ON inventory_items (restaurant_id, status);
    """)

    # 3. Composite High-Performance Tenant Indexes
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_orders_rest_status ON orders (restaurant_id, status);
        CREATE INDEX IF NOT EXISTS idx_orders_rest_created ON orders (restaurant_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_table_sessions_rest_status ON table_sessions (restaurant_id, status);
        CREATE INDEX IF NOT EXISTS idx_bills_rest_status ON bills (restaurant_id, status);
        CREATE INDEX IF NOT EXISTS idx_bills_rest_created ON bills (restaurant_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_customer_requests_rest_status ON customer_requests (restaurant_id, status);
        CREATE INDEX IF NOT EXISTS idx_tables_rest_num ON tables (restaurant_id, table_number);
        CREATE INDEX IF NOT EXISTS idx_restaurants_lifecycle ON restaurants (lifecycle_status);
        CREATE INDEX IF NOT EXISTS idx_restaurants_owner_uid ON restaurants (owner_uid);
        CREATE INDEX IF NOT EXISTS idx_restaurants_owner_email ON restaurants (owner_email);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS inventory_items CASCADE;")
    op.execute("DROP TABLE IF EXISTS suppliers CASCADE;")

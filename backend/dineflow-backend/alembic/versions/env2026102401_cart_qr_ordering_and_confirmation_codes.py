"""Add pickup_code, pickup_status, claimed_at to orders and stock_quantity to menu_items

Revision ID: env2026102401
Revises: env2026102001
Create Date: 2026-10-24 04:30:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026102401'
down_revision: Union[str, None] = 'env2026102001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_column(table_name: str, column_name: str, column_type: str, default: str = None) -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "sqlite":
        cols = [r[1] for r in bind.execute(sa.text(f"PRAGMA table_info({table_name})")).fetchall()]
        if column_name not in cols:
            default_clause = f" DEFAULT {default}" if default is not None else ""
            op.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}{default_clause};")
    else:
        default_clause = f" DEFAULT {default}" if default is not None else ""
        op.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {column_name} {column_type}{default_clause};")


def upgrade() -> None:
    # 1. Add pickup_code, pickup_status, claimed_at to orders
    _add_column("orders", "pickup_code", "VARCHAR(50)")
    _add_column("orders", "pickup_status", "VARCHAR(50)", default="'UNCLAIMED'")
    _add_column("orders", "claimed_at", "TIMESTAMPTZ")

    # 2. Add stock_quantity, track_inventory to menu_items
    _add_column("menu_items", "stock_quantity", "INTEGER")
    _add_column("menu_items", "track_inventory", "BOOLEAN", default="FALSE")

    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect != "sqlite":
        op.execute("CREATE INDEX IF NOT EXISTS ix_orders_pickup_code ON orders (pickup_code);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_orders_pickup_status ON orders (pickup_status);")


def downgrade() -> None:
    pass

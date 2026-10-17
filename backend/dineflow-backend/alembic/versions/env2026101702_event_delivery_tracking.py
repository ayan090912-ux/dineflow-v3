"""Add delivery tracking and claiming to orders

Revision ID: env2026101702
Revises: env2026101701
Create Date: 2026-10-17 22:45:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026101702'
down_revision: Union[str, None] = 'env2026101701'
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
    # 1. Add claimed_by to orders
    _add_column("orders", "claimed_by", "VARCHAR(255)")

    # 2. Add delivery_status to orders
    _add_column("orders", "delivery_status", "VARCHAR(50)", "'PENDING'")

    # 3. Add delivered_at to orders
    _add_column("orders", "delivered_at", "TIMESTAMP WITH TIME ZONE")

    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect != "sqlite":
        op.execute("CREATE INDEX IF NOT EXISTS ix_orders_delivery_status ON orders (delivery_status);")
    else:
        op.execute("CREATE INDEX IF NOT EXISTS ix_orders_delivery_status ON orders (delivery_status);")


def downgrade() -> None:
    pass

"""Add station waiter requested flags to orders and order_id/station to customer_requests

Revision ID: env2026102801
Revises: env2026102401
Create Date: 2026-10-28 10:30:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026102801'
down_revision: Union[str, None] = 'env2026102401'
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
    # 1. Add station waiter requested flags to orders
    _add_column("orders", "kitchen_waiter_requested", "BOOLEAN", default="FALSE")
    _add_column("orders", "bar_waiter_requested", "BOOLEAN", default="FALSE")
    _add_column("orders", "hookah_waiter_requested", "BOOLEAN", default="FALSE")

    # 2. Add order_id and station linkage to customer_requests
    _add_column("customer_requests", "order_id", "VARCHAR(255)")
    _add_column("customer_requests", "station", "VARCHAR(50)")

    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect != "sqlite":
        op.execute("CREATE INDEX IF NOT EXISTS ix_customer_requests_order_id ON customer_requests (order_id);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_customer_requests_station ON customer_requests (station);")


def downgrade() -> None:
    pass

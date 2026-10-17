"""Add hookah station support to orders and restaurants

Revision ID: env2026101701
Revises: env2026101601
Create Date: 2026-10-17 18:05:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026101701'
down_revision: Union[str, None] = 'env2026101601'
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
    # 1. Add hookah_status to orders table
    _add_column("orders", "hookah_status", "VARCHAR(30)")
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect != "sqlite":
        op.execute("CREATE INDEX IF NOT EXISTS ix_orders_hookah_status ON orders (hookah_status);")
    else:
        op.execute("CREATE INDEX IF NOT EXISTS ix_orders_hookah_status ON orders (hookah_status);")

    # 2. Add has_hookah to restaurants table
    _add_column("restaurants", "has_hookah", "BOOLEAN", "TRUE")


def downgrade() -> None:
    pass

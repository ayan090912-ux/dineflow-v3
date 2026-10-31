"""Add hookah and kitchen sales and order count columns to business_days

Revision ID: env2026103101
Revises: env2026102801
Create Date: 2026-10-31 18:25:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026103101'
down_revision: Union[str, None] = 'env2026102801'
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
    # 1. Add hookah and kitchen tracking columns to business_days table
    _add_column("business_days", "hookah_orders", "INTEGER", default="0")
    _add_column("business_days", "hookah_sales", "FLOAT", default="0.0")
    _add_column("business_days", "kitchen_orders", "INTEGER", default="0")
    _add_column("business_days", "kitchen_sales", "FLOAT", default="0.0")


def downgrade() -> None:
    pass

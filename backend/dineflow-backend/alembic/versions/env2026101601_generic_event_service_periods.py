"""Add service period, timezone policy, and generic event columns to wedding_events and requests

Revision ID: env2026101601
Revises: env2026101502
Create Date: 2026-10-16 17:40:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026101601'
down_revision: Union[str, None] = 'env2026101502'
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
    # 1. Update wedding_events table with service period, timezone policy, and extension audit columns
    _add_column("wedding_events", "end_date", "VARCHAR(50)")
    _add_column("wedding_events", "timezone", "VARCHAR(50)", "'Asia/Kolkata'")
    _add_column("wedding_events", "service_days", "INTEGER", "1")
    _add_column("wedding_events", "start_datetime_utc", "TIMESTAMPTZ")
    _add_column("wedding_events", "end_datetime_utc", "TIMESTAMPTZ")
    _add_column("wedding_events", "auto_activate", "BOOLEAN", "TRUE")
    _add_column("wedding_events", "extended_at", "TIMESTAMPTZ")
    _add_column("wedding_events", "extended_by", "VARCHAR(255)")
    _add_column("wedding_events", "extended_reason", "TEXT")
    _add_column("wedding_events", "original_end_datetime_utc", "TIMESTAMPTZ")

    bind = op.get_bind()
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_events_start_datetime_utc ON wedding_events (start_datetime_utc);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_events_end_datetime_utc ON wedding_events (end_datetime_utc);")

    # 2. Update wedding_access_requests table with multi-day service period and timezone columns
    _add_column("wedding_access_requests", "end_date", "VARCHAR(50)")
    _add_column("wedding_access_requests", "timezone", "VARCHAR(50)", "'Asia/Kolkata'")
    _add_column("wedding_access_requests", "service_days", "INTEGER", "1")
    _add_column("wedding_access_requests", "start_datetime_utc", "TIMESTAMPTZ")
    _add_column("wedding_access_requests", "end_datetime_utc", "TIMESTAMPTZ")

    # 3. Add idempotency_key to orders table for duplicate prevention
    _add_column("orders", "idempotency_key", "VARCHAR(255)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_idempotency_key ON orders (idempotency_key);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_orders_idempotency_key;")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS idempotency_key;")

    op.execute("ALTER TABLE wedding_access_requests DROP COLUMN IF EXISTS end_datetime_utc;")
    op.execute("ALTER TABLE wedding_access_requests DROP COLUMN IF EXISTS start_datetime_utc;")
    op.execute("ALTER TABLE wedding_access_requests DROP COLUMN IF EXISTS service_days;")
    op.execute("ALTER TABLE wedding_access_requests DROP COLUMN IF EXISTS timezone;")
    op.execute("ALTER TABLE wedding_access_requests DROP COLUMN IF EXISTS end_date;")

    op.execute("DROP INDEX IF EXISTS ix_wedding_events_end_datetime_utc;")
    op.execute("DROP INDEX IF EXISTS ix_wedding_events_start_datetime_utc;")
    op.execute("ALTER TABLE wedding_events DROP COLUMN IF EXISTS original_end_datetime_utc;")
    op.execute("ALTER TABLE wedding_events DROP COLUMN IF EXISTS extended_reason;")
    op.execute("ALTER TABLE wedding_events DROP COLUMN IF EXISTS extended_by;")
    op.execute("ALTER TABLE wedding_events DROP COLUMN IF EXISTS extended_at;")
    op.execute("ALTER TABLE wedding_events DROP COLUMN IF EXISTS auto_activate;")
    op.execute("ALTER TABLE wedding_events DROP COLUMN IF EXISTS end_datetime_utc;")
    op.execute("ALTER TABLE wedding_events DROP COLUMN IF EXISTS start_datetime_utc;")
    op.execute("ALTER TABLE wedding_events DROP COLUMN IF EXISTS service_days;")
    op.execute("ALTER TABLE wedding_events DROP COLUMN IF EXISTS timezone;")
    op.execute("ALTER TABLE wedding_events DROP COLUMN IF EXISTS end_date;")

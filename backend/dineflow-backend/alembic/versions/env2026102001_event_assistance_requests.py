"""Add service station flags and event_assistance_requests table

Revision ID: env2026102001
Revises: env2026101702
Create Date: 2026-10-20 07:15:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026102001'
down_revision: Union[str, None] = 'env2026101702'
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
    bind = op.get_bind()
    dialect = bind.dialect.name

    # 1. Add station flags to wedding_events
    _add_column("wedding_events", "has_food", "BOOLEAN", "TRUE")
    _add_column("wedding_events", "has_bar", "BOOLEAN", "FALSE")
    _add_column("wedding_events", "has_hookah", "BOOLEAN", "FALSE")
    _add_column("wedding_events", "has_table_assistance", "BOOLEAN", "TRUE")
    _add_column("wedding_events", "alcohol_policy_notes", "VARCHAR(255)")

    # 2. Create event_assistance_requests table
    if dialect == "sqlite":
        op.execute("""
            CREATE TABLE IF NOT EXISTS event_assistance_requests (
                id VARCHAR(255) PRIMARY KEY,
                event_id VARCHAR(255) NOT NULL REFERENCES wedding_events(id) ON DELETE CASCADE,
                restaurant_id VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
                table_number VARCHAR(50) NOT NULL,
                table_id VARCHAR(255),
                request_items JSON NOT NULL,
                guest_name VARCHAR(255),
                guest_note TEXT,
                status VARCHAR(50) NOT NULL DEFAULT 'NEW',
                assigned_staff_name VARCHAR(255),
                assigned_staff_uid VARCHAR(255),
                acknowledged_at DATETIME,
                in_progress_at DATETIME,
                completed_at DATETIME,
                idempotency_key VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)
        op.execute("CREATE INDEX IF NOT EXISTS ix_event_assistance_requests_event_id ON event_assistance_requests (event_id);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_event_assistance_requests_restaurant_id ON event_assistance_requests (restaurant_id);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_event_assistance_requests_table_number ON event_assistance_requests (table_number);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_event_assistance_requests_status ON event_assistance_requests (status);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_event_assistance_requests_idempotency_key ON event_assistance_requests (idempotency_key);")
    else:
        op.execute("""
            CREATE TABLE IF NOT EXISTS event_assistance_requests (
                id VARCHAR(255) PRIMARY KEY,
                event_id VARCHAR(255) NOT NULL REFERENCES wedding_events(id) ON DELETE CASCADE,
                restaurant_id VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
                table_number VARCHAR(50) NOT NULL,
                table_id VARCHAR(255),
                request_items JSONB NOT NULL,
                guest_name VARCHAR(255),
                guest_note TEXT,
                status VARCHAR(50) NOT NULL DEFAULT 'NEW',
                assigned_staff_name VARCHAR(255),
                assigned_staff_uid VARCHAR(255),
                acknowledged_at TIMESTAMP WITH TIME ZONE,
                in_progress_at TIMESTAMP WITH TIME ZONE,
                completed_at TIMESTAMP WITH TIME ZONE,
                idempotency_key VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        """)
        op.execute("CREATE INDEX IF NOT EXISTS ix_event_assistance_requests_event_id ON event_assistance_requests (event_id);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_event_assistance_requests_restaurant_id ON event_assistance_requests (restaurant_id);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_event_assistance_requests_table_number ON event_assistance_requests (table_number);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_event_assistance_requests_status ON event_assistance_requests (status);")
        op.execute("CREATE INDEX IF NOT EXISTS ix_event_assistance_requests_idempotency_key ON event_assistance_requests (idempotency_key);")


def downgrade() -> None:
    pass

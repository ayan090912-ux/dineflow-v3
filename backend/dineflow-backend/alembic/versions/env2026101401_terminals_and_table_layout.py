"""Add terminals table and table layout persistence columns

Revision ID: env2026101401
Revises: env2026100801
Create Date: 2026-10-14 22:30:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026101401'
down_revision: Union[str, None] = 'env2026100801'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create terminals table
    op.execute("""
        CREATE TABLE IF NOT EXISTS terminals (
            id VARCHAR(255) PRIMARY KEY,
            restaurant_id VARCHAR(255) NOT NULL,
            name VARCHAR(100) NOT NULL,
            terminal_code VARCHAR(50) NOT NULL,
            terminal_type VARCHAR(50) DEFAULT 'WAITER' NOT NULL,
            device_info VARCHAR(255),
            pairing_code VARCHAR(50),
            status VARCHAR(30) DEFAULT 'ACTIVE' NOT NULL,
            ip_address VARCHAR(100),
            last_active_at TIMESTAMPTZ,
            is_active BOOLEAN DEFAULT TRUE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            CONSTRAINT uq_restaurant_terminal_code UNIQUE (restaurant_id, terminal_code)
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_terminals_restaurant_id ON terminals (restaurant_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_terminals_terminal_code ON terminals (terminal_code);")

    # 2. Add table visual layout and property columns
    op.execute("ALTER TABLE tables ADD COLUMN IF NOT EXISTS shape VARCHAR(50) DEFAULT 'RECTANGLE';")
    op.execute("ALTER TABLE tables ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;")
    op.execute("ALTER TABLE tables ADD COLUMN IF NOT EXISTS position_x FLOAT DEFAULT 0.0;")
    op.execute("ALTER TABLE tables ADD COLUMN IF NOT EXISTS position_y FLOAT DEFAULT 0.0;")
    op.execute("ALTER TABLE tables ADD COLUMN IF NOT EXISTS rotation FLOAT DEFAULT 0.0;")

    # 3. Data repair: Ensure restaurants with seating have 'tables' in enabled_modules
    op.execute("""
        UPDATE restaurants
        SET enabled_modules = CASE
            WHEN enabled_modules IS NULL OR jsonb_typeof(enabled_modules::jsonb) != 'array' THEN '["tables"]'::jsonb
            WHEN NOT (enabled_modules::jsonb ? 'tables') THEN enabled_modules::jsonb || '["tables"]'::jsonb
            ELSE enabled_modules::jsonb
        END
        WHERE (has_tables IS TRUE OR has_tables IS NULL)
          AND (enabled_modules IS NULL OR NOT (enabled_modules::jsonb ? 'tables'));
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE tables DROP COLUMN IF EXISTS rotation;")
    op.execute("ALTER TABLE tables DROP COLUMN IF EXISTS position_y;")
    op.execute("ALTER TABLE tables DROP COLUMN IF EXISTS position_x;")
    op.execute("ALTER TABLE tables DROP COLUMN IF EXISTS is_vip;")
    op.execute("ALTER TABLE tables DROP COLUMN IF EXISTS shape;")
    op.execute("DROP TABLE IF EXISTS terminals;")

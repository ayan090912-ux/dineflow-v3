"""Add weddings and events tables and order association columns

Revision ID: env2026101501
Revises: env2026101401
Create Date: 2026-10-15 18:00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026101501'
down_revision: Union[str, None] = 'env2026101401'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create wedding_events table
    op.execute("""
        CREATE TABLE IF NOT EXISTS wedding_events (
            id VARCHAR(255) PRIMARY KEY,
            restaurant_id VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            couple_names VARCHAR(255),
            event_type VARCHAR(50) DEFAULT 'WEDDING' NOT NULL,
            event_date VARCHAR(50) NOT NULL,
            start_time VARCHAR(20) DEFAULT '18:00',
            end_time VARCHAR(20) DEFAULT '23:30',
            venue_name VARCHAR(255),
            welcome_message TEXT,
            theme_color VARCHAR(50) DEFAULT 'champagne' NOT NULL,
            cover_image_url TEXT,
            status VARCHAR(30) DEFAULT 'DRAFT' NOT NULL,
            is_ordering_open BOOLEAN DEFAULT TRUE NOT NULL,
            menu_selection_type VARCHAR(30) DEFAULT 'FULL_MENU' NOT NULL,
            allowed_category_ids JSON,
            allowed_item_ids JSON,
            estimated_guest_count INTEGER DEFAULT 100 NOT NULL,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_events_restaurant_id ON wedding_events (restaurant_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_events_event_date ON wedding_events (event_date);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_events_status ON wedding_events (status);")

    # 2. Create event_tables table (strictly decoupled from restaurant tables)
    op.execute("""
        CREATE TABLE IF NOT EXISTS event_tables (
            id VARCHAR(255) PRIMARY KEY,
            event_id VARCHAR(255) NOT NULL REFERENCES wedding_events(id) ON DELETE CASCADE,
            restaurant_id VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
            table_number VARCHAR(50) NOT NULL,
            table_label VARCHAR(100),
            capacity INTEGER DEFAULT 8 NOT NULL,
            qr_code_url TEXT,
            is_active BOOLEAN DEFAULT TRUE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            CONSTRAINT uq_event_table_number UNIQUE (event_id, table_number)
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_event_tables_event_id ON event_tables (event_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_event_tables_restaurant_id ON event_tables (restaurant_id);")

    # 3. Add order columns for wedding event tagging
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(50) DEFAULT 'DINE_IN';")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_id VARCHAR(255);")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_name VARCHAR(255);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_event_id ON orders (event_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_orders_event_id;")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS event_name;")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS event_id;")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS order_type;")
    op.execute("DROP TABLE IF EXISTS event_tables;")
    op.execute("DROP TABLE IF EXISTS wedding_events;")

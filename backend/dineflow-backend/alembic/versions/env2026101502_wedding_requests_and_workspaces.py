"""Add wedding access requests and wedding workspaces tables

Revision ID: env2026101502
Revises: env2026101501
Create Date: 2026-10-15 20:30:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026101502'
down_revision: Union[str, None] = 'env2026101501'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create wedding_access_requests table
    op.execute("""
        CREATE TABLE IF NOT EXISTS wedding_access_requests (
            id VARCHAR(255) PRIMARY KEY,
            applicant_name VARCHAR(255) NOT NULL,
            applicant_email VARCHAR(255) NOT NULL,
            applicant_phone VARCHAR(50) NOT NULL,
            wedding_name VARCHAR(255) NOT NULL,
            event_type VARCHAR(50) DEFAULT 'WEDDING' NOT NULL,
            event_date VARCHAR(50) NOT NULL,
            start_time VARCHAR(20) DEFAULT '18:00',
            end_time VARCHAR(20) DEFAULT '23:30',
            venue_name VARCHAR(255) NOT NULL,
            venue_city VARCHAR(100) NOT NULL,
            estimated_guest_count INTEGER DEFAULT 100 NOT NULL,
            catering_notes TEXT,
            catering_restaurant_id VARCHAR(255) REFERENCES restaurants(id) ON DELETE SET NULL,
            additional_requirements TEXT,
            notes TEXT,
            lifecycle_status VARCHAR(50) DEFAULT 'SUBMITTED' NOT NULL,
            review_notes TEXT,
            reviewed_by VARCHAR(255),
            reviewed_at TIMESTAMPTZ,
            workspace_id VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_access_requests_applicant_email ON wedding_access_requests (applicant_email);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_access_requests_event_date ON wedding_access_requests (event_date);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_access_requests_lifecycle_status ON wedding_access_requests (lifecycle_status);")

    # 2. Create wedding_workspaces table
    op.execute("""
        CREATE TABLE IF NOT EXISTS wedding_workspaces (
            id VARCHAR(255) PRIMARY KEY,
            request_id VARCHAR(255) REFERENCES wedding_access_requests(id) ON DELETE SET NULL,
            owner_email VARCHAR(255) NOT NULL,
            owner_uid VARCHAR(255),
            name VARCHAR(255) NOT NULL,
            restaurant_id VARCHAR(255) NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
            event_id VARCHAR(255),
            status VARCHAR(50) DEFAULT 'ACTIVE' NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_workspaces_owner_email ON wedding_workspaces (owner_email);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_workspaces_owner_uid ON wedding_workspaces (owner_uid);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_workspaces_restaurant_id ON wedding_workspaces (restaurant_id);")

    # 3. Add workspace columns to wedding_events
    op.execute("ALTER TABLE wedding_events ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(255);")
    op.execute("ALTER TABLE wedding_events ADD COLUMN IF NOT EXISTS organizer_email VARCHAR(255);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_events_workspace_id ON wedding_events (workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wedding_events_organizer_email ON wedding_events (organizer_email);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_wedding_events_organizer_email;")
    op.execute("DROP INDEX IF EXISTS ix_wedding_events_workspace_id;")
    op.execute("ALTER TABLE wedding_events DROP COLUMN IF EXISTS organizer_email;")
    op.execute("ALTER TABLE wedding_events DROP COLUMN IF EXISTS workspace_id;")
    op.execute("DROP TABLE IF EXISTS wedding_workspaces;")
    op.execute("DROP TABLE IF EXISTS wedding_access_requests;")

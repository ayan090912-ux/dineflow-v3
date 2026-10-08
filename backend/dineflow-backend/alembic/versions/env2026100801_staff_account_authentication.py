"""Add staff account authentication columns to restaurant_memberships

Revision ID: env2026100801
Revises: env2026091201
Create Date: 2026-10-08 18:30:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'env2026100801'
down_revision: Union[str, None] = 'env2026091201'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE restaurant_memberships ADD COLUMN IF NOT EXISTS username VARCHAR(100);")
    op.execute("ALTER TABLE restaurant_memberships ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);")
    op.execute("ALTER TABLE restaurant_memberships ADD COLUMN IF NOT EXISTS password_hash TEXT;")
    op.execute("ALTER TABLE restaurant_memberships ADD COLUMN IF NOT EXISTS assigned_terminal VARCHAR(100);")
    op.execute("ALTER TABLE restaurant_memberships ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_restaurant_memberships_username ON restaurant_memberships (LOWER(username)) WHERE username IS NOT NULL;")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_restaurant_memberships_username;")
    op.execute("ALTER TABLE restaurant_memberships DROP COLUMN IF EXISTS is_active;")
    op.execute("ALTER TABLE restaurant_memberships DROP COLUMN IF EXISTS assigned_terminal;")
    op.execute("ALTER TABLE restaurant_memberships DROP COLUMN IF EXISTS password_hash;")
    op.execute("ALTER TABLE restaurant_memberships DROP COLUMN IF EXISTS full_name;")
    op.execute("ALTER TABLE restaurant_memberships DROP COLUMN IF EXISTS username;")

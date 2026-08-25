"""add taxes table and snapshots

Revision ID: env2026082601
Revises: 
Create Date: 2026-08-26 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'env2026082601'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'taxes',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('restaurant_id', sa.String(255), sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('type', sa.String(30), nullable=False, server_default='PERCENTAGE'),
        sa.Column('rate', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('fixed_amount', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('is_inclusive', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('applies_to', sa.String(30), nullable=False, server_default='ORDER'),
        sa.Column('applicable_order_types', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='ACTIVE', index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    op.create_table(
        'tax_categories',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('tax_id', sa.String(255), sa.ForeignKey('taxes.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('category_id', sa.String(255), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    op.create_table(
        'tax_menu_items',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('tax_id', sa.String(255), sa.ForeignKey('taxes.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('menu_item_id', sa.String(255), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    op.create_table(
        'invoice_taxes',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('bill_id', sa.String(255), nullable=True, index=True),
        sa.Column('order_id', sa.String(255), nullable=True, index=True),
        sa.Column('tax_id', sa.String(255), nullable=False, index=True),
        sa.Column('tax_name_snapshot', sa.String(255), nullable=False),
        sa.Column('tax_type_snapshot', sa.String(30), nullable=False),
        sa.Column('tax_rate_snapshot', sa.Float(), nullable=False),
        sa.Column('tax_amount', sa.Float(), nullable=False),
        sa.Column('is_inclusive', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    op.create_table(
        'tax_audit_logs',
        sa.Column('id', sa.String(255), primary_key=True),
        sa.Column('restaurant_id', sa.String(255), nullable=False, index=True),
        sa.Column('user_id', sa.String(255), nullable=True),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('tax_id', sa.String(255), nullable=False, index=True),
        sa.Column('previous_values', sa.JSON(), nullable=True),
        sa.Column('new_values', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

def downgrade():
    op.drop_table('tax_audit_logs')
    op.drop_table('invoice_taxes')
    op.drop_table('tax_menu_items')
    op.drop_table('tax_categories')
    op.drop_table('taxes')

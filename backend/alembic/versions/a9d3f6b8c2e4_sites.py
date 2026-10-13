"""sites: Cloudflare Radar domain rankings and each source's positions

Revision ID: a9d3f6b8c2e4
Revises: f5b8d2e4a7c1
Create Date: 2026-10-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a9d3f6b8c2e4'
down_revision: Union[str, None] = 'f5b8d2e4a7c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sites',
        sa.Column('domain', sa.String(length=255), nullable=False),
        sa.Column('categories', sa.Text(), nullable=True),
        sa.Column('offer_key', sa.String(length=255), nullable=True),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('domain'),
    )
    op.create_index('ix_sites_offer_key', 'sites', ['offer_key'])
    op.create_table(
        'source_sites',
        sa.Column('source_id', sa.Integer(), nullable=False),
        sa.Column('domain', sa.String(length=255), nullable=False),
        sa.Column('rank', sa.Integer(), nullable=False),
        sa.Column('previous_rank', sa.Integer(), nullable=True),
        sa.Column('pct_rank_change', sa.Float(), nullable=True),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['source_id'], ['sources.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['domain'], ['sites.domain'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('source_id', 'domain'),
    )
    op.create_index('ix_source_sites_domain', 'source_sites', ['domain'])


def downgrade() -> None:
    op.drop_index('ix_source_sites_domain', table_name='source_sites')
    op.drop_table('source_sites')
    op.drop_index('ix_sites_offer_key', table_name='sites')
    op.drop_table('sites')

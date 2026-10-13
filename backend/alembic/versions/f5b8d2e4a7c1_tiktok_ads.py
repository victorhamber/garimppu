"""tiktok: Creative Center top ads and the sources that found them

Revision ID: f5b8d2e4a7c1
Revises: e3a7c5d9f1b2
Create Date: 2026-10-13 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f5b8d2e4a7c1'
down_revision: Union[str, None] = 'e3a7c5d9f1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tiktok_ads',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('country', sa.String(length=8), nullable=False),
        sa.Column('title', sa.Text(), nullable=True),
        sa.Column('brand', sa.String(length=255), nullable=True),
        sa.Column('industry_id', sa.BigInteger(), nullable=True),
        sa.Column('industry_parent', sa.BigInteger(), nullable=True),
        sa.Column('objective', sa.String(length=64), nullable=True),
        sa.Column('ctr_rank', sa.Float(), nullable=True),
        sa.Column('likes', sa.BigInteger(), nullable=False),
        sa.Column('comments', sa.BigInteger(), nullable=True),
        sa.Column('shares', sa.BigInteger(), nullable=True),
        sa.Column('budget', sa.Integer(), nullable=True),
        sa.Column('duration_s', sa.Float(), nullable=True),
        sa.Column('cover_path', sa.Text(), nullable=True),
        sa.Column('landing_page', sa.Text(), nullable=True),
        sa.Column('offer_key', sa.String(length=255), nullable=True),
        sa.Column('offer_kind', sa.String(length=16), nullable=True),
        sa.Column('offer_platform', sa.String(length=32), nullable=True),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tiktok_ads_industry_parent', 'tiktok_ads', ['industry_parent'])
    op.create_index('ix_tiktok_ads_offer_key', 'tiktok_ads', ['offer_key'])
    op.create_index('ix_tiktok_ads_score', 'tiktok_ads', ['score'])
    op.create_table(
        'source_tiktok_ads',
        sa.Column('source_id', sa.Integer(), nullable=False),
        sa.Column('ad_id', sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(['source_id'], ['sources.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['ad_id'], ['tiktok_ads.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('source_id', 'ad_id'),
    )
    op.create_index('ix_source_tiktok_ads_ad_id', 'source_tiktok_ads', ['ad_id'])


def downgrade() -> None:
    op.drop_index('ix_source_tiktok_ads_ad_id', table_name='source_tiktok_ads')
    op.drop_table('source_tiktok_ads')
    op.drop_index('ix_tiktok_ads_score', table_name='tiktok_ads')
    op.drop_index('ix_tiktok_ads_offer_key', table_name='tiktok_ads')
    op.drop_index('ix_tiktok_ads_industry_parent', table_name='tiktok_ads')
    op.drop_table('tiktok_ads')

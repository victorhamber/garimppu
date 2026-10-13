"""trends: Google Trends trending searches, their daily traffic and the sources that saw them

Revision ID: b4c8e1f3a6d9
Revises: a9d3f6b8c2e4
Create Date: 2026-10-13 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4c8e1f3a6d9'
down_revision: Union[str, None] = 'a9d3f6b8c2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'trend_keywords',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('geo', sa.String(length=8), nullable=False),
        sa.Column('term', sa.String(length=255), nullable=False),
        sa.Column('term_key', sa.String(length=255), nullable=False),
        sa.Column('niche', sa.String(length=32), nullable=True),
        sa.Column('traffic', sa.BigInteger(), nullable=True),
        sa.Column('peak_traffic', sa.BigInteger(), nullable=True),
        sa.Column('sightings', sa.Integer(), nullable=False),
        sa.Column('news', sa.JSON(), nullable=True),
        sa.Column('picture_url', sa.Text(), nullable=True),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('geo', 'term_key', name='uq_trend_keywords_geo_term'),
    )
    op.create_index('ix_trend_keywords_niche', 'trend_keywords', ['niche'])
    op.create_index('ix_trend_keywords_peak_traffic', 'trend_keywords', ['peak_traffic'])
    op.create_index('ix_trend_keywords_first_seen_at', 'trend_keywords', ['first_seen_at'])
    op.create_index('ix_trend_keywords_last_seen_at', 'trend_keywords', ['last_seen_at'])
    op.create_table(
        'trend_snapshots',
        sa.Column('keyword_id', sa.Integer(), nullable=False),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('traffic', sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(['keyword_id'], ['trend_keywords.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('keyword_id', 'day'),
    )
    op.create_table(
        'source_trends',
        sa.Column('source_id', sa.Integer(), nullable=False),
        sa.Column('keyword_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['source_id'], ['sources.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['keyword_id'], ['trend_keywords.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('source_id', 'keyword_id'),
    )
    op.create_index('ix_source_trends_keyword_id', 'source_trends', ['keyword_id'])


def downgrade() -> None:
    op.drop_index('ix_source_trends_keyword_id', table_name='source_trends')
    op.drop_table('source_trends')
    op.drop_table('trend_snapshots')
    op.drop_index('ix_trend_keywords_last_seen_at', table_name='trend_keywords')
    op.drop_index('ix_trend_keywords_first_seen_at', table_name='trend_keywords')
    op.drop_index('ix_trend_keywords_peak_traffic', table_name='trend_keywords')
    op.drop_index('ix_trend_keywords_niche', table_name='trend_keywords')
    op.drop_table('trend_keywords')

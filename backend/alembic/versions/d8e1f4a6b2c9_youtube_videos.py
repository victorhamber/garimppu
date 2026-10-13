"""youtube: organic videos, their daily view snapshots and the sources that found them

Revision ID: d8e1f4a6b2c9
Revises: c4f9a2b7d1e3
Create Date: 2026-10-13 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd8e1f4a6b2c9'
down_revision: Union[str, None] = 'c4f9a2b7d1e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'videos',
        sa.Column('id', sa.String(length=80), nullable=False),
        sa.Column('platform', sa.String(length=16), nullable=False),
        sa.Column('external_id', sa.String(length=64), nullable=False),
        sa.Column('channel_id', sa.String(length=64), nullable=True),
        sa.Column('channel_title', sa.String(length=255), nullable=True),
        sa.Column('channel_subscribers', sa.BigInteger(), nullable=True),
        sa.Column('title', sa.Text(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('thumbnail_url', sa.Text(), nullable=True),
        sa.Column('duration_s', sa.Integer(), nullable=True),
        sa.Column('is_short', sa.Boolean(), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('views', sa.BigInteger(), nullable=False),
        sa.Column('likes', sa.BigInteger(), nullable=True),
        sa.Column('comments', sa.BigInteger(), nullable=True),
        sa.Column('link_url', sa.Text(), nullable=True),
        sa.Column('offer_key', sa.String(length=255), nullable=True),
        sa.Column('offer_kind', sa.String(length=16), nullable=True),
        sa.Column('offer_platform', sa.String(length=32), nullable=True),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('velocity', sa.Float(), nullable=False),
        sa.Column('outlier', sa.Float(), nullable=True),
        sa.Column('engagement', sa.Float(), nullable=True),
        sa.Column('acceleration', sa.Float(), nullable=True),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_videos_platform', 'videos', ['platform'])
    op.create_index('ix_videos_channel_id', 'videos', ['channel_id'])
    op.create_index('ix_videos_published_at', 'videos', ['published_at'])
    op.create_index('ix_videos_offer_key', 'videos', ['offer_key'])
    op.create_index('ix_videos_score', 'videos', ['score'])
    op.create_table(
        'video_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('video_id', sa.String(length=80), nullable=False),
        sa.Column('taken_on', sa.Date(), nullable=False),
        sa.Column('taken_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('views', sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(['video_id'], ['videos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('video_id', 'taken_on'),
    )
    op.create_index('ix_video_snapshots_video_id', 'video_snapshots', ['video_id'])
    op.create_table(
        'source_videos',
        sa.Column('source_id', sa.Integer(), nullable=False),
        sa.Column('video_id', sa.String(length=80), nullable=False),
        sa.ForeignKeyConstraint(['source_id'], ['sources.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['video_id'], ['videos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('source_id', 'video_id'),
    )
    op.create_index('ix_source_videos_video_id', 'source_videos', ['video_id'])


def downgrade() -> None:
    op.drop_index('ix_source_videos_video_id', table_name='source_videos')
    op.drop_table('source_videos')
    op.drop_index('ix_video_snapshots_video_id', table_name='video_snapshots')
    op.drop_table('video_snapshots')
    for name in ('score', 'offer_key', 'published_at', 'channel_id', 'platform'):
        op.drop_index(f'ix_videos_{name}', table_name='videos')
    op.drop_table('videos')

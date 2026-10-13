"""videos: niche (same classifier as ads) and declared language

Revision ID: e3a7c5d9f1b2
Revises: d8e1f4a6b2c9
Create Date: 2026-10-13 02:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3a7c5d9f1b2'
down_revision: Union[str, None] = 'd8e1f4a6b2c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('videos', sa.Column('niche', sa.String(length=32), nullable=True))
    op.add_column('videos', sa.Column('language', sa.String(length=16), nullable=True))
    op.create_index('ix_videos_niche', 'videos', ['niche'])

    from app.pipeline.video_ingest import video_niche

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, title, description, channel_title, offer_key FROM videos")).all()
    for row in rows:
        niche = video_niche(row.title, row.description, row.channel_title, row.offer_key)
        if niche:
            bind.execute(sa.text("UPDATE videos SET niche = :niche WHERE id = :id"), {"niche": niche, "id": row.id})


def downgrade() -> None:
    op.drop_index('ix_videos_niche', table_name='videos')
    op.drop_column('videos', 'language')
    op.drop_column('videos', 'niche')

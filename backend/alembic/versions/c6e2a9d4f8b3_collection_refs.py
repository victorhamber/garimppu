"""videos, tiktok ads, sites and keywords saved in collections

Revision ID: c6e2a9d4f8b3
Revises: b4c8e1f3a6d9
Create Date: 2026-10-13 14:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c6e2a9d4f8b3'
down_revision: Union[str, None] = 'b4c8e1f3a6d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'collection_refs',
        sa.Column('collection_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('ref', sa.String(length=255), nullable=False),
        sa.Column('added_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['collection_id'], ['collections.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('collection_id', 'kind', 'ref'),
    )


def downgrade() -> None:
    op.drop_table('collection_refs')

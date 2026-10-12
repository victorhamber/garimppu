"""offers saved in collections

Revision ID: f2c8d4e6a9b1
Revises: e7b3c9a1f5d2
Create Date: 2026-10-12 21:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2c8d4e6a9b1'
down_revision: Union[str, None] = 'e7b3c9a1f5d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'collection_offers',
        sa.Column('collection_id', sa.Integer(), nullable=False),
        sa.Column('offer_key', sa.String(length=255), nullable=False),
        sa.Column('added_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['collection_id'], ['collections.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('collection_id', 'offer_key'),
    )


def downgrade() -> None:
    op.drop_table('collection_offers')

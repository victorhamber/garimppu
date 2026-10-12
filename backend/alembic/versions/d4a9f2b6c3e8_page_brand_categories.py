"""page big_brand flag and categories

Revision ID: d4a9f2b6c3e8
Revises: c8d2e5f4a1b7
Create Date: 2026-10-12 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4a9f2b6c3e8'
down_revision: Union[str, None] = 'c8d2e5f4a1b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Plain ADD COLUMN: a batch rebuild of `pages` would drop a table that `ads` references.
    op.add_column('pages', sa.Column('categories', sa.JSON(), nullable=True))
    op.add_column('pages', sa.Column('big_brand', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index(op.f('ix_pages_big_brand'), 'pages', ['big_brand'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('pages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_pages_big_brand'))
        batch_op.drop_column('big_brand')
        batch_op.drop_column('categories')

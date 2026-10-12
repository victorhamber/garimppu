"""search by page

Revision ID: b3f1a7c2d9e4
Revises: 92675c5d0ded
Create Date: 2026-10-12 11:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3f1a7c2d9e4'
down_revision: Union[str, None] = '92675c5d0ded'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('searches', schema=None) as batch_op:
        batch_op.add_column(sa.Column('page_id', sa.String(length=64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('searches', schema=None) as batch_op:
        batch_op.drop_column('page_id')

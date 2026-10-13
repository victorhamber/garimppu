"""personal key for the browser extension

Revision ID: a7e4c1d9b2f6
Revises: c6e2a9d4f8b3
Create Date: 2026-10-13 18:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7e4c1d9b2f6'
down_revision: Union[str, None] = 'c6e2a9d4f8b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'extension_tokens',
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('token_hash'),
        sa.UniqueConstraint('user_id'),
    )


def downgrade() -> None:
    op.drop_table('extension_tokens')

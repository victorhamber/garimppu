"""extension: e-mail leads replace the personal key

Revision ID: b8f3d6a2c5e1
Revises: a7e4c1d9b2f6
Create Date: 2026-10-13 19:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8f3d6a2c5e1'
down_revision: Union[str, None] = 'a7e4c1d9b2f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'extension_leads',
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('email'),
    )
    op.drop_table('extension_tokens')


def downgrade() -> None:
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
    op.drop_table('extension_leads')

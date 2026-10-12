"""admin-editable settings (webhook, e-mail) and password reset links

Revision ID: c4f9a2b7d1e3
Revises: a1d5e8f2c7b4
Create Date: 2026-10-12 23:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4f9a2b7d1e3'
down_revision: Union[str, None] = 'a1d5e8f2c7b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'app_settings',
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('value', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('key'),
    )
    op.create_table(
        'password_resets',
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('token_hash'),
    )
    op.create_index('ix_password_resets_user_id', 'password_resets', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_password_resets_user_id', table_name='password_resets')
    op.drop_table('password_resets')
    op.drop_table('app_settings')

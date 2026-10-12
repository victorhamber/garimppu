"""accounts: users, login sessions, license events; searches and collections get an owner

Revision ID: a1d5e8f2c7b4
Revises: f2c8d4e6a9b1
Create Date: 2026-10-12 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1d5e8f2c7b4'
down_revision: Union[str, None] = 'f2c8d4e6a9b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=True),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('is_admin', sa.Boolean(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_table(
        'auth_sessions',
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('token_hash'),
    )
    op.create_index('ix_auth_sessions_user_id', 'auth_sessions', ['user_id'])
    op.create_table(
        'license_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('origin', sa.String(length=32), nullable=False),
        sa.Column('action', sa.String(length=32), nullable=False),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_license_events_user_id', 'license_events', ['user_id'])

    with op.batch_alter_table('searches') as batch:
        batch.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch.create_index('ix_searches_user_id', ['user_id'])
        batch.create_foreign_key('fk_searches_user_id', 'users', ['user_id'], ['id'], ondelete='CASCADE')
        batch.create_foreign_key('fk_searches_source_id', 'sources', ['source_id'], ['id'])

    # Collection names become unique per user ("Favoritos" exists once for each account).
    # copy_from describes the current table without its old global UNIQUE(name), which SQLite left unnamed.
    current = sa.Table(
        'collections', sa.MetaData(),
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    with op.batch_alter_table('collections', recreate='always', copy_from=current) as batch:
        batch.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch.create_index('ix_collections_user_id', ['user_id'])
        batch.create_foreign_key('fk_collections_user_id', 'users', ['user_id'], ['id'], ondelete='CASCADE')
        batch.create_unique_constraint('uq_collections_user_name', ['user_id', 'name'])


def downgrade() -> None:
    raise NotImplementedError("Restaure um backup do banco para voltar ao modelo sem contas.")

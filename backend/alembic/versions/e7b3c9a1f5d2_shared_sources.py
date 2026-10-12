"""shared collection: sources own runs and ads, searches subscribe to them

Revision ID: e7b3c9a1f5d2
Revises: d4a9f2b6c3e8
Create Date: 2026-10-12 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.pipeline.sources import source_key


revision: str = 'e7b3c9a1f5d2'
down_revision: Union[str, None] = 'd4a9f2b6c3e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MIN_REFRESH_HOURS = 6


def upgrade() -> None:
    op.create_table(
        'sources',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('key', sa.String(length=400), nullable=False),
        sa.Column('term', sa.String(length=255), nullable=False),
        sa.Column('page_id', sa.String(length=64), nullable=True),
        sa.Column('country', sa.String(length=8), nullable=False),
        sa.Column('language', sa.String(length=8), nullable=True),
        sa.Column('media_type', sa.String(length=16), nullable=False),
        sa.Column('collector', sa.String(length=16), nullable=False),
        sa.Column('max_ads', sa.Integer(), nullable=False),
        sa.Column('refresh_hours', sa.Integer(), nullable=True),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key'),
    )
    op.create_table(
        'source_runs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('source_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ads_found', sa.Integer(), nullable=False),
        sa.Column('creatives_found', sa.Integer(), nullable=False),
        sa.Column('log', sa.Text(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['source_id'], ['sources.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_source_runs_source_id', 'source_runs', ['source_id'])
    op.create_table(
        'source_ads',
        sa.Column('source_id', sa.Integer(), nullable=False),
        sa.Column('ad_archive_id', sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(['ad_archive_id'], ['ads.ad_archive_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['source_id'], ['sources.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('source_id', 'ad_archive_id'),
    )
    op.create_index('ix_source_ads_ad_archive_id', 'source_ads', ['ad_archive_id'])
    op.add_column('searches', sa.Column('source_id', sa.Integer(), nullable=True))

    conn = op.get_bind()
    searches = conn.execute(sa.text(
        "SELECT id, term, page_id, country, language, media_type, source, max_ads, refresh_hours, "
        "is_active, last_run_at, created_at FROM searches ORDER BY id"
    )).mappings().all()
    source_ids: dict[str, int] = {}
    for s in searches:
        key = source_key(term=s['term'], page_id=s['page_id'], country=s['country'],
                         language=s['language'], media_type=s['media_type'])
        if key not in source_ids:
            conn.execute(sa.text(
                "INSERT INTO sources (key, term, page_id, country, language, media_type, collector, max_ads, "
                "refresh_hours, last_run_at, created_at) VALUES (:key, :term, :page_id, :country, :language, "
                ":media_type, :collector, :max_ads, NULL, NULL, :created_at)"
            ), dict(key=key, term=s['term'], page_id=s['page_id'], country=s['country'].upper(),
                    language=s['language'], media_type=s['media_type'], collector=s['source'],
                    max_ads=s['max_ads'], created_at=s['created_at']))
            source_ids[key] = conn.execute(sa.text("SELECT id FROM sources WHERE key = :key"), {'key': key}).scalar()
        conn.execute(sa.text("UPDATE searches SET source_id = :sid WHERE id = :id"),
                     {'sid': source_ids[key], 'id': s['id']})

    conn.execute(sa.text(
        "INSERT INTO source_runs (id, source_id, status, started_at, finished_at, ads_found, creatives_found, "
        "log, error, created_at) SELECT r.id, s.source_id, r.status, r.started_at, r.finished_at, r.ads_found, "
        "r.creatives_found, r.log, r.error, r.created_at FROM search_runs r JOIN searches s ON s.id = r.search_id"
    ))
    conn.execute(sa.text(
        "INSERT OR IGNORE INTO source_ads (source_id, ad_archive_id) SELECT s.source_id, a.ad_archive_id "
        "FROM search_ads a JOIN searches s ON s.id = a.search_id"
    ) if conn.dialect.name == 'sqlite' else sa.text(
        "INSERT INTO source_ads (source_id, ad_archive_id) SELECT DISTINCT s.source_id, a.ad_archive_id "
        "FROM search_ads a JOIN searches s ON s.id = a.search_id ON CONFLICT DO NOTHING"
    ))
    # Derived settings: earliest creation, latest run, largest max_ads, most frequent refresh (floored).
    conn.execute(sa.text(
        "UPDATE sources SET "
        "created_at = (SELECT MIN(created_at) FROM searches WHERE source_id = sources.id), "
        "last_run_at = (SELECT MAX(last_run_at) FROM searches WHERE source_id = sources.id), "
        "max_ads = (SELECT MAX(max_ads) FROM searches WHERE source_id = sources.id)"
    ))
    conn.execute(sa.text(
        "UPDATE sources SET refresh_hours = (SELECT MAX(MIN(refresh_hours), :floor) FROM searches "
        "WHERE source_id = sources.id AND is_active AND refresh_hours IS NOT NULL)"
    ) if conn.dialect.name == 'sqlite' else sa.text(
        "UPDATE sources SET refresh_hours = (SELECT GREATEST(MIN(refresh_hours), :floor) FROM searches "
        "WHERE source_id = sources.id AND is_active AND refresh_hours IS NOT NULL)"
    ), {'floor': MIN_REFRESH_HOURS})

    op.drop_index('ix_search_ads_ad_archive_id', table_name='search_ads')
    op.drop_table('search_ads')
    op.drop_index('ix_search_runs_search_id', table_name='search_runs')
    op.drop_table('search_runs')
    # Plain DROP COLUMN (SQLite >= 3.35): a batch rebuild of `searches` is unnecessary now that nothing references it.
    for column in ('page_id', 'country', 'language', 'media_type', 'source', 'last_run_at'):
        op.drop_column('searches', column)
    op.create_index('ix_searches_source_id', 'searches', ['source_id'])


def downgrade() -> None:
    raise NotImplementedError("Restaure o backup data/miner.backup-pre-shared.db para voltar ao modelo anterior.")

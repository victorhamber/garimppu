"""ad offers

Revision ID: c8d2e5f4a1b7
Revises: b3f1a7c2d9e4
Create Date: 2026-10-12 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.pipeline.offers import classify_destination


revision: str = 'c8d2e5f4a1b7'
down_revision: Union[str, None] = 'b3f1a7c2d9e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('ads', schema=None) as batch_op:
        batch_op.add_column(sa.Column('offer_key', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('offer_kind', sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column('offer_platform', sa.String(length=32), nullable=True))
        batch_op.create_index(batch_op.f('ix_ads_offer_key'), ['offer_key'], unique=False)

    bind = op.get_bind()
    ads = sa.table('ads', sa.column('ad_archive_id'), sa.column('link_url'), sa.column('page_id'),
                   sa.column('offer_key'), sa.column('offer_kind'), sa.column('offer_platform'))
    rows = bind.execute(sa.select(ads.c.ad_archive_id, ads.c.link_url, ads.c.page_id)
                        .where(ads.c.link_url.is_not(None))).all()
    for ad_id, link_url, page_id in rows:
        offer = classify_destination(link_url, page_id)
        if offer:
            bind.execute(ads.update().where(ads.c.ad_archive_id == ad_id).values(
                offer_key=offer.key[:255], offer_kind=offer.kind, offer_platform=offer.platform))


def downgrade() -> None:
    with op.batch_alter_table('ads', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_ads_offer_key'))
        batch_op.drop_column('offer_platform')
        batch_op.drop_column('offer_kind')
        batch_op.drop_column('offer_key')

"""Recompute every ad's offer after changing the rules in app/pipeline/offers.py.

    python -m app.reclassify_offers
"""

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Ad
from app.pipeline.offers import set_offer


def main() -> None:
    with SessionLocal() as db:
        ads = list(db.scalars(select(Ad)))
        for ad in ads:
            set_offer(ad)
        db.commit()
        print(f"{len(ads)} anúncios reclassificados")


if __name__ == "__main__":
    main()

"""Recompute every creative's niche and every page's big-brand flag after changing
app/pipeline/niche.py or app/pipeline/brands.py.

    python -m app.reclassify_niches

Niches come only from the classifier: creatives are shared by every search, so a search's
niche is a personal filter and never written onto them.
"""

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db import SessionLocal
from app.models import Ad, Creative
from app.pipeline.brands import refresh_big_brands
from app.pipeline.niche import NicheSignals, classify_signals


def main() -> None:
    with SessionLocal() as db:
        creatives = db.scalars(select(Creative).options(selectinload(Creative.ads).selectinload(Ad.page)))
        changed, totals = 0, Counter()
        for creative in creatives:
            ads = creative.ads
            page = next((a.page for a in ads if a.page), None)
            niche = classify_signals(NicheSignals(
                texts=[t for a in ads for t in (a.body, a.title, a.caption)],
                page_name=page.name if page else None,
                offer_keys=[a.offer_key for a in ads],
                categories=page.categories if page else None,
            ))
            changed += niche != creative.niche
            creative.niche = niche
            totals[niche or "sem nicho"] += 1
        brands = refresh_big_brands(db)
        db.commit()
        print(f"{sum(totals.values())} criativos, {changed} mudaram de nicho; {brands} páginas de marca grande")
        for niche, count in totals.most_common():
            print(f"  {niche}: {count}")


if __name__ == "__main__":
    main()

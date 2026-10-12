from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Ad, Creative, CreativeScore, Page
from app.pipeline.niche import niche_options
from app.schemas import PageOut

router = APIRouter(prefix="/api", tags=["pages"])


@router.get("/pages/{page_id}", response_model=PageOut)
def get_page(page_id: str, db: Session = Depends(get_db)):
    page = db.get(Page, page_id)
    if page is None:
        raise HTTPException(404, "Anunciante não encontrado")
    return page


@router.get("/niches")
def list_niches():
    return niche_options()


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    return {
        "ads": db.scalar(select(func.count()).select_from(Ad)) or 0,
        "creatives": db.scalar(select(func.count()).select_from(Creative)) or 0,
        "active_creatives": db.scalar(
            select(func.count()).select_from(CreativeScore).where(CreativeScore.is_active.is_(True))
        ) or 0,
        "pages": db.scalar(select(func.count()).select_from(Page)) or 0,
    }

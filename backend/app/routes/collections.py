from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import current_user
from app.db import get_db
from app.models import Ad, Collection, CollectionItem, CollectionOffer, Creative, User
from app.schemas import CollectionCreate, CollectionItemCreate, CollectionOfferCreate, CollectionOut

router = APIRouter(prefix="/api/collections", tags=["collections"])
DEFAULT_COLLECTION = "Favoritos"


def ensure_default_collection(db: Session, user: User) -> None:
    exists = db.scalar(select(Collection.id).where(Collection.user_id == user.id, Collection.name == DEFAULT_COLLECTION))
    if exists is None:
        db.add(Collection(user_id=user.id, name=DEFAULT_COLLECTION))
        db.flush()


def user_collection_ids(user: User):
    return select(Collection.id).where(Collection.user_id == user.id)


def _out(db: Session, collection: Collection) -> CollectionOut:
    out = CollectionOut.model_validate(collection)
    out.items_count = db.scalar(
        select(func.count()).select_from(CollectionItem).where(CollectionItem.collection_id == collection.id)
    ) or 0
    out.offers_count = db.scalar(
        select(func.count()).select_from(CollectionOffer).where(CollectionOffer.collection_id == collection.id)
    ) or 0
    return out


def _get(db: Session, collection_id: int, user: User) -> Collection:
    collection = db.get(Collection, collection_id)
    if collection is None or collection.user_id != user.id:
        raise HTTPException(404, "Coleção não encontrada")
    return collection


@router.get("", response_model=list[CollectionOut])
def list_collections(db: Session = Depends(get_db), user: User = Depends(current_user)):
    ensure_default_collection(db, user)
    db.commit()
    collections = db.scalars(select(Collection).where(Collection.user_id == user.id).order_by(Collection.id))
    return [_out(db, c) for c in collections]


@router.post("", response_model=CollectionOut, status_code=201)
def create_collection(payload: CollectionCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    collection = Collection(user_id=user.id, name=payload.name.strip())
    db.add(collection)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Já existe uma coleção com esse nome")
    return _out(db, collection)


@router.get("/{collection_id}", response_model=CollectionOut)
def get_collection(collection_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return _out(db, _get(db, collection_id, user))


@router.delete("/{collection_id}", status_code=204)
def delete_collection(collection_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(_get(db, collection_id, user))
    db.commit()


@router.post("/{collection_id}/items", status_code=204)
def add_item(collection_id: int, payload: CollectionItemCreate, db: Session = Depends(get_db),
             user: User = Depends(current_user)):
    _get(db, collection_id, user)
    if db.get(Creative, payload.creative_id) is None:
        raise HTTPException(404, "Criativo não encontrado")
    item = db.get(CollectionItem, (collection_id, payload.creative_id))
    if item is None:
        db.add(CollectionItem(collection_id=collection_id, creative_id=payload.creative_id, note=payload.note))
    else:
        item.note = payload.note
    db.commit()


@router.delete("/{collection_id}/items/{creative_id}", status_code=204)
def remove_item(collection_id: int, creative_id: int, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    _get(db, collection_id, user)
    item = db.get(CollectionItem, (collection_id, creative_id))
    if item is not None:
        db.delete(item)
        db.commit()


@router.post("/{collection_id}/offers", status_code=204)
def add_offer(collection_id: int, payload: CollectionOfferCreate, db: Session = Depends(get_db),
              user: User = Depends(current_user)):
    _get(db, collection_id, user)
    if db.scalar(select(Ad.ad_archive_id).where(Ad.offer_key == payload.offer_key).limit(1)) is None:
        raise HTTPException(404, "Oferta não encontrada")
    if db.get(CollectionOffer, (collection_id, payload.offer_key)) is None:
        db.add(CollectionOffer(collection_id=collection_id, offer_key=payload.offer_key))
        db.commit()


# Offer keys contain "/" and ":", so the key travels in the query string instead of the path.
@router.delete("/{collection_id}/offers", status_code=204)
def remove_offer(collection_id: int, offer_key: str, db: Session = Depends(get_db),
                 user: User = Depends(current_user)):
    _get(db, collection_id, user)
    item = db.get(CollectionOffer, (collection_id, offer_key))
    if item is not None:
        db.delete(item)
        db.commit()

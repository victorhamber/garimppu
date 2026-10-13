from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import current_user
from app.db import get_db
from app.models import Ad, Collection, CollectionItem, CollectionOffer, CollectionRef, Creative, TikTokAd, TrendKeyword, User, Video
from app.schemas import CollectionCreate, CollectionItemCreate, CollectionOfferCreate, CollectionOut, CollectionRefCreate, RefKind

router = APIRouter(prefix="/api/collections", tags=["collections"])
DEFAULT_COLLECTION = "Favoritos"


def ensure_default_collection(db: Session, user: User) -> None:
    exists = db.scalar(select(Collection.id).where(Collection.user_id == user.id, Collection.name == DEFAULT_COLLECTION))
    if exists is None:
        db.add(Collection(user_id=user.id, name=DEFAULT_COLLECTION))
        db.flush()


def user_collection_ids(user: User):
    return select(Collection.id).where(Collection.user_id == user.id)


def saved_refs(collection_id: int, kind: RefKind, user: User):
    """Refs of one kind in one of the user's collections, for a list endpoint's collection_id filter."""
    return select(CollectionRef.ref).where(
        CollectionRef.collection_id == collection_id,
        CollectionRef.kind == kind,
        CollectionRef.collection_id.in_(user_collection_ids(user)),
    )


def collections_by_ref(db: Session, kind: RefKind, refs: list[str], user: User) -> dict[str, list[int]]:
    result: dict[str, list[int]] = {}
    if not refs:
        return result
    for ref, coll in db.execute(
        select(CollectionRef.ref, CollectionRef.collection_id).where(
            CollectionRef.kind == kind,
            CollectionRef.ref.in_(refs),
            CollectionRef.collection_id.in_(user_collection_ids(user)),
        )
    ):
        result.setdefault(ref, []).append(coll)
    return result


def _ref_exists(db: Session, kind: RefKind, ref: str) -> bool:
    if kind == "video":
        return db.get(Video, ref) is not None
    if kind == "tiktok":
        return db.get(TikTokAd, ref) is not None
    if kind == "keyword":
        return ref.isdigit() and db.get(TrendKeyword, int(ref)) is not None
    site_ads = select(Ad.ad_archive_id).where((Ad.offer_key == ref) | Ad.offer_key.like(f"{ref}/%")).limit(1)
    return db.scalar(site_ads) is not None


def _out(db: Session, collection: Collection) -> CollectionOut:
    out = CollectionOut.model_validate(collection)
    out.items_count = db.scalar(
        select(func.count()).select_from(CollectionItem).where(CollectionItem.collection_id == collection.id)
    ) or 0
    out.offers_count = db.scalar(
        select(func.count()).select_from(CollectionOffer).where(CollectionOffer.collection_id == collection.id)
    ) or 0
    out.refs_count = db.scalar(
        select(func.count()).select_from(CollectionRef).where(CollectionRef.collection_id == collection.id)
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


@router.patch("/{collection_id}", response_model=CollectionOut)
def rename_collection(collection_id: int, payload: CollectionCreate, db: Session = Depends(get_db),
                      user: User = Depends(current_user)):
    collection = _get(db, collection_id, user)
    name = payload.name.strip()
    if not name:
        raise HTTPException(422, "Dê um nome à coleção")
    if collection.name == DEFAULT_COLLECTION or name == DEFAULT_COLLECTION:
        raise HTTPException(409, f'"{DEFAULT_COLLECTION}" é a coleção da estrela e não muda de nome')
    collection.name = name
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Já existe uma coleção com esse nome")
    return _out(db, collection)


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


@router.post("/{collection_id}/refs", status_code=204)
def add_ref(collection_id: int, payload: CollectionRefCreate, db: Session = Depends(get_db),
            user: User = Depends(current_user)):
    _get(db, collection_id, user)
    if not _ref_exists(db, payload.kind, payload.ref):
        raise HTTPException(404, "Item não encontrado")
    if db.get(CollectionRef, (collection_id, payload.kind, payload.ref)) is None:
        db.add(CollectionRef(collection_id=collection_id, kind=payload.kind, ref=payload.ref))
        db.commit()


@router.delete("/{collection_id}/refs", status_code=204)
def remove_ref(collection_id: int, kind: RefKind, ref: str, db: Session = Depends(get_db),
               user: User = Depends(current_user)):
    _get(db, collection_id, user)
    item = db.get(CollectionRef, (collection_id, kind, ref))
    if item is not None:
        db.delete(item)
        db.commit()

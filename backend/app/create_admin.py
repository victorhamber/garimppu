"""Create (or promote) an administrator and hand them the searches and collections made before accounts.

    python -m app.create_admin voce@exemplo.com
    python -m app.create_admin voce@exemplo.com --senha-provisoria   # gera e mostra uma senha
"""

import getpass
import sys

from sqlalchemy import select, update

from sqlalchemy.orm import Session

from app.auth import end_user_sessions, find_user, hash_password, normalize_email, temporary_password, verify_password
from app.config import get_settings
from app.db import SessionLocal
from app.licenses import log_event
from app.models import Collection, Search, Source, User
from app.pipeline.sources import sync_source
from app.routes.collections import DEFAULT_COLLECTION, ensure_default_collection


def sync_env_admin(db: Session) -> None:
    """ADMIN_EMAIL + ADMIN_PASSWORD in the environment: that account is an active admin with that password."""
    settings = get_settings()
    if not (settings.admin_email and settings.admin_password):
        return
    email = normalize_email(settings.admin_email)
    user = find_user(db, email)
    if user is None:
        user = User(email=email, password_hash=hash_password(settings.admin_password), is_admin=True, is_active=True)
        db.add(user)
        db.flush()
        ensure_default_collection(db, user)
        log_event(db, email, "admin", "created", user, "administrador via ADMIN_EMAIL/ADMIN_PASSWORD")
    else:
        user.is_admin = True
        user.is_active = True
        if not verify_password(settings.admin_password, user.password_hash):
            user.password_hash = hash_password(settings.admin_password)
            end_user_sessions(db, user.id)
            log_event(db, email, "admin", "password", user, "senha definida por ADMIN_PASSWORD")
    db.commit()


def _ask_password() -> str:
    password = getpass.getpass("Senha do administrador (mín. 8 caracteres): ")
    if len(password) < 8:
        sys.exit("Senha muito curta.")
    if password != getpass.getpass("Repita a senha: "):
        sys.exit("As senhas não conferem.")
    return password


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    generate = "--senha-provisoria" in sys.argv
    if len(args) != 1:
        sys.exit("Uso: python -m app.create_admin <email> [--senha-provisoria]")
    email = normalize_email(args[0])
    password = temporary_password() if generate else _ask_password()

    with SessionLocal() as db:
        user = find_user(db, email)
        if user is None:
            user = User(email=email, password_hash="", is_admin=True, is_active=True)
            db.add(user)
        user.is_admin = True
        user.is_active = True
        user.password_hash = hash_password(password)
        db.flush()

        searches = db.execute(update(Search).where(Search.user_id.is_(None)).values(user_id=user.id)).rowcount
        # The old global "Favoritos" becomes this admin's, unless they already have one.
        has_favorites = db.scalar(
            select(Collection.id).where(Collection.user_id == user.id, Collection.name == DEFAULT_COLLECTION)
        )
        orphans = select(Collection.id).where(Collection.user_id.is_(None))
        if has_favorites:
            orphans = orphans.where(Collection.name != DEFAULT_COLLECTION)
        collections = db.execute(
            update(Collection).where(Collection.id.in_(orphans)).values(user_id=user.id)
        ).rowcount
        ensure_default_collection(db, user)
        log_event(db, email, "admin", "created", user, "administrador via linha de comando")
        db.flush()
        for source in db.scalars(select(Source)):
            sync_source(db, source)
        db.commit()
        print(f"Administrador pronto: {email}. Buscas assumidas: {searches}; coleções assumidas: {collections}.")
        if generate:
            print(f"Senha provisória: {password}  (troque em Minha conta depois de entrar)")


if __name__ == "__main__":
    main()

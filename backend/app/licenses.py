"""Granting and revoking licenses, shared by the admin panel and the purchase webhook."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import end_user_sessions, find_user, hash_password, normalize_email, temporary_password
from app.mailer import send_access_email
from app.models import LicenseEvent, Search, Source, User
from app.pipeline.sources import sync_source
from app.routes.collections import ensure_default_collection


@dataclass
class Granted:
    user: User
    created: bool
    password: str | None = None  # set when a new password exists and the e-mail did not carry it
    emailed: bool = False


def log_event(db: Session, email: str, origin: str, action: str, user: User | None = None,
              detail: str | None = None) -> None:
    db.add(LicenseEvent(user_id=user.id if user else None, email=email, origin=origin, action=action, detail=detail))


def resync_sources(db: Session, user: User) -> None:
    """A license change turns the user's searches on or off as collection demand."""
    for source in db.scalars(select(Source).where(Source.id.in_(select(Search.source_id).where(Search.user_id == user.id)))):
        sync_source(db, source)


def issue_password(db: Session, user: User, reset: bool) -> tuple[str | None, bool]:
    password = temporary_password()
    user.password_hash = hash_password(password)
    if reset:
        end_user_sessions(db, user.id)
    emailed = send_access_email(db, user.email, user.name, password)
    return (None if emailed else password), emailed


def grant(db: Session, email: str, origin: str, name: str | None = None, detail: str | None = None,
          send_email: bool = True) -> Granted:
    email = normalize_email(email)
    user = find_user(db, email)
    if user is None:
        user = User(email=email, name=name, password_hash="", is_active=True)
        db.add(user)
        db.flush()
        ensure_default_collection(db, user)
        password = temporary_password()
        user.password_hash = hash_password(password)
        emailed = send_email and send_access_email(db, email, name, password)
        log_event(db, email, origin, "created", user, detail)
        db.commit()
        return Granted(user, created=True, password=None if emailed else password, emailed=emailed)

    user.is_active = True
    if name and not user.name:
        user.name = name
    log_event(db, email, origin, "granted", user, detail)
    db.flush()
    resync_sources(db, user)
    db.commit()
    return Granted(user, created=False)


def revoke(db: Session, email: str, origin: str, detail: str | None = None) -> User | None:
    user = find_user(db, email)
    if user is None or user.is_admin:
        log_event(db, normalize_email(email), origin, "ignored", user,
                  detail or ("administrador" if user else "e-mail sem licença"))
        db.commit()
        return None
    user.is_active = False
    end_user_sessions(db, user.id)
    log_event(db, user.email, origin, "revoked", user, detail)
    db.flush()
    resync_sources(db, user)
    db.commit()
    return user

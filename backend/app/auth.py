"""Passwords, login sessions and the request dependencies that require a licensed user or an admin."""

import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import AuthSession, ExtensionToken, User, utcnow

COOKIE_NAME = "garimppu_session"
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**14, 8, 1
PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, digest = stored.split("$")
        candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p))
    except ValueError:
        return False
    return hmac.compare_digest(candidate.hex(), digest)


def temporary_password() -> str:
    """12 characters without look-alikes (0/O, 1/l/I), easy to type from an e-mail."""
    return "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(12))


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: Session, user: User, response: Response) -> None:
    settings = get_settings()
    token = secrets.token_urlsafe(32)
    db.add(AuthSession(token_hash=_token_hash(token), user_id=user.id,
                       expires_at=utcnow() + timedelta(days=settings.session_days)))
    user.last_login_at = utcnow()
    db.commit()
    response.set_cookie(
        COOKIE_NAME, token, max_age=settings.session_days * 86400, httponly=True, samesite="lax",
        secure=settings.cookie_secure, domain=settings.cookie_domain, path="/",
    )


def end_session(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == _token_hash(token)))
        db.commit()
    response.delete_cookie(COOKIE_NAME, domain=get_settings().cookie_domain, path="/")


def end_user_sessions(db: Session, user_id: int) -> None:
    db.execute(delete(AuthSession).where(AuthSession.user_id == user_id))


def access_problem(user: User) -> str | None:
    if user.has_access:
        return None
    return "Sua licença expirou." if user.is_active else "Sua licença está bloqueada."


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    session = db.get(AuthSession, _token_hash(token)) if token else None
    if session is None:
        raise HTTPException(401, "Faça login para continuar.")
    expires = session.expires_at if session.expires_at.tzinfo else session.expires_at.replace(tzinfo=utcnow().tzinfo)
    if expires <= utcnow():
        db.delete(session)
        db.commit()
        raise HTTPException(401, "Sua sessão expirou. Faça login novamente.")
    problem = access_problem(session.user)
    if problem:
        # 401 (not 403): the client must leave the app; 403 stays reserved for "not an admin".
        raise HTTPException(401, f"{problem} Fale com o suporte para renovar o acesso.")
    return session.user


EXTENSION_TOKEN_PREFIX = "gp_"


def new_extension_token(db: Session, user: User) -> str:
    token = EXTENSION_TOKEN_PREFIX + secrets.token_urlsafe(32)
    db.execute(delete(ExtensionToken).where(ExtensionToken.user_id == user.id))
    db.add(ExtensionToken(token_hash=_token_hash(token), user_id=user.id))
    db.commit()
    return token


def extension_user(request: Request, db: Session = Depends(get_db)) -> User:
    """The browser extension authenticates with `Authorization: Bearer gp_...` instead of the session cookie."""
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    row = db.get(ExtensionToken, _token_hash(token.strip())) if scheme.lower() == "bearer" and token else None
    if row is None:
        raise HTTPException(401, "Chave da extensão inválida. Gere uma nova no Garimppu.")
    problem = access_problem(row.user)
    if problem:
        raise HTTPException(401, f"{problem} Fale com o suporte para renovar o acesso.")
    row.last_used_at = utcnow()
    db.commit()
    return row.user


def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(403, "Área restrita a administradores.")
    return user


class LoginThrottle:
    """In-process sliding window; enough for a single API process (move to Redis with several workers)."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def blocked(self, *keys: str) -> bool:
        settings = get_settings()
        window = settings.login_window_minutes * 60
        now = time.monotonic()
        for key in keys:
            hits = self._hits[key]
            while hits and now - hits[0] > window:
                hits.popleft()
            if len(hits) >= settings.login_max_attempts:
                return True
        return False

    def fail(self, *keys: str) -> None:
        now = time.monotonic()
        for key in keys:
            self._hits[key].append(now)

    def clear(self, key: str) -> None:
        self._hits.pop(key, None)


login_throttle = LoginThrottle()


def purge_expired_sessions(db: Session) -> None:
    db.execute(delete(AuthSession).where(AuthSession.expires_at <= utcnow()))
    db.commit()


def find_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))

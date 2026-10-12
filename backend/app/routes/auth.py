import hashlib
import secrets
from datetime import timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.auth import (
    access_problem,
    current_user,
    end_session,
    end_user_sessions,
    find_user,
    hash_password,
    login_throttle,
    normalize_email,
    start_session,
    verify_password,
)
from app.config import get_settings
from app.db import get_db
from app.licenses import log_event
from app.mailer import email_configured, send_reset_email
from app.models import PasswordReset, User, utcnow
from app.schemas import ForgotPasswordIn, LoginIn, MeOut, PasswordChange, ResetPasswordIn

router = APIRouter(prefix="/api/auth", tags=["auth"])

WRONG_CREDENTIALS = "E-mail ou senha incorretos."
RESET_TTL = timedelta(hours=1)


def _client_key(request: Request) -> str:
    return f"ip:{request.client.host if request.client else '-'}"


@router.post("/login", response_model=MeOut)
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    ip_key = _client_key(request)
    email_key = f"email:{email}"
    if login_throttle.blocked(ip_key, email_key):
        raise HTTPException(429, "Muitas tentativas de login. Aguarde alguns minutos e tente de novo.")
    user = find_user(db, email)
    if user is None or not verify_password(payload.password, user.password_hash):
        login_throttle.fail(ip_key, email_key)
        raise HTTPException(401, WRONG_CREDENTIALS)
    problem = access_problem(user)
    if problem:
        raise HTTPException(403, f"{problem} Fale com o suporte para renovar o acesso.")
    login_throttle.clear(email_key)
    start_session(db, user, response)
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    end_session(db, request, response)


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(current_user)):
    return user


@router.post("/password", status_code=204)
def change_password(payload: PasswordChange, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "A senha atual não confere.")
    user.password_hash = hash_password(payload.new_password)
    db.commit()


def _reset_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/forgot", status_code=204)
def forgot_password(payload: ForgotPasswordIn, request: Request, db: Session = Depends(get_db)):
    """Same answer whether or not the e-mail has a license, so the form cannot be used to probe customers."""
    ip_key = f"forgot:{_client_key(request)}"
    if login_throttle.blocked(ip_key):
        raise HTTPException(429, "Muitos pedidos. Aguarde alguns minutos e tente de novo.")
    login_throttle.fail(ip_key)
    if not email_configured(db):
        raise HTTPException(503, "A recuperação por e-mail não está disponível. Fale com o suporte para receber uma nova senha.")
    user = find_user(db, normalize_email(payload.email))
    if user is None or not user.has_access:
        return
    token = secrets.token_urlsafe(32)
    db.add(PasswordReset(token_hash=_reset_hash(token), user_id=user.id, expires_at=utcnow() + RESET_TTL))
    db.commit()
    link = f"{get_settings().app_url.rstrip('/')}/redefinir-senha?token={token}"
    send_reset_email(db, user.email, user.name, link)


@router.post("/reset", response_model=MeOut)
def reset_password(payload: ResetPasswordIn, response: Response, db: Session = Depends(get_db)):
    reset = db.get(PasswordReset, _reset_hash(payload.token))
    expires = reset.expires_at if reset else None
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if reset is None or reset.used_at is not None or expires <= utcnow():
        raise HTTPException(400, "Este link expirou ou já foi usado. Peça um novo em Esqueci minha senha.")
    user = reset.user
    problem = access_problem(user)
    if problem:
        raise HTTPException(403, f"{problem} Fale com o suporte para renovar o acesso.")
    user.password_hash = hash_password(payload.new_password)
    db.execute(update(PasswordReset).where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None))
               .values(used_at=utcnow()))
    end_user_sessions(db, user.id)
    log_event(db, user.email, "cliente", "password", user, "senha redefinida pelo link de e-mail")
    start_session(db, user, response)
    return user

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.app_settings import SECRET_KEYS, email_config, new_webhook_secret, save, webhook_config, webhook_url
from app.auth import admin_user, end_user_sessions, find_user
from app.db import get_db
from app.licenses import grant, issue_password, log_event, resync_sources
from app.mailer import MailError, access_values, deliver, email_configured, render
from app.models import LicenseEvent, Search, Source, User
from app.pipeline.sources import sync_source
from app.schemas import (
    AccessIssued,
    AdminSettingsOut,
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    EmailSettingsIn,
    EmailSettingsOut,
    EmailTestOut,
    LicenseEventOut,
    WebhookSettingsIn,
    WebhookSettingsOut,
)

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(admin_user)])

Status = Literal["ativa", "bloqueada", "expirada", "admin"]


def _status(user: User) -> Status:
    if user.is_admin:
        return "admin"
    if not user.is_active:
        return "bloqueada"
    return "expirada" if user.expired else "ativa"


def _out(db: Session, user: User) -> AdminUserOut:
    last = db.scalar(
        select(LicenseEvent).where(LicenseEvent.user_id == user.id).order_by(LicenseEvent.id.desc()).limit(1)
    )
    return AdminUserOut(
        id=user.id, email=user.email, name=user.name, is_admin=user.is_admin, is_active=user.is_active,
        expires_at=user.expires_at, status=_status(user), created_at=user.created_at,
        last_login_at=user.last_login_at,
        searches_count=db.scalar(select(func.count()).select_from(Search).where(Search.user_id == user.id)) or 0,
        last_event=LicenseEventOut.model_validate(last) if last else None,
    )


def _get(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Licença não encontrada")
    return user


@router.get("/users", response_model=list[AdminUserOut])
def list_users(q: str | None = None, status: Status | None = Query(None), db: Session = Depends(get_db)):
    stmt = select(User).order_by(User.created_at.desc())
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.email.ilike(like), User.name.ilike(like)))
    users = [_out(db, u) for u in db.scalars(stmt)]
    return [u for u in users if status is None or u.status == status]


@router.post("/users", response_model=AccessIssued, status_code=201)
def create_user(payload: AdminUserCreate, db: Session = Depends(get_db), admin: User = Depends(admin_user)):
    if find_user(db, payload.email):
        raise HTTPException(409, "Já existe uma licença com esse e-mail.")
    granted = grant(db, payload.email, "admin", name=payload.name, detail=f"criada por {admin.email}",
                    send_email=payload.send_email)
    if payload.expires_at:
        granted.user.expires_at = payload.expires_at
        db.commit()
    return AccessIssued(user=_out(db, granted.user), emailed=granted.emailed, temporary_password=granted.password)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(user_id: int, payload: AdminUserUpdate, db: Session = Depends(get_db),
                admin: User = Depends(admin_user)):
    user = _get(db, user_id)
    changes = payload.model_dump(exclude_unset=True)
    if user.id == admin.id and (changes.get("is_active") is False or changes.get("is_admin") is False):
        raise HTTPException(400, "Você não pode bloquear nem remover o próprio acesso de administrador.")
    for key, value in changes.items():
        setattr(user, key, value)
    if "is_active" in changes:
        log_event(db, user.email, "admin", "granted" if user.is_active else "revoked", user, f"por {admin.email}")
        if not user.is_active:
            end_user_sessions(db, user.id)
    if "expires_at" in changes:
        when = user.expires_at.strftime("%d/%m/%Y") if user.expires_at else "sem validade"
        log_event(db, user.email, "admin", "expiry", user, f"{when}, por {admin.email}")
    db.flush()
    resync_sources(db, user)
    db.commit()
    return _out(db, user)


@router.post("/users/{user_id}/reset-password", response_model=AccessIssued)
def reset_password(user_id: int, db: Session = Depends(get_db), admin: User = Depends(admin_user)):
    user = _get(db, user_id)
    password, emailed = issue_password(db, user, reset=True)
    log_event(db, user.email, "admin", "password", user, f"senha redefinida por {admin.email}")
    db.commit()
    return AccessIssued(user=_out(db, user), emailed=emailed, temporary_password=password)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(admin_user)):
    user = _get(db, user_id)
    if user.id == admin.id:
        raise HTTPException(400, "Você não pode excluir a própria conta.")
    source_ids = list(db.scalars(select(Search.source_id).where(Search.user_id == user.id)))
    log_event(db, user.email, "admin", "deleted", None, f"por {admin.email}")
    db.delete(user)
    db.flush()
    for source in db.scalars(select(Source).where(Source.id.in_(source_ids))):
        sync_source(db, source)
    db.commit()


@router.get("/users/{user_id}/events", response_model=list[LicenseEventOut])
def user_events(user_id: int, db: Session = Depends(get_db)):
    user = _get(db, user_id)
    return list(db.scalars(
        select(LicenseEvent).where(or_(LicenseEvent.user_id == user.id, LicenseEvent.email == user.email))
        .order_by(LicenseEvent.id.desc()).limit(50)
    ))


@router.get("/events", response_model=list[LicenseEventOut])
def recent_events(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    return list(db.scalars(select(LicenseEvent).order_by(LicenseEvent.id.desc()).limit(limit)))


@router.get("/settings", response_model=AdminSettingsOut)
def admin_settings(db: Session = Depends(get_db)):
    return AdminSettingsOut(email_configured=email_configured(db), webhook_configured=bool(webhook_config(db).secret))


def _webhook_out(db: Session) -> WebhookSettingsOut:
    config = webhook_config(db)
    return WebhookSettingsOut(url=webhook_url(config.secret), product_ids=config.product_ids,
                              access_days=config.access_days)


@router.get("/webhook", response_model=WebhookSettingsOut)
def get_webhook(db: Session = Depends(get_db)):
    return _webhook_out(db)


@router.put("/webhook", response_model=WebhookSettingsOut)
def update_webhook(payload: WebhookSettingsIn, db: Session = Depends(get_db)):
    codes = sorted({c.strip() for c in payload.product_ids if c.strip()})
    save(db, {
        "webhook_product_ids": ",".join(codes),
        "webhook_access_days": str(payload.access_days) if payload.access_days else None,
    })
    db.commit()
    return _webhook_out(db)


@router.post("/webhook/secret", response_model=WebhookSettingsOut)
def regenerate_webhook_secret(db: Session = Depends(get_db)):
    new_webhook_secret(db)
    db.commit()
    return _webhook_out(db)


def _email_out(db: Session) -> EmailSettingsOut:
    cfg = email_config(db)
    return EmailSettingsOut(
        configured=cfg.configured, provider=cfg.provider, has_resend_api_key=bool(cfg.resend_api_key),
        smtp_host=cfg.smtp_host, smtp_port=cfg.smtp_port, smtp_user=cfg.smtp_user,
        has_smtp_password=bool(cfg.smtp_password), smtp_tls=cfg.smtp_tls,
        from_email=cfg.from_email, from_name=cfg.from_name,
        access_subject=cfg.access_subject, access_html=cfg.access_html,
        reset_subject=cfg.reset_subject, reset_html=cfg.reset_html,
    )


@router.get("/email", response_model=EmailSettingsOut)
def get_email(db: Session = Depends(get_db)):
    return _email_out(db)


@router.put("/email", response_model=EmailSettingsOut)
def update_email(payload: EmailSettingsIn, db: Session = Depends(get_db)):
    def clean(value: str | None) -> str | None:
        return value.strip() if value and value.strip() else None

    values: dict[str, str | None] = {
        "email_provider": payload.provider,
        "smtp_host": clean(payload.smtp_host),
        "smtp_port": str(payload.smtp_port),
        "smtp_user": clean(payload.smtp_user),
        "smtp_tls": "true" if payload.smtp_tls else "false",
        "email_from": clean(payload.from_email),
        "email_from_name": clean(payload.from_name),
        # Empty templates fall back to the built-in defaults.
        "access_subject": clean(payload.access_subject),
        "access_html": clean(payload.access_html),
        "reset_subject": clean(payload.reset_subject),
        "reset_html": clean(payload.reset_html),
    }
    for key in SECRET_KEYS:
        secret = clean(getattr(payload, key))
        if secret:
            values[key] = secret
    save(db, values)
    db.commit()
    return _email_out(db)


@router.post("/email/test", response_model=EmailTestOut)
def test_email(db: Session = Depends(get_db), admin: User = Depends(admin_user)):
    cfg = email_config(db)
    values = access_values(admin.email, admin.name, "exemplo-1234")
    try:
        deliver(cfg, admin.email, f"[Teste] {render(cfg.access_subject, values, escape=False)}",
                render(cfg.access_html, values))
    except MailError as exc:
        return EmailTestOut(ok=False, sent_to=admin.email, error=str(exc))
    return EmailTestOut(ok=True, sent_to=admin.email)

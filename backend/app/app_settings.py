"""Settings the admin edits in /admin: purchase webhook and e-mail. A key never saved falls back to .env."""

import secrets
from dataclasses import dataclass
from typing import Literal
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AppSetting

Provider = Literal["resend", "smtp"]

DEFAULT_ACCESS_SUBJECT = "Seus dados de acesso ao Garimppu"
DEFAULT_ACCESS_HTML = """<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:520px">
  <p>Olá, {{name}}!</p>
  <p>Seu acesso ao <strong>Garimppu</strong> está liberado. Use os dados abaixo para entrar:</p>
  <p style="background:#f4f4f5;border-radius:8px;padding:12px 16px">
    E-mail: <strong>{{email}}</strong><br>
    Senha provisória: <strong style="font-family:monospace;font-size:16px">{{password}}</strong>
  </p>
  <p><a href="{{login_url}}" style="display:inline-block;background:#f0a83c;color:#1a1a1a;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:6px">Entrar no Garimppu</a></p>
  <p style="color:#555">Depois de entrar, troque a senha em Minha conta.</p>
</div>"""

DEFAULT_RESET_SUBJECT = "Redefina sua senha do Garimppu"
DEFAULT_RESET_HTML = """<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:520px">
  <p>Olá, {{name}}!</p>
  <p>Recebemos um pedido para redefinir a senha do Garimppu. Clique no botão para criar uma senha nova:</p>
  <p><a href="{{reset_link}}" style="display:inline-block;background:#f0a83c;color:#1a1a1a;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:6px">Criar nova senha</a></p>
  <p style="color:#555">O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
</div>"""

# Never sent back to the browser; the admin only sees whether they are set.
SECRET_KEYS = {"smtp_password", "resend_api_key"}


def load(db: Session) -> dict[str, str | None]:
    return {row.key: row.value for row in db.scalars(select(AppSetting))}


def save(db: Session, values: dict[str, str | None]) -> None:
    for key, value in values.items():
        row = db.get(AppSetting, key)
        if row is None:
            db.add(AppSetting(key=key, value=value))
        else:
            row.value = value
    db.flush()


@dataclass
class WebhookConfig:
    secret: str | None
    product_ids: list[str]
    access_days: int | None


def webhook_config(db: Session) -> WebhookConfig:
    env, stored = get_settings(), load(db)
    secret = stored["webhook_secret"] if "webhook_secret" in stored else env.webhook_secret
    if "webhook_product_ids" in stored:
        product_ids = [p.strip() for p in (stored["webhook_product_ids"] or "").split(",") if p.strip()]
    else:
        product_ids = env.webhook_product_ids
    days = stored.get("webhook_access_days")
    return WebhookConfig(secret=secret or None, product_ids=product_ids, access_days=int(days) if days else None)


def new_webhook_secret(db: Session) -> str:
    secret = secrets.token_urlsafe(24)
    save(db, {"webhook_secret": secret})
    return secret


def webhook_url(secret: str | None) -> str | None:
    if not secret:
        return None
    return f"{get_settings().api_public_url.rstrip('/')}/api/webhooks/purchase?token={quote(secret)}"


@dataclass
class EmailConfig:
    provider: Provider | None
    resend_api_key: str | None
    smtp_host: str | None
    smtp_port: int
    smtp_user: str | None
    smtp_password: str | None
    smtp_tls: bool
    from_email: str | None
    from_name: str
    access_subject: str
    access_html: str
    reset_subject: str
    reset_html: str

    @property
    def configured(self) -> bool:
        if not self.from_email:
            return False
        if self.provider == "resend":
            return bool(self.resend_api_key)
        if self.provider == "smtp":
            return bool(self.smtp_host)
        return False


def email_config(db: Session) -> EmailConfig:
    env, stored = get_settings(), load(db)

    def pick(key: str, fallback):
        return stored[key] if key in stored else fallback

    env_provider: Provider | None = "smtp" if env.smtp_host else None
    provider = pick("email_provider", env_provider) or None
    return EmailConfig(
        provider=provider if provider in ("resend", "smtp") else None,
        resend_api_key=pick("resend_api_key", None),
        smtp_host=pick("smtp_host", env.smtp_host),
        smtp_port=int(pick("smtp_port", env.smtp_port) or 587),
        smtp_user=pick("smtp_user", env.smtp_user),
        smtp_password=pick("smtp_password", env.smtp_password),
        smtp_tls=str(pick("smtp_tls", env.smtp_tls)).lower() in ("true", "1"),
        from_email=pick("email_from", env.smtp_from or env.smtp_user),
        from_name=pick("email_from_name", None) or "Garimppu",
        access_subject=pick("access_subject", None) or DEFAULT_ACCESS_SUBJECT,
        access_html=pick("access_html", None) or DEFAULT_ACCESS_HTML,
        reset_subject=pick("reset_subject", None) or DEFAULT_RESET_SUBJECT,
        reset_html=pick("reset_html", None) or DEFAULT_RESET_HTML,
    )

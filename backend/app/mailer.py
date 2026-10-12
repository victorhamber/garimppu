"""Transactional e-mail (access data, password reset) through Resend or SMTP, as configured in /admin."""

import html
import logging
import re
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

import httpx
from sqlalchemy.orm import Session

from app.app_settings import EmailConfig, email_config
from app.config import get_settings

logger = logging.getLogger(__name__)


class MailError(Exception):
    pass


def email_configured(db: Session) -> bool:
    return email_config(db).configured


def render(template: str, values: dict[str, str], escape: bool = True) -> str:
    """Fills {{placeholders}}; escape for HTML bodies, not for subjects."""
    def value(m: re.Match) -> str:
        found = values.get(m.group(1), m.group(0))
        return html.escape(found) if escape else found
    return re.sub(r"\{\{\s*(\w+)\s*\}\}", value, template)


def _plain_text(markup: str) -> str:
    text = re.sub(r"<a [^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>", r"\2: \1", markup, flags=re.S)
    text = re.sub(r"<br\s*/?>|</p>|</div>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n\s*\n+", "\n\n", html.unescape(text)).strip()


def deliver(cfg: EmailConfig, to: str, subject: str, body_html: str) -> None:
    """Sends or raises MailError with a message the admin can act on."""
    if not cfg.configured:
        raise MailError("E-mail não configurado.")
    sender = formataddr((cfg.from_name, cfg.from_email))
    if cfg.provider == "resend":
        try:
            response = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {cfg.resend_api_key}"},
                json={"from": sender, "to": [to], "subject": subject, "html": body_html, "text": _plain_text(body_html)},
                timeout=20,
            )
        except httpx.HTTPError as exc:
            raise MailError(f"Não foi possível falar com o Resend: {exc}") from exc
        if response.status_code >= 400:
            try:
                message = response.json().get("message")
            except ValueError:
                message = None
            raise MailError(f"O Resend recusou o envio ({response.status_code}): {message or response.text[:200]}")
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    msg.set_content(_plain_text(body_html))
    msg.add_alternative(body_html, subtype="html")
    try:
        with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=20) as smtp:
            if cfg.smtp_tls:
                smtp.starttls()
            if cfg.smtp_user and cfg.smtp_password:
                smtp.login(cfg.smtp_user, cfg.smtp_password)
            smtp.send_message(msg)
    except smtplib.SMTPAuthenticationError as exc:
        raise MailError("O servidor SMTP recusou o usuário ou a senha.") from exc
    except (OSError, smtplib.SMTPException) as exc:
        raise MailError(f"Falha no SMTP: {exc}") from exc


def _send(db: Session, to: str, subject: str, body_html: str) -> bool:
    try:
        deliver(email_config(db), to, subject, body_html)
        return True
    except MailError:
        logger.exception("Falha ao enviar e-mail para %s", to)
        return False


def access_values(email: str, name: str | None, password: str) -> dict[str, str]:
    return {
        "name": name or "cliente", "email": email, "password": password,
        "login_url": f"{get_settings().app_url.rstrip('/')}/login",
    }


def send_access_email(db: Session, email: str, name: str | None, password: str) -> bool:
    cfg = email_config(db)
    if not cfg.configured:
        return False
    values = access_values(email, name, password)
    return _send(db, email, render(cfg.access_subject, values, escape=False), render(cfg.access_html, values))


def send_reset_email(db: Session, email: str, name: str | None, link: str) -> bool:
    cfg = email_config(db)
    if not cfg.configured:
        return False
    values = {"name": name or "cliente", "email": email, "reset_link": link}
    return _send(db, email, render(cfg.reset_subject, values, escape=False), render(cfg.reset_html, values))

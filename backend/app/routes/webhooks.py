"""Purchase webhook: one URL for Hotmart, Kiwify and Cakto that grants or revokes licenses.

The shared secret may arrive as ?token= (all platforms), the X-Webhook-Token header, Hotmart's hottok or
Cakto's body "secret". Approved purchases grant access (creating the account and e-mailing a password);
refunds, chargebacks and cancellations block it. Anything else is logged and ignored.
"""

import hmac
import json
import logging
from datetime import timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.app_settings import webhook_config
from app.db import get_db
from app.licenses import grant, log_event, revoke
from app.models import User, utcnow

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

GRANT_EVENTS = {"PURCHASE_APPROVED", "PURCHASE_COMPLETE", "ORDER_APPROVED", "SUBSCRIPTION_RENEWED"}
REVOKE_EVENTS = {
    "PURCHASE_CANCELED", "PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK", "PURCHASE_PROTEST", "PURCHASE_EXPIRED",
    "ORDER_REFUNDED", "CHARGEBACK", "REFUND", "SUBSCRIPTION_CANCELED", "SUBSCRIPTION_CANCELLATION",
}
GRANT_STATUSES = {"APPROVED", "COMPLETE", "COMPLETED", "PAID"}
REVOKE_STATUSES = {"CANCELED", "CANCELLED", "REFUNDED", "CHARGEBACK", "CHARGEDBACK", "EXPIRED", "PROTESTED"}


def _pick(payload: dict, *paths: str) -> str | None:
    for path in paths:
        value: object = payload
        for key in path.split("."):
            value = value.get(key) if isinstance(value, dict) else None
        if value not in (None, ""):
            return str(value)
    return None


def _origin(payload: dict, request: Request) -> str:
    if request.headers.get("x-hotmart-hottok") or "hottok" in payload:
        return "hotmart"
    if "webhook_event_type" in payload or "Customer" in payload:
        return "kiwify"
    if "secret" in payload:
        return "cakto"
    return "webhook"


def _authorized(payload: dict, request: Request, secret: str) -> bool:
    candidates = [
        request.query_params.get("token"),
        request.headers.get("x-webhook-token"),
        request.headers.get("x-hotmart-hottok"),
        payload.get("hottok"),
        payload.get("secret"),
    ]
    return any(isinstance(c, str) and hmac.compare_digest(c.encode(), secret.encode()) for c in candidates)


def _decision(event: str | None, status: str | None) -> str | None:
    event, status = (event or "").upper(), (status or "").upper()
    if event in GRANT_EVENTS:
        return "grant"
    if event in REVOKE_EVENTS:
        return "revoke"
    if not event or event in {"PURCHASE", "ORDER", "ORDER_STATUS_CHANGED"}:
        if status in GRANT_STATUSES:
            return "grant"
        if status in REVOKE_STATUSES:
            return "revoke"
    return None


def _set_validity(db: Session, user: User, access_days: int | None) -> None:
    """A purchase lasts access_days from now (never shortening a longer license), or until cancelled."""
    if user.is_admin:
        return
    if access_days is None:
        user.expires_at = None
    else:
        until = utcnow() + timedelta(days=access_days)
        current = user.expires_at
        if current is not None and current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        user.expires_at = max(until, current) if current else until
    db.commit()


@router.post("/purchase")
async def purchase(request: Request, db: Session = Depends(get_db)):
    config = webhook_config(db)
    secret = config.secret
    if not secret:
        raise HTTPException(503, "Webhook desativado: gere a URL em Administração > Webhook.")
    try:
        payload = json.loads(await request.body() or b"{}")
    except ValueError:
        raise HTTPException(400, "Corpo inválido: esperado JSON.")
    if not isinstance(payload, dict):
        raise HTTPException(400, "Corpo inválido: esperado um objeto JSON.")
    if not _authorized(payload, request, secret):
        raise HTTPException(401, "Token inválido.")

    origin = _origin(payload, request)
    email = _pick(payload, "data.buyer.email", "Customer.email", "data.customer.email", "customer.email",
                  "buyer.email", "email")
    if not email:
        raise HTTPException(400, "E-mail do comprador não encontrado no payload.")
    name = _pick(payload, "data.buyer.name", "Customer.full_name", "data.customer.name", "customer.name", "name")
    event = _pick(payload, "event", "webhook_event_type")
    status = _pick(payload, "data.purchase.status", "order_status", "data.status", "status")
    product = _pick(payload, "data.product.id", "Product.product_id", "product.id", "product_id")
    offer = _pick(payload, "data.purchase.offer.code", "data.offer.id", "offer_code")
    product_name = _pick(payload, "data.product.name", "Product.product_name", "product.name")
    detail = " · ".join(p for p in (event, status, product_name or product, offer) if p)

    allowed = config.product_ids
    if allowed and not {product, offer} & set(allowed):
        log_event(db, email.strip().lower(), origin, "ignored", detail=f"produto fora da lista · {detail}")
        db.commit()
        return {"ok": True, "action": "ignored", "reason": "produto"}

    decision = _decision(event, status)
    logger.info("Webhook %s: %s %s -> %s", origin, email, detail, decision or "ignorado")
    if decision == "grant":
        granted = grant(db, email, origin, name=name, detail=detail)
        _set_validity(db, granted.user, config.access_days)
        return {"ok": True, "action": "created" if granted.created else "granted"}
    if decision == "revoke":
        user = revoke(db, email, origin, detail=detail)
        return {"ok": True, "action": "revoked" if user else "ignored"}
    log_event(db, email.strip().lower(), origin, "ignored", detail=detail or "evento sem ação")
    db.commit()
    return {"ok": True, "action": "ignored"}

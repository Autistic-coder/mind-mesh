"""Database backed fixed-window limits shared by every API worker."""

import hashlib
import ipaddress
import time
from datetime import datetime, timezone

from fastapi import HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from .config import get_settings
from .database import get_engine
from .models import RateLimit


def client_address(request: Request) -> str:
    address = request.client.host if request.client else "unknown"
    if get_settings().trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
        try:
            address = str(ipaddress.ip_address(forwarded))
        except ValueError:
            pass
    return address


def _key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def enforce(scope: str, identity: str, limit: int, seconds: int) -> None:
    now_epoch = int(time.time())
    window_start = now_epoch - (now_epoch % seconds)
    retry_after = max(1, window_start + seconds - now_epoch)
    now = datetime.now(timezone.utc)
    key_hash = _key(identity)
    engine = get_engine()
    insert = pg_insert if engine.dialect.name == "postgresql" else sqlite_insert
    statement = insert(RateLimit).values(
        scope=scope,
        key_hash=key_hash,
        window_start=window_start,
        request_count=1,
        expires_at=datetime.fromtimestamp(window_start + seconds, timezone.utc),
    )
    statement = statement.on_conflict_do_update(
        index_elements=["scope", "key_hash", "window_start"],
        set_={"request_count": RateLimit.request_count + 1},
    ).returning(RateLimit.request_count)
    with engine.begin() as connection:
        expired = connection.execute(
            select(RateLimit.scope, RateLimit.key_hash, RateLimit.window_start)
            .where(RateLimit.expires_at < now)
            .limit(200)
        ).all()
        for old_scope, old_key, old_window in expired:
            connection.execute(
                delete(RateLimit).where(
                    RateLimit.scope == old_scope,
                    RateLimit.key_hash == old_key,
                    RateLimit.window_start == old_window,
                )
            )
        count = connection.scalar(statement)
    if count is not None and count > limit:
        raise HTTPException(
            429,
            f"You’ve made several requests quickly. Please wait {retry_after} seconds and try again.",
            headers={"Retry-After": str(retry_after)},
        )


def auth_limits(request: Request, email: str, *, registration: bool = False) -> None:
    settings = get_settings()
    address = client_address(request)
    if registration:
        enforce("register-ip", address, settings.rate_register_hour, 3600)
        return
    enforce("login-ip", address, settings.rate_login_ip_minute, 60)
    enforce("login-email", email, settings.rate_login_email_minute, 60)


def user_limit(scope: str, user_id: str, limit: int) -> None:
    enforce(scope, user_id, limit, 60)

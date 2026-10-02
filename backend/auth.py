"""Opaque cookie sessions and account endpoints."""

import hashlib
import secrets
from datetime import timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import FixedWindowRateLimiter
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from .config import get_settings
from .database import get_db
from .models import Session as AccountSession, User, utcnow


router = APIRouter(prefix="/api/auth", tags=["accounts"])
password_hasher = PasswordHasher()
rate_limiter = FixedWindowRateLimiter(MemoryStorage())
LOGIN_BY_IP = parse("10/minute")
LOGIN_BY_EMAIL = parse("5/minute")
REGISTER_BY_IP = parse("5/hour")
SESSION_SECONDS = 7 * 24 * 60 * 60
COOKIE_NAME = "mindmesh_session"


class RegisterInput(BaseModel):
    display_name: str
    email: EmailStr
    password: str
    password_confirmation: str


class LoginInput(BaseModel):
    email: EmailStr
    password: str


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalized_email(value: str) -> str:
    return value.strip().casefold()


def public_user(user: User) -> dict:
    return {"id": user.id, "displayName": user.display_name, "email": user.email}


def check_rate(request: Request, email: str, *, registration: bool = False) -> None:
    address = request.client.host if request.client else "unknown"
    if registration:
        allowed = rate_limiter.hit(REGISTER_BY_IP, "register", address)
    else:
        allowed = rate_limiter.hit(LOGIN_BY_IP, "login-ip", address)
        allowed = rate_limiter.hit(LOGIN_BY_EMAIL, "login-email", address, email) and allowed
    if not allowed:
        raise HTTPException(429, "Too many attempts. Please try again later.", headers={"Retry-After": "60"})


def session_response(user: User, db: DbSession, response: Response, request: Request) -> dict:
    token = secrets.token_urlsafe(48)
    csrf = secrets.token_urlsafe(32)
    record = AccountSession(
        user_id=user.id,
        token_hash=digest(token),
        csrf_token_hash=digest(csrf),
        expires_at=utcnow() + timedelta(seconds=SESSION_SECONDS),
    )
    db.add(record)
    db.commit()
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=get_settings().secure_cookies or request.url.scheme == "https",
        samesite="lax",
        max_age=SESSION_SECONDS,
        path="/",
    )
    return {"user": public_user(user), "csrfToken": csrf}


def current_session(request: Request, db: DbSession = Depends(get_db)) -> AccountSession:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Please sign in to continue.")
    record = db.scalar(select(AccountSession).where(AccountSession.token_hash == digest(token)))
    if record is None:
        raise HTTPException(401, "Your session has ended. Please sign in again.")
    expiry = record.expires_at
    if expiry.replace(tzinfo=timezone.utc) <= utcnow():
        db.delete(record)
        db.commit()
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    return record


def current_user(session: AccountSession = Depends(current_session)) -> User:
    return session.user


def require_csrf(
    session: AccountSession = Depends(current_session),
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> AccountSession:
    if not csrf_token or not secrets.compare_digest(session.csrf_token_hash, digest(csrf_token)):
        raise HTTPException(403, "Your form expired. Refresh the page and try again.")
    return session


@router.post("/register", status_code=201)
def register(payload: RegisterInput, request: Request, response: Response, db: DbSession = Depends(get_db)):
    email = normalized_email(str(payload.email))
    check_rate(request, email, registration=True)
    name = payload.display_name.strip()
    if not 1 <= len(name) <= 80:
        raise HTTPException(400, "Enter a display name of 1 to 80 characters.")
    if len(payload.password) < 12 or len(payload.password) > 128:
        raise HTTPException(400, "Use a password of 12 to 128 characters.")
    if payload.password != payload.password_confirmation:
        raise HTTPException(400, "Passwords do not match.")
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists.")
    user = User(display_name=name, email=email, password_hash=password_hasher.hash(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with this email already exists.") from None
    return session_response(user, db, response, request)


@router.post("/login")
def login(payload: LoginInput, request: Request, response: Response, db: DbSession = Depends(get_db)):
    email = normalized_email(str(payload.email))
    check_rate(request, email)
    user = db.scalar(select(User).where(User.email == email))
    valid = False
    if user:
        try:
            valid = password_hasher.verify(user.password_hash, payload.password)
        except (VerifyMismatchError, InvalidHashError):
            pass
    if not valid or user is None:
        raise HTTPException(401, "Invalid email or password.")
    if password_hasher.check_needs_rehash(user.password_hash):
        user.password_hash = password_hasher.hash(payload.password)
    return session_response(user, db, response, request)


@router.get("/me")
def me(session: AccountSession = Depends(current_session), db: DbSession = Depends(get_db)):
    # Refreshing the page obtains a new CSRF value without putting it in a cookie.
    csrf = secrets.token_urlsafe(32)
    session.csrf_token_hash = digest(csrf)
    db.commit()
    return {"user": public_user(session.user), "csrfToken": csrf}


@router.post("/logout", status_code=204)
def logout(response: Response, session: AccountSession = Depends(require_csrf), db: DbSession = Depends(get_db)):
    db.delete(session)
    db.commit()
    response.delete_cookie(COOKIE_NAME, path="/", samesite="lax")

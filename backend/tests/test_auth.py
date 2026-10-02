"""Account flows use real cookies and a migrated SQLite database."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from backend.auth import COOKIE_NAME, digest
from backend.models import Session as AccountSession
from backend.models import User, utcnow


def register(client, email="Ada@Example.com"):
    return client.post(
        "/api/auth/register",
        json={
            "display_name": "Ada",
            "email": email,
            "password": "correct horse battery staple",
            "password_confirmation": "correct horse battery staple",
        },
    )


def test_registration_session_refresh_logout_and_expiry(api):
    client, engine, _ = api
    created = register(client)
    assert created.status_code == 201
    assert created.json()["user"]["email"] == "ada@example.com"
    assert set(created.json()) == {"user", "csrfToken"}
    assert "HttpOnly" in created.headers["set-cookie"]
    assert "SameSite=lax" in created.headers["set-cookie"]
    assert "Cache-Control" in created.headers
    token = client.cookies.get(COOKIE_NAME)
    with DbSession(engine) as db:
        user = db.scalar(select(User).where(User.email == "ada@example.com"))
        assert user.password_hash.startswith("$argon2id$")
        assert "correct horse" not in user.password_hash
        session = db.scalar(select(AccountSession).where(AccountSession.user_id == user.id))
        assert session.token_hash == digest(token)
        assert token not in session.token_hash

    old_csrf = created.json()["csrfToken"]
    refreshed = client.get("/api/auth/me")
    assert refreshed.status_code == 200
    assert refreshed.json()["csrfToken"] != old_csrf
    assert client.post("/api/auth/logout", headers={"X-CSRF-Token": old_csrf}).status_code == 403
    assert (
        client.post(
            "/api/auth/logout", headers={"X-CSRF-Token": refreshed.json()["csrfToken"]}
        ).status_code
        == 204
    )
    assert client.get("/api/auth/me").status_code == 401
    with DbSession(engine) as db:
        assert db.scalar(select(AccountSession)) is None

    logged_in = client.post(
        "/api/auth/login",
        json={"email": " ADA@example.com ", "password": "correct horse battery staple"},
    )
    assert logged_in.status_code == 200
    with DbSession(engine) as db:
        session = db.scalar(select(AccountSession))
        session.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/auth/me").status_code == 401


def test_duplicate_validation_generic_credentials_and_rate_limit(api):
    client, _engine, _ = api
    assert register(client).status_code == 201
    assert register(client, "ada@example.com").status_code == 409
    bad = client.post(
        "/api/auth/login",
        json={"email": "ada@example.com", "password": "wrong-password"},
    )
    missing = client.post(
        "/api/auth/login",
        json={"email": "missing@example.com", "password": "wrong-password"},
    )
    assert bad.status_code == missing.status_code == 401
    assert bad.json() == missing.json() == {"detail": "Invalid email or password."}
    weak = client.post(
        "/api/auth/register",
        json={
            "display_name": "A",
            "email": "weak@example.com",
            "password": "short",
            "password_confirmation": "short",
        },
    )
    assert weak.status_code == 400
    invalid = client.post(
        "/api/auth/register",
        json={
            "display_name": "A",
            "email": "invalid",
            "password": "secret-to-not-echo",
            "password_confirmation": "secret-to-not-echo",
        },
    )
    assert invalid.status_code == 422
    assert "secret-to-not-echo" not in invalid.text
    for _ in range(5):
        client.post(
            "/api/auth/login",
            json={"email": "limited@example.com", "password": "wrong"},
        )
    limited = client.post(
        "/api/auth/login", json={"email": "limited@example.com", "password": "wrong"}
    )
    assert limited.status_code == 429
    assert limited.headers["Retry-After"] == "60"


def test_csrf_and_origin_rejection(api):
    client, _engine, _ = api
    assert client.get("/api/auth/me").status_code == 401
    created = register(client, "origin@example.com")
    csrf = created.json()["csrfToken"]
    assert client.post("/api/auth/logout").status_code == 403
    assert (
        client.post(
            "/api/auth/logout",
            headers={"X-CSRF-Token": csrf, "Origin": "https://attacker.example"},
        ).status_code
        == 403
    )
    assert client.get("/api/auth/me").status_code == 200

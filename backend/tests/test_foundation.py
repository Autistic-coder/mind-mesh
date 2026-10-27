"""Readiness and errors must remain safe during database outages."""

from sqlalchemy.exc import OperationalError
from starlette.requests import Request

from backend import main
from backend.database import get_db
from backend.rate_limits import client_address


def test_database_outage_is_sanitized_and_liveness_survives(api):
    client, _engine, _path = api

    def unavailable():
        raise OperationalError("private SQL", {"password": "do-not-expose"}, Exception("secret"))

    main.app.dependency_overrides[get_db] = unavailable
    response = client.get("/api/auth/me")
    assert response.status_code == 503
    assert "secret" not in response.text and "do-not-expose" not in response.text
    assert response.headers["cache-control"] == "no-store, private"
    assert client.get("/api/health").status_code == 200


def test_forwarded_ip_requires_a_trusted_peer(api, monkeypatch):
    monkeypatch.setenv("MINDMESH_TRUST_PROXY_HEADERS", "true")
    monkeypatch.setenv("MINDMESH_TRUSTED_PROXY_IPS", "127.0.0.1")
    scope = {"type": "http", "headers": [(b"x-forwarded-for", b"203.0.113.4")]}
    assert client_address(Request({**scope, "client": ("198.51.100.8", 123)})) == "198.51.100.8"
    assert client_address(Request({**scope, "client": ("127.0.0.1", 123)})) == "203.0.113.4"

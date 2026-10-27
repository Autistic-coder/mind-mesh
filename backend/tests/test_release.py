import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.config import get_settings
from backend.frontend import install_frontend


def test_production_requires_https_secure_cookies_and_database_encryption(monkeypatch):
    monkeypatch.setenv("MINDMESH_ENV", "production")
    monkeypatch.setenv("MINDMESH_ALLOW_SQLITE", "false")
    monkeypatch.setenv(
        "MINDMESH_DATABASE_URL", "postgresql://user:placeholder@host/db?sslmode=require"
    )
    monkeypatch.setenv("MINDMESH_ORIGIN", "http://example.invalid")
    with pytest.raises(RuntimeError, match="HTTPS"):
        get_settings()
    monkeypatch.setenv("MINDMESH_ORIGIN", "https://example.invalid")
    monkeypatch.setenv("MINDMESH_SECURE_COOKIES", "false")
    with pytest.raises(RuntimeError, match="SECURE_COOKIES"):
        get_settings()
    monkeypatch.setenv("MINDMESH_SECURE_COOKIES", "true")
    assert get_settings().secure_cookies


def test_production_spa_routes_do_not_expose_api_or_private_files(tmp_path):
    root = tmp_path / "dist"
    root.mkdir()
    (root / "index.html").write_text("<html>MindMesh</html>")
    (tmp_path / "secret.txt").write_text("must-not-be-served")
    app = FastAPI()
    install_frontend(app, root)
    client = TestClient(app)
    assert client.get("/model-lab").status_code == 200
    assert client.get("/api/missing").status_code == 404
    assert client.get("/assets/missing.js").status_code == 404
    assert client.get("/%2e%2e/secret.txt").status_code == 404

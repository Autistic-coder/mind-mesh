import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from backend.database import dispose_engines, get_db, make_engine
from backend.main import app


@pytest.fixture
def api(tmp_path, monkeypatch):
    url = f"sqlite:///{(tmp_path / 'accounts.db').as_posix()}"
    monkeypatch.setenv("MINDMESH_ALLOW_SQLITE", "true")
    monkeypatch.setenv("MINDMESH_DATABASE_URL", url)
    monkeypatch.setenv("MINDMESH_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("MINDMESH_MODEL_DIR", str(tmp_path / "models"))
    dispose_engines()
    command.upgrade(Config("alembic.ini"), "head")
    engine = make_engine(url)

    def test_db():
        with DbSession(engine, expire_on_commit=False) as db:
            yield db

    app.dependency_overrides[get_db] = test_db
    with TestClient(app) as client:
        yield client, engine, tmp_path
    app.dependency_overrides.clear()
    engine.dispose()
    dispose_engines()

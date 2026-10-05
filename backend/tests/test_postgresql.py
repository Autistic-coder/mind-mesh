"""PostgreSQL-only migration, isolation, and concurrent rate-limit checks."""

import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from backend.database import Base, dispose_engines, make_engine
from backend.migrate_sqlite import migrate
from backend.models import Project, User
from backend.rate_limits import enforce

POSTGRES_URL = os.getenv("MINDMESH_TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(
    not POSTGRES_URL,
    reason="MINDMESH_TEST_POSTGRES_URL is required for destructive PostgreSQL integration tests",
)


@pytest.fixture
def postgres(monkeypatch):
    monkeypatch.setenv("MINDMESH_DATABASE_URL", POSTGRES_URL or "")
    dispose_engines()
    engine = make_engine(POSTGRES_URL)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS mindmesh CASCADE"))
    command.upgrade(Config("alembic.ini"), "head")
    yield engine
    dispose_engines()


def test_private_schema_and_api_roles(postgres):
    with postgres.connect() as connection:
        assert connection.scalar(text("SELECT current_schema()")) == "mindmesh"
    assert "users" in inspect(postgres).get_table_names(schema="mindmesh")
    assert "rate_limits" in inspect(postgres).get_table_names(schema="mindmesh")
    with postgres.connect() as connection:
        exposed = connection.scalar(
            text(
                "SELECT has_schema_privilege('anon', 'mindmesh', 'USAGE') "
                "WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')"
            )
        )
        if exposed is not None:
            assert exposed is False


def test_concurrent_limit_is_atomic(postgres):
    def hit():
        try:
            enforce("concurrency-test", "same-user", 5, 60)
            return 200
        except Exception as error:
            return getattr(error, "status_code", None)

    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(lambda _index: hit(), range(10)))
    assert results.count(200) == 5
    assert results.count(429) == 5
    with Session(postgres) as db:
        count = db.scalar(
            text("SELECT request_count FROM mindmesh.rate_limits WHERE scope='concurrency-test'")
        )
        assert count == 10


def test_sqlite_import_is_repeatable_and_preserves_relationships(postgres, tmp_path):
    source_path = tmp_path / "existing.db"
    source = make_engine(f"sqlite:///{source_path.as_posix()}")
    Base.metadata.create_all(source)
    with Session(source) as db:
        user = User(
            id="source-user",
            display_name="Existing User",
            email="existing@example.com",
            password_hash="$argon2id$preserved",
        )
        db.add(user)
        db.add(Project(id="source-project", owner_id=user.id, name="Existing Project"))
        db.commit()
    source.dispose()

    expected = migrate(source_path, POSTGRES_URL or "", dry_run=True)
    assert expected["users"] == expected["projects"] == 1
    assert migrate(source_path, POSTGRES_URL or "")["projects"] == 1
    assert migrate(source_path, POSTGRES_URL or "")["projects"] == 1

    with Session(postgres) as db:
        project = db.get(Project, "source-project")
        assert project is not None
        assert db.get(User, project.owner_id).password_hash == "$argon2id$preserved"

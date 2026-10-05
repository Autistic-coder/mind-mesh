"""The schema must be reproducible and survive a new database connection."""

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from backend.database import make_engine
from backend.models import Project, User


def test_initial_migration_creates_persistent_workspace_tables(tmp_path, monkeypatch):
    database_url = f"sqlite:///{(tmp_path / 'mindmesh.db').as_posix()}"
    monkeypatch.setenv("MINDMESH_ALLOW_SQLITE", "true")
    monkeypatch.setenv("MINDMESH_DATABASE_URL", database_url)
    config = Config("alembic.ini")
    command.upgrade(config, "head")
    engine = make_engine(database_url)
    tables = set(inspect(engine).get_table_names())
    assert "sheet_name" in {column["name"] for column in inspect(engine).get_columns("datasets")}
    training_columns = {
        column["name"]: column for column in inspect(engine).get_columns("training_configs")
    }
    assert training_columns["project_id"]["nullable"] is True
    assert {
        "users",
        "sessions",
        "projects",
        "datasets",
        "training_configs",
        "training_runs",
        "model_metadata",
        "predictions",
        "conversations",
        "chat_messages",
        "rate_limits",
    } <= tables
    with Session(engine) as db:
        user = User(display_name="Ada", email="ada@example.com", password_hash="argon2-test-hash")
        db.add(user)
        db.flush()
        db.add(Project(owner_id=user.id, name="Research", description=""))
        db.commit()
    engine.dispose()

    reopened = make_engine(database_url)
    with Session(reopened) as db:
        project = db.scalar(select(Project).where(Project.name == "Research"))
        assert project is not None
        assert db.get(User, project.owner_id).email == "ada@example.com"
    reopened.dispose()
    command.upgrade(config, "head")


def test_sheet_migration_keeps_existing_dataset_records(tmp_path, monkeypatch):
    database_url = f"sqlite:///{(tmp_path / 'existing.db').as_posix()}"
    monkeypatch.setenv("MINDMESH_ALLOW_SQLITE", "true")
    monkeypatch.setenv("MINDMESH_DATABASE_URL", database_url)
    config = Config("alembic.ini")
    command.upgrade(config, "61faf2ac264c")
    engine = make_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (id, display_name, email, password_hash, created_at) VALUES ('user-1', 'Ada', 'ada@example.com', 'hash', '2025-01-01')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO datasets (id, owner_id, project_id, name, stored_name, original_name, content_type, size_bytes, row_count, columns_json, preview_json, created_at) VALUES ('data-1', 'user-1', NULL, 'Existing', '0123456789abcdef0123456789abcdef.csv', 'Existing.csv', 'text/csv', 8, 1, '[]', '[]', '2025-01-01')"
            )
        )
    engine.dispose()
    command.upgrade(config, "head")
    reopened = make_engine(database_url)
    with reopened.connect() as connection:
        row = connection.execute(
            text("SELECT original_name, size_bytes, sheet_name FROM datasets WHERE id = 'data-1'")
        ).one()
        assert row == ("Existing.csv", 8, None)
    reopened.dispose()

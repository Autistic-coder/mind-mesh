"""The schema must be reproducible and survive a new database connection."""

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from backend.database import make_engine
from backend.models import Project, User


def test_initial_migration_creates_persistent_workspace_tables(tmp_path, monkeypatch):
    database_url = f"sqlite:///{(tmp_path / 'mindmesh.db').as_posix()}"
    monkeypatch.setenv("MINDMESH_DATABASE_URL", database_url)
    config = Config("alembic.ini")
    command.upgrade(config, "head")
    engine = make_engine(database_url)
    tables = set(inspect(engine).get_table_names())
    assert {
        "users", "sessions", "projects", "datasets", "training_configs",
        "training_runs", "model_metadata", "predictions", "conversations", "chat_messages",
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

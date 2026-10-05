"""SQLAlchemy engine and request sessions for PostgreSQL."""

from threading import Lock

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Session

from .config import get_settings


class Base(DeclarativeBase):
    pass


_engines: dict[str, Engine] = {}
_engine_lock = Lock()


def normalized_database_url(database_url: str) -> str:
    if database_url.startswith("postgres://"):
        return "postgresql+psycopg://" + database_url.removeprefix("postgres://")
    if database_url.startswith("postgresql://"):
        return "postgresql+psycopg://" + database_url.removeprefix("postgresql://")
    return database_url


def make_engine(database_url: str | None = None) -> Engine:
    settings = get_settings()
    url = normalized_database_url(database_url or settings.database_url)
    backend = make_url(url).get_backend_name()
    if backend == "sqlite":
        engine = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _record):
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine
    if backend != "postgresql":
        raise RuntimeError("MINDMESH_DATABASE_URL must use PostgreSQL.")
    engine = create_engine(
        url,
        pool_pre_ping=True,
        pool_size=settings.pool_size,
        max_overflow=settings.max_overflow,
        pool_timeout=10,
        pool_recycle=300,
        connect_args={"connect_timeout": 10, "options": "-csearch_path=mindmesh,public"},
    )

    @event.listens_for(engine, "connect")
    def set_private_search_path(connection, _record):
        # Supabase's Session pooler may ignore startup `options`. SET SESSION in
        # autocommit mode makes the schema selection survive SQLAlchemy rollbacks.
        previous_autocommit = connection.autocommit
        connection.autocommit = True
        try:
            with connection.cursor() as cursor:
                cursor.execute("SET SESSION search_path TO mindmesh, public")
        finally:
            connection.autocommit = previous_autocommit

    return engine


def get_engine() -> Engine:
    url = normalized_database_url(get_settings().database_url)
    with _engine_lock:
        if url not in _engines:
            _engines[url] = make_engine(url)
        return _engines[url]


def dispose_engines() -> None:
    with _engine_lock:
        for engine in _engines.values():
            engine.dispose()
        _engines.clear()


def get_db():
    with Session(get_engine(), expire_on_commit=False) as session:
        yield session

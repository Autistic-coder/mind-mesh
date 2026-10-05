"""Alembic migration environment."""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, event, pool

from backend import models  # noqa: F401 - registers the schema with Base
from backend.config import get_settings
from backend.database import Base, normalized_database_url

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
migration_url = os.getenv("MINDMESH_MIGRATION_DATABASE_URL", get_settings().database_url)
config.set_main_option("sqlalchemy.url", normalized_database_url(migration_url).replace("%", "%%"))
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=config.get_main_option("sqlalchemy.url"), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        if config.get_main_option("sqlalchemy.url").startswith("postgresql"):
            context.execute("CREATE SCHEMA IF NOT EXISTS mindmesh")
            context.execute("SET search_path TO mindmesh, public")
        context.run_migrations()


def run_migrations_online() -> None:
    engine = engine_from_config(config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool)
    if engine.dialect.name == "sqlite":
        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _record):
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    with engine.connect() as connection:
        if engine.dialect.name == "postgresql":
            connection.exec_driver_sql("CREATE SCHEMA IF NOT EXISTS mindmesh")
            connection.exec_driver_sql("SET search_path TO mindmesh, public")
            connection.commit()
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

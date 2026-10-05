"""Safely copy an existing MindMesh SQLite workspace into PostgreSQL."""

import argparse
import os
from datetime import datetime
from pathlib import Path

from sqlalchemy import MetaData, delete, select
from sqlalchemy.exc import IntegrityError

from .config import get_settings
from .database import make_engine, normalized_database_url

TABLES = [
    "users",
    "projects",
    "datasets",
    "training_configs",
    "training_runs",
    "model_metadata",
    "predictions",
    "conversations",
    "chat_messages",
]


def _same(left, right) -> bool:
    if isinstance(left, datetime) or isinstance(right, datetime):
        try:
            return datetime.fromisoformat(str(left)).replace(tzinfo=None) == datetime.fromisoformat(
                str(right)
            ).replace(tzinfo=None)
        except ValueError:
            return False
    return left == right


def migrate(source_path: Path, target_url: str, *, dry_run: bool = False) -> dict[str, int]:
    source_path = source_path.resolve()
    if not source_path.is_file():
        raise RuntimeError(f"SQLite source does not exist: {source_path}")
    target_url = normalized_database_url(target_url)
    if not target_url.startswith("postgresql+"):
        raise RuntimeError("The import target must be PostgreSQL.")
    source = make_engine(f"sqlite:///{source_path.as_posix()}")
    target = make_engine(target_url)
    copied = {name: 0 for name in TABLES}
    skipped = {name: 0 for name in TABLES}
    try:
        source_meta = MetaData()
        target_meta = MetaData()
        source_meta.reflect(source)
        target_meta.reflect(target)
        missing = [name for name in TABLES if name not in source_meta.tables]
        target_missing = [name for name in TABLES if name not in target_meta.tables]
        if missing:
            raise RuntimeError(f"SQLite source is missing tables: {', '.join(missing)}")
        if target_missing:
            raise RuntimeError(
                "PostgreSQL target is not migrated; missing tables: " + ", ".join(target_missing)
            )
        rows_by_table = {}
        with source.connect() as source_connection:
            for name in TABLES:
                rows_by_table[name] = [
                    dict(row)
                    for row in source_connection.execute(
                        select(source_meta.tables[name])
                    ).mappings()
                ]
        with target.begin() as target_connection:
            for name in TABLES:
                destination = target_meta.tables[name]
                pk_names = [column.name for column in destination.primary_key.columns]
                for row in rows_by_table[name]:
                    values = {key: value for key, value in row.items() if key in destination.c}
                    criteria = [destination.c[key] == values[key] for key in pk_names]
                    existing = (
                        target_connection.execute(select(destination).where(*criteria))
                        .mappings()
                        .first()
                    )
                    if existing:
                        if not all(_same(existing[key], value) for key, value in values.items()):
                            raise RuntimeError(
                                f"Conflict in {name} for primary key {tuple(values[key] for key in pk_names)}"
                            )
                        skipped[name] += 1
                    else:
                        target_connection.execute(destination.insert().values(**values))
                        copied[name] += 1
            user_ids = [row["id"] for row in rows_by_table["users"]]
            if user_ids and "sessions" in target_meta.tables:
                target_connection.execute(
                    delete(target_meta.tables["sessions"]).where(
                        target_meta.tables["sessions"].c.user_id.in_(user_ids)
                    )
                )
            for name in TABLES:
                destination = target_meta.tables[name]
                source_ids = [row["id"] for row in rows_by_table[name]]
                if not source_ids:
                    continue
                found = set(
                    target_connection.scalars(
                        select(destination.c.id).where(destination.c.id.in_(source_ids))
                    )
                )
                if found != set(source_ids):
                    raise RuntimeError(f"Verification failed after importing {name}.")
            if dry_run:
                target_connection.rollback()
        return {name: copied[name] + skipped[name] for name in TABLES}
    except IntegrityError as error:
        raise RuntimeError(
            "Import stopped because the target contains a conflicting unique value. "
            "No source records were changed and the PostgreSQL transaction was rolled back."
        ) from error
    finally:
        source.dispose()
        target.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=Path, required=True, help="Path to the old SQLite database"
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate and roll back the import")
    args = parser.parse_args()
    target = os.getenv("MINDMESH_MIGRATION_DATABASE_URL", get_settings().database_url)
    counts = migrate(args.source, target, dry_run=args.dry_run)
    action = "Validated" if args.dry_run else "Imported"
    print(f"{action} {sum(counts.values())} records. Sessions were deliberately not copied.")
    for name, count in counts.items():
        print(f"  {name}: {count}")


if __name__ == "__main__":
    main()

"""Copy private work to a fresh PostgreSQL database, preserving IDs and file bytes.

Stop both APIs before running. Reads MINDMESH_DATABASE_URL (source) and
MINDMESH_NEXT_DATABASE_URL (destination) from the ignored .env. Never modifies
the source or copies active sessions. Destination migrations must already exist.
"""

import hashlib
import json
import os
import re
import sys

from sqlalchemy import MetaData, func, select

from .config import get_settings
from .database import make_engine, normalized_database_url
from .migrate_sqlite import TABLES, _same
from .storage import MAX_ARTIFACT_BYTES


def copy_workspace(source, target, *, dry_run=False):
    """Atomic copy and byte verification. Refuse an occupied destination."""
    if source.url == target.url:
        raise RuntimeError("Source and destination must be different databases.")
    source_meta, target_meta = MetaData(), MetaData()
    source_meta.reflect(bind=source, only=TABLES)
    target_meta.reflect(bind=target, only=TABLES)
    settings = get_settings()
    counts = {}
    with source.connect() as original, target.connect() as destination:
        transaction = destination.begin()
        try:
            if any(
                destination.scalar(select(func.count()).select_from(table))
                for table in target_meta.tables.values()
            ):
                raise RuntimeError("Destination must be empty. No existing records were changed.")
            for name in TABLES:
                target_table = target_meta.tables[name]
                counts[name] = 0
                for row in original.execute(select(source_meta.tables[name])).mappings():
                    values = {key: value for key, value in row.items() if key in target_table.c}
                    if name == "datasets" and values.get("stored_name"):
                        stored_name = values["stored_name"]
                        if not re.fullmatch(r"[0-9a-f]{32}\.(csv|xlsx)", stored_name):
                            raise RuntimeError(
                                "An existing dataset has an invalid stored filename."
                            )
                        if values.get("content_bytes") is None:
                            values["content_bytes"] = (
                                settings.upload_dir / stored_name
                            ).read_bytes()
                        if len(values["content_bytes"]) > 25 * 1024 * 1024:
                            raise RuntimeError("An existing dataset exceeds the upload size limit.")
                    if name == "model_metadata":
                        artifact = json.loads(values["metadata_json"]).get("artifactName")
                        if artifact:
                            if not re.fullmatch(r"[0-9a-f]{32}\.joblib", artifact):
                                raise RuntimeError(
                                    "An existing model has an invalid artifact filename."
                                )
                            if values.get("artifact_bytes") is None:
                                values["artifact_bytes"] = (
                                    settings.model_dir / artifact
                                ).read_bytes()
                            if len(values["artifact_bytes"]) > MAX_ARTIFACT_BYTES:
                                raise RuntimeError(
                                    "An existing model exceeds the artifact size limit."
                                )
                    destination.execute(target_table.insert().values(**values))
                    saved = (
                        destination.execute(
                            select(target_table).where(target_table.c.id == values["id"])
                        )
                        .mappings()
                        .one()
                    )
                    for key, value in values.items():
                        if isinstance(value, (bytes, memoryview)):
                            matches = (
                                hashlib.sha256(value).digest()
                                == hashlib.sha256(saved[key]).digest()
                            )
                        else:
                            matches = _same(value, saved[key])
                        if not matches:
                            raise RuntimeError(
                                "Database copy verification failed; import rolled back."
                            )
                    counts[name] += 1
            transaction.rollback() if dry_run else transaction.commit()
        except Exception:
            if transaction.is_active:
                transaction.rollback()
            raise
    if not dry_run:
        # Check committed rows through a new connection as well as in-transaction bytes.
        with target.connect() as connection:
            for name, count in counts.items():
                if (
                    connection.scalar(select(func.count()).select_from(target_meta.tables[name]))
                    != count
                ):
                    raise RuntimeError("Post-copy row count verification failed.")
    return counts


def main():
    source = target = None
    try:
        source_url = get_settings().database_url
        target_url = os.getenv("MINDMESH_NEXT_DATABASE_URL", "")
        if not normalized_database_url(target_url).startswith("postgresql+psycopg://"):
            raise RuntimeError("Set MINDMESH_NEXT_DATABASE_URL to the new PostgreSQL connection.")
        source = make_engine(source_url)
        target = make_engine(target_url)
        counts = copy_workspace(source, target, dry_run="--dry-run" in sys.argv)
        print(
            f"Verified {sum(counts.values())} private records, including complete files. Sessions excluded."
        )
        print(
            "Dry run rolled back."
            if "--dry-run" in sys.argv
            else "Copy committed; original database unchanged."
        )
    except Exception as error:
        # DB exceptions and URLs can include credentials or private record values.
        print(
            f"Copy stopped ({type(error).__name__}). Check connections, destination migrations, and local files.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
    finally:
        if source is not None:
            source.dispose()
        if target is not None:
            target.dispose()


if __name__ == "__main__":
    main()

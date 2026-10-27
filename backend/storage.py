"""Disposable private cache; durable bytes belong to their owning database row.

Callers authorize records before accessing their bytes. Browser requests cannot
supply cache paths or upload serialized model binaries.
"""

import os
from pathlib import Path
from uuid import uuid4

MAX_ARTIFACT_BYTES = 50 * 1024 * 1024


def materialize(path: Path, contents: bytes | None) -> Path:
    """Restore a missing cache file; legacy records can retain their local file."""
    if path.is_file() or contents is None:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{uuid4().hex}.part")
    try:
        with temporary.open("xb") as target:
            target.write(contents)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return path

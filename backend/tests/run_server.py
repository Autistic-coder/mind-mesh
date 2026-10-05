"""Run a disposable, migrated API for browser acceptance tests."""

import os
import tempfile
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config

with tempfile.TemporaryDirectory(prefix="mindmesh-e2e-") as directory:
    root = Path(directory)
    os.environ["MINDMESH_DATABASE_URL"] = f"sqlite:///{(root / 'mindmesh.db').as_posix()}"
    os.environ["MINDMESH_UPLOAD_DIR"] = str(root / "uploads")
    os.environ["MINDMESH_MODEL_DIR"] = str(root / "models")
    os.environ["MINDMESH_ORIGIN"] = "http://127.0.0.1:4173"
    command.upgrade(Config("alembic.ini"), "head")
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8001, access_log=False)

"""Runtime paths and browser-origin settings for the local API."""

import os
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    database_url: str
    upload_dir: Path
    origin: str
    secure_cookies: bool


def get_settings() -> Settings:
    return Settings(
        database_url=os.getenv(
            "MINDMESH_DATABASE_URL", f"sqlite:///{(ROOT / 'var' / 'mindmesh.db').as_posix()}"
        ),
        upload_dir=Path(os.getenv("MINDMESH_UPLOAD_DIR", str(ROOT / "var" / "uploads"))).resolve(),
        origin=os.getenv("MINDMESH_ORIGIN", "http://127.0.0.1:5173").rstrip("/"),
        secure_cookies=os.getenv("MINDMESH_SECURE_COOKIES", "false").lower() == "true",
    )

"""Runtime configuration loaded from environment variables or the repository .env file."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env", override=False)


def _integer(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer.") from error
    if value < 1:
        raise RuntimeError(f"{name} must be greater than zero.")
    return value


@dataclass(frozen=True)
class Settings:
    database_url: str
    upload_dir: Path
    model_dir: Path
    origin: str
    secure_cookies: bool
    trust_proxy_headers: bool
    pool_size: int
    max_overflow: int
    rate_register_hour: int
    rate_login_ip_minute: int
    rate_login_email_minute: int
    rate_upload_minute: int
    rate_train_minute: int
    rate_predict_minute: int
    rate_batch_predict_minute: int


def get_settings() -> Settings:
    database_url = os.getenv("MINDMESH_DATABASE_URL", "").strip()
    allow_sqlite = os.getenv("MINDMESH_ALLOW_SQLITE", "false").lower() == "true"
    if not database_url:
        raise RuntimeError(
            "MINDMESH_DATABASE_URL is required. Copy the PostgreSQL connection string from "
            "Supabase Dashboard > Connect into your local .env file."
        )
    if database_url.startswith("sqlite") and not allow_sqlite:
        raise RuntimeError(
            "SQLite is supported only for tests and the one-time import source. "
            "Set MINDMESH_DATABASE_URL to PostgreSQL for the application."
        )
    return Settings(
        database_url=database_url,
        upload_dir=Path(os.getenv("MINDMESH_UPLOAD_DIR", str(ROOT / "var" / "uploads"))).resolve(),
        model_dir=Path(os.getenv("MINDMESH_MODEL_DIR", str(ROOT / "var" / "models"))).resolve(),
        origin=os.getenv("MINDMESH_ORIGIN", "http://127.0.0.1:5173").rstrip("/"),
        secure_cookies=os.getenv("MINDMESH_SECURE_COOKIES", "false").lower() == "true",
        trust_proxy_headers=os.getenv("MINDMESH_TRUST_PROXY_HEADERS", "false").lower() == "true",
        pool_size=_integer("MINDMESH_DB_POOL_SIZE", 5),
        max_overflow=_integer("MINDMESH_DB_MAX_OVERFLOW", 5),
        rate_register_hour=_integer("MINDMESH_RATE_REGISTER_PER_HOUR", 20),
        rate_login_ip_minute=_integer("MINDMESH_RATE_LOGIN_IP_PER_MINUTE", 10),
        rate_login_email_minute=_integer("MINDMESH_RATE_LOGIN_EMAIL_PER_MINUTE", 5),
        rate_upload_minute=_integer("MINDMESH_RATE_UPLOAD_PER_MINUTE", 10),
        rate_train_minute=_integer("MINDMESH_RATE_TRAIN_PER_MINUTE", 5),
        rate_predict_minute=_integer("MINDMESH_RATE_PREDICT_PER_MINUTE", 60),
        rate_batch_predict_minute=_integer("MINDMESH_RATE_BATCH_PREDICT_PER_MINUTE", 10),
    )

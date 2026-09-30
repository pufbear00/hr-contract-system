"""Isolated local-only settings; deliberately ignore environment and .env files."""
from dataclasses import dataclass, field
from pathlib import Path
import secrets

BASE_DIR = Path(__file__).resolve().parent.parent
RUNTIME_DIR = BASE_DIR / "local_runtime"


@dataclass(frozen=True)
class Settings:
    DATABASE_URL: str = f"sqlite+aiosqlite:///{RUNTIME_DIR / 'empty_hr.db'}"
    SECRET_KEY: str = field(default_factory=lambda: secrets.token_urlsafe(48))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    UPLOAD_DIR: Path = RUNTIME_DIR / "uploads"
    GENERATED_DIR: Path = RUNTIME_DIR / "generated"
    OFFLINE_MODE: bool = True


settings = Settings()
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.GENERATED_DIR.mkdir(parents=True, exist_ok=True)

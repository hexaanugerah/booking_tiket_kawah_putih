"""Application configuration loaded from environment variables."""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "DocuConvert"
    environment: str = "development"
    api_prefix: str = "/api/v1"

    secret_key: str = "dev-only-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'docuconvert.db').as_posix()}"

    storage_dir: Path = PROJECT_DIR / "storage"
    max_upload_mb: int = 25
    max_files_per_job: int = 10
    result_ttl_hours: int = 24
    cleanup_interval_minutes: int = 15
    conversion_timeout_seconds: int = 180
    allow_anonymous: bool = True
    rate_limit_per_minute: int = 60

    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001"
    )

    libreoffice_path: str | None = None
    tesseract_cmd: str | None = None

    @field_validator("storage_dir", mode="before")
    @classmethod
    def _resolve_storage(cls, value: str | Path) -> Path:
        path = Path(value)
        return path if path.is_absolute() else (PROJECT_DIR / path)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    (settings.storage_dir / "inputs").mkdir(exist_ok=True)
    (settings.storage_dir / "outputs").mkdir(exist_ok=True)
    return settings


settings = get_settings()

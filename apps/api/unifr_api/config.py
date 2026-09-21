from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="UNIFR_", env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://unifr:unifr_dev@localhost:5432/unifr"
    account_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:4173"]
    admin_token: str = ""
    backup_dir: Path = Path("/backups")
    operations_dir: Path = Path("/operations")
    source_documents: list[dict[str, str]] = []
    alert_hook: str = ""
    database_limit_bytes: int = 10_737_418_240
    disk_minimum_bytes: int = 1_073_741_824

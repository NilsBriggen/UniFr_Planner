from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="UNIFR_", env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://unifr:unifr_dev@localhost:5432/unifr"

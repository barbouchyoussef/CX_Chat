import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv


def load_env_file() -> None:
    # Keep it tolerant on Windows where .env is often saved as cp1252/latin-1.
    for encoding in ("utf-8", "cp1252", "latin-1"):
        try:
            load_dotenv(encoding=encoding)
            return
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("env", b"", 0, 1, "Unable to decode .env with utf-8, cp1252, or latin-1")


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_env: str
    database_url: str
    mistral_api_key: str | None
    mistral_model: str
    mistral_base_url: str
    langsearch_api_key: str | None
    langsearch_base_url: str


@lru_cache
def get_settings() -> Settings:
    load_env_file()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL is not set")

    return Settings(
        app_name=os.getenv("APP_NAME", "CX Assessment API"),
        app_env=os.getenv("APP_ENV", "development"),
        database_url=database_url,
        mistral_api_key=os.getenv("MISTRAL_API_KEY"),
        mistral_model=os.getenv("MISTRAL_MODEL", "mistral-small-latest"),
        mistral_base_url=os.getenv("MISTRAL_BASE_URL", "https://api.mistral.ai/v1"),
        langsearch_api_key=os.getenv("LANGSEARCH_API_KEY"),
        langsearch_base_url=os.getenv("LANGSEARCH_BASE_URL", "https://api.langsearch.com/v1"),
    )

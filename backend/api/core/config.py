from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List
import json


class Settings(BaseSettings):
    APP_NAME: str = "FinanceModule Backend API"

    # -----------------------------
    # CORS
    # -----------------------------
    # IMPORTANT: Keep this as a STRING so pydantic-settings doesn't try json.loads
    # before validators. We'll parse it ourselves into a list.
    #
    # Supports:
    #   - CSV:  "http://localhost,http://127.0.0.1"
    #   - JSON: '["http://localhost","http://127.0.0.1"]'
    ALLOWED_ORIGINS: str = "http://localhost,http://127.0.0.1"

    @property
    def allowed_origins_list(self) -> List[str]:
        s = (self.ALLOWED_ORIGINS or "").strip()
        if not s:
            return []

        # If it looks like JSON, try JSON parsing first
        if s.startswith("["):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return [str(x).strip() for x in parsed if str(x).strip()]
            except Exception:
                # fall back to CSV
                pass

        # CSV fallback
        return [x.strip() for x in s.split(",") if x.strip()]

    # -----------------------------
    # JWT
    # -----------------------------
    SECRET_KEY: str = "your_secret_key"  # override in prod via .env / secrets
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # -----------------------------
    # Database
    # -----------------------------
    # Preferred in cloud
    DATABASE_URL: Optional[str] = None

    # Fallback pieces (local compose)
    DB_HOST: str = "database"
    DB_PORT: int = 5432
    DB_NAME: str = "bridgepointdb"
    DB_USER: str = "gm61admin"
    DB_PASSWORD: str = "camioninsta"

    # Optional connect timeout
    DB_CONNECT_TIMEOUT: int = 5

    # Optional sslmode for fallback URL (Azure typically requires require)
    DB_SSLMODE: Optional[str] = None

    @property
    def effective_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL

        base = f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        if self.DB_SSLMODE:
            joiner = "&" if "?" in base else "?"
            return f"{base}{joiner}sslmode={self.DB_SSLMODE}"
        return base

    # -----------------------------
    # Upload storage (Docker volume mount)
    # -----------------------------
    UPLOAD_BASE_DIR: str = "/data/uploads"
    MAX_UPLOAD_MB: int = 25

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)


settings = Settings()
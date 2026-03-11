# app/core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List
import json


class Settings(BaseSettings):
    APP_NAME: str = "BridgePoint API"

    # -----------------------------
    # CORS
    # -----------------------------
    # IMPORTANT: Keep this as a STRING so pydantic-settings doesn't try json.loads
    # before validators. We'll parse it ourselves into a list.
    #
    # Supports:
    #   - CSV:  "http://localhost,http://127.0.0.1"
    #   - JSON: '["http://localhost","http://127.0.0.1"]'
    ROOT_PATH: str = ""
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

    # ✅ Option A: short-lived refresh token (longer than access token)
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60

    # -----------------------------
    # Refresh cookie settings
    # -----------------------------
    # Cookie name for refresh token
    REFRESH_COOKIE_NAME: str = "bp_refresh"

    # Cookie security flags:
    # - In production over HTTPS: set COOKIE_SECURE=True
    # - If frontend + backend are on different subdomains and you need cross-site cookies:
    #     set COOKIE_SAMESITE="none" AND COOKIE_SECURE=True
    COOKIE_SECURE: bool = False
    COOKIE_HTTPONLY: bool = True
    COOKIE_SAMESITE: str = "lax"   # "lax" | "strict" | "none"
    COOKIE_DOMAIN: Optional[str] = None  # e.g. ".bridgepoint.co.uk" (optional)
    COOKIE_PATH: str = "/"  # usually "/"

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
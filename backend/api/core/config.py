
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = "FinanceModule Backend API"

    # CORS (safe for dev; same-origin via Nginx in prod)
    ALLOWED_ORIGINS: List[str] = ["http://localhost", "http://127.0.0.1"]

    # JWT
    SECRET_KEY: str = "your_secret_key"   # override in prod via .env / secrets
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Database
    DB_HOST: str = "database"
    DB_PORT: int = 5432
    DB_NAME: str = "bridgepointdb"
    DB_USER: str = "gm61admin"
    DB_PASSWORD: str = "camioninsta"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

settings = Settings()

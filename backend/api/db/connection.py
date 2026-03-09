import psycopg2
from app.core.config import settings


def get_db_connection():
    """
    Return a psycopg2 connection using settings.

    Priority:
      1) settings.DATABASE_URL (Azure)
      2) DB_* fallback (local compose)

    Adds safe defaults:
      - application_name
      - connect_timeout
    """
    connect_timeout = getattr(settings, "DB_CONNECT_TIMEOUT", 5)

    # psycopg2 can accept a DSN/URL string directly
    return psycopg2.connect(
        settings.effective_database_url,
        application_name="bridgepoint-backend",
        connect_timeout=connect_timeout,
    )
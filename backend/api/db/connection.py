
# app/db/connection.py
import psycopg2
from app.core.config import settings

def get_db_connection():
    """
    Return a psycopg2 connection using settings.
    Adds a small set of safe defaults:
      - application_name (helps when inspecting connections in Postgres)
      - connect_timeout (defaults to 5s if not present in settings)
    """
    connect_timeout = getattr(settings, "DB_CONNECT_TIMEOUT", 5)

    return psycopg2.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        dbname=settings.DB_NAME,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        application_name="bridgepoint-backend",
        connect_timeout=connect_timeout,
    )

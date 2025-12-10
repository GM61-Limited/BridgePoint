
import psycopg2.extras
from typing import Optional, Dict, Any
from app.db.connection import get_db_connection

def fetch_environment(env_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute("SELECT id, name, domain FROM environment WHERE id = %s", (env_id,))
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        try: cur.close()
        except Exception: pass
        conn.close()

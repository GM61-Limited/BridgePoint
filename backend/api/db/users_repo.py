
import psycopg2.extras
from typing import Optional, Dict, Any
from app.db.connection import get_db_connection

def fetch_login_user(username: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(
            "SELECT username, password_hash, environment_id FROM users WHERE username = %s",
            (username,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        try: cur.close()
        except Exception: pass
        conn.close()

def fetch_user_profile(username: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(
            "SELECT username, role, environment_id FROM users WHERE username = %s",
            (username,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        try: cur.close()
        except Exception: pass
        conn.close()

def list_users() -> list[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute("SELECT id, username, role, environment_id FROM users")
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        try: cur.close()
        except Exception: pass
        conn.close()

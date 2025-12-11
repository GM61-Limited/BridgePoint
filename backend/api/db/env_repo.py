
# app/db/env_repo.py
import psycopg2.extras
from typing import Optional, Dict, Any
from app.db.connection import get_db_connection

def fetch_environment(env_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetch an environment row by id. Returns: { id, name, domain, created_at }
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(
            "SELECT id, name, domain, created_at FROM environment WHERE id = %s",
            (env_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        try: cur.close()
        except Exception: pass
        conn.close()

def update_environment(env_id: int, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Update environment name/domain. Ignores unknown keys safely.
    Returns the updated row or None if not found.
    """
    allowed = {k: v for k, v in updates.items() if k in {"name", "domain"}}
    if not allowed:
        return fetch_environment(env_id)

    set_clause = ", ".join(f"{k} = %s" for k in allowed.keys())
    params = [*allowed.values(), env_id]

    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(
            f"""
            UPDATE environment
            SET {set_clause}
            WHERE id = %s
            RETURNING id, name, domain, created_at
            """,
            params,
        )
        row = cur.fetchone()
        if row:
            conn.commit()
            return dict(row)
        conn.rollback()
        return None
    except Exception:
        conn.rollback()
        raise
    finally:
        try: cur.close()
        except Exception: pass
        conn.close()

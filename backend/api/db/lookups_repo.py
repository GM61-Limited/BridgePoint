# app/db/lookups_repo.py
from __future__ import annotations

from typing import List, Dict, Any
import psycopg2.extras

from app.db.connection import get_db_connection


def get_machine_types() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT key, display_name, description, is_active
            FROM machine_types
            ORDER BY display_name ASC
            """
        )
        rows = cur.fetchall()
        return list(rows) if rows else []
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def get_integration_profiles() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT key, display_name, description, is_active
            FROM integration_profiles
            ORDER BY display_name ASC
            """
        )
        rows = cur.fetchall()
        return list(rows) if rows else []
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()
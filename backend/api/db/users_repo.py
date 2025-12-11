# app/db/users_repo.py
"""
Tenant-scoped repository for Users.

Provides:
- list_users_for_environment(environment_id)
- get_user_by_id(user_id, environment_id)
- fetch_login_user(username)
- fetch_user_profile(username, environment_id)
- update_last_login(user_id)
- create_user(environment_id, username, email, role, first_name, last_name, password)
- update_user(user_id, environment_id, updates)  # allowed: username, email, role, first_name, last_name, is_active
- set_user_password(user_id, environment_id, new_password)
- delete_user(user_id, environment_id)  # optional convenience

All mutation operations are scoped by environment_id to prevent cross-tenant writes.
A tiny _log helper writes to system_logs for auditability.

Requires:
- psycopg2 (DictCursor)
- bcrypt (pip install bcrypt)
"""

from typing import Optional, Dict, Any, List, Tuple
import json
import datetime

import psycopg2.extras
from psycopg2 import errors

from app.db.connection import get_db_connection

try:
    import bcrypt  # type: ignore
except Exception as e:
    raise RuntimeError(
        "bcrypt is required for password hashing. Install with `pip install bcrypt`."
    ) from e


# -------------------------
# Cursor helper
# -------------------------
def _dict_cur(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.DictCursor)


# -------------------------
# READ / LIST
# -------------------------
def list_users_for_environment(environment_id: int) -> List[Dict[str, Any]]:
    """
    Return users for a tenant, ordered by username.
    Fields: id, username, first_name, last_name, email, role, environment_id, is_active, created_at, last_logged_in
    """
    conn = get_db_connection()
    try:
        cur = _dict_cur(conn)
        cur.execute(
            """
            SELECT id, username, first_name, last_name, email, role,
                   environment_id, is_active, created_at, last_logged_in
            FROM users
            WHERE environment_id = %s
            ORDER BY username ASC
            """,
            (environment_id,),
        )
        return [dict(r) for r in cur.fetchall()]
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def get_user_by_id(user_id: int, environment_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetch a single user by id within a tenant.
    """
    conn = get_db_connection()
    try:
        cur = _dict_cur(conn)
        cur.execute(
            """
            SELECT id, username, first_name, last_name, email, role,
                   environment_id, is_active, created_at, last_logged_in
            FROM users
            WHERE id = %s AND environment_id = %s
            """,
            (user_id, environment_id),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def fetch_login_user(username: str) -> Optional[Dict[str, Any]]:
    """
    For login flows: return username + password_hash, plus role and environment mapping.
    """
    conn = get_db_connection()
    try:
        cur = _dict_cur(conn)
        cur.execute(
            """
            SELECT id, username, password_hash, role, environment_id, is_active, last_logged_in
            FROM users
            WHERE username = %s
            """,
            (username,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def fetch_user_profile(username: str, environment_id: int) -> Optional[Dict[str, Any]]:
    """
    User profile within a tenant: name/email/role and timestamps.
    """
    conn = get_db_connection()
    try:
        cur = _dict_cur(conn)
        cur.execute(
            """
            SELECT id, username, first_name, last_name, email, role,
                   environment_id, is_active, created_at, last_logged_in
            FROM users
            WHERE username = %s AND environment_id = %s
            """,
            (username, environment_id),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def update_last_login(user_id: int):
    """
    Update last_logged_in to now (UTC).
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE users SET last_logged_in = %s WHERE id = %s",
            (datetime.datetime.utcnow(), user_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


# -------------------------
# CREATE / UPDATE / PASSWORD
# -------------------------
def create_user(
    *,
    environment_id: int,
    username: str,
    email: Optional[str],
    role: str = "Viewer",  # TitleCase (Admin/Editor/Viewer)
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    password: Optional[str] = None,
    is_active: bool = True,
) -> Dict[str, Any]:
    """
    Create a user in an environment; hashes password if provided.
    Enforces per-tenant uniqueness via DB constraint.
    """
    pw_hash = (
        bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        if password
        else None
    )

    conn = get_db_connection()
    try:
        cur = _dict_cur(conn)
        cur.execute(
            """
            INSERT INTO users (username, email, role, environment_id,
                               first_name, last_name, password_hash, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, username, first_name, last_name, email, role,
                      environment_id, is_active, created_at, last_logged_in
            """,
            (username, email, role, environment_id, first_name, last_name, pw_hash, is_active),
        )
        row = cur.fetchone()
        conn.commit()
        _log(environment_id=environment_id, user_id=row["id"], action="user.create", details={
            "username": username, "email": email, "role": role, "first_name": first_name, "last_name": last_name
        })
        return dict(row)
    except errors.UniqueViolation:
        conn.rollback()
        # Propagate; route layer should translate to 409 Conflict with a clear message
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


_ALLOWED_UPDATE_FIELDS = {"username", "email", "role", "first_name", "last_name", "is_active"}

def update_user(
    *,
    user_id: int,
    environment_id: int,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    Patch user fields (allowed set only) scoped to environment.
    Returns the updated record or None if not found.
    """
    # Filter only allowed fields
    fields = []
    vals: List[Any] = []
    for k, v in updates.items():
        if k in _ALLOWED_UPDATE_FIELDS:
            fields.append(f"{k} = %s")
            vals.append(v)

    if not fields:
        return get_user_by_id(user_id, environment_id)

    set_clause = ", ".join(fields)

    conn = get_db_connection()
    try:
        cur = _dict_cur(conn)
        cur.execute(
            f"""
            UPDATE users
            SET {set_clause}
            WHERE id = %s AND environment_id = %s
            RETURNING id, username, first_name, last_name, email, role,
                      environment_id, is_active, created_at, last_logged_in
            """,
            (*vals, user_id, environment_id),
        )
        row = cur.fetchone()
        if row:
            conn.commit()
            _log(environment_id=environment_id, user_id=row["id"], action="user.update",
                 details={k: updates[k] for k in updates if k in _ALLOWED_UPDATE_FIELDS})
            return dict(row)
        conn.rollback()
        return None
    except errors.UniqueViolation:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def set_user_password(*, user_id: int, environment_id: int, new_password: str) -> bool:
    """
    Reset password for a user within a tenant; returns True if updated.
    """
    pw_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE users
            SET password_hash = %s
            WHERE id = %s AND environment_id = %s
            """,
            (pw_hash, user_id, environment_id),
        )
        ok = cur.rowcount == 1
        conn.commit()
        if ok:
            _log(environment_id=environment_id, user_id=user_id, action="user.password.reset", details=None)
        return ok
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def delete_user(*, user_id: int, environment_id: int) -> bool:
    """
    Delete a user within a tenant (optional convenience).
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM users WHERE id = %s AND environment_id = %s",
            (user_id, environment_id),
        )
        ok = cur.rowcount == 1
        conn.commit()
        if ok:
            _log(environment_id=environment_id, user_id=user_id, action="user.delete", details=None)
        return ok
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


# -------------------------
# Tiny system log helper
# -------------------------
def _log(*, environment_id: int, user_id: Optional[int], action: str, details: Optional[Dict[str, Any]]):
    """
    Writes to system_logs. Non-blocking: logs failures are swallowed.
    Uses a fresh connection to avoid interfering with main transaction.
    """
    own_conn = None
    try:
        own_conn = get_db_connection()
        cur = own_conn.cursor()
        cur.execute(
            """
            INSERT INTO system_logs (environment_id, user_id, action, details)
            VALUES (%s, %s, %s, %s)
            """,
            (environment_id, user_id, action, json.dumps(details) if details else None),
        )
        own_conn.commit()
        try:
            cur.close()
        except Exception:
            pass
    except Exception:
        # Intentionally swallow logging errors
        try:
            own_conn and own_conn.rollback()
        except Exception:
            pass
    finally:
        try:
            own_conn and own_conn.close()
        except Exception:
            pass
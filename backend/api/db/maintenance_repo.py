# app/db/maintenance_repo.py
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

import psycopg2.extras


# -----------------------------
# SQL strings (kept centralised)
# -----------------------------

SELECT_MACHINE_IN_ENV_SQL = """
SELECT id, machine_name
FROM machines
WHERE id = %s AND environment_id = %s
"""

LIST_SQL = """
SELECT
  ml.id,
  ml.machine_id,
  m.machine_name,
  ml.reason,
  ml.started_at,
  ml.ended_at,
  ml.notes,
  ml.created_at,
  ml.created_by
FROM maintenance_logs ml
JOIN machines m
  ON m.id = ml.machine_id
 AND m.environment_id = ml.environment_id
WHERE ml.environment_id = %s
{filters}
ORDER BY ml.started_at DESC
LIMIT %s OFFSET %s
"""

GET_ONE_SQL = """
SELECT
  ml.id,
  ml.machine_id,
  m.machine_name,
  ml.reason,
  ml.started_at,
  ml.ended_at,
  ml.notes,
  ml.created_at,
  ml.created_by
FROM maintenance_logs ml
JOIN machines m
  ON m.id = ml.machine_id
 AND m.environment_id = ml.environment_id
WHERE ml.environment_id = %s AND ml.id = %s
"""

GET_OWNER_SQL = """
SELECT id, created_by
FROM maintenance_logs
WHERE environment_id = %s AND id = %s
"""

INSERT_SQL = """
INSERT INTO maintenance_logs
  (environment_id, machine_id, reason, started_at, ended_at, notes, created_by)
VALUES
  (%s, %s, %s, %s, %s, %s, %s)
RETURNING id
"""

DELETE_SQL = """
DELETE FROM maintenance_logs
WHERE environment_id = %s AND id = %s
"""


# -----------------------------
# Repo functions
# -----------------------------

def get_machine_in_env(
    conn,
    *,
    env_id: int,
    machine_id: int,
) -> Optional[Dict[str, Any]]:
    """
    Returns {"id": ..., "machine_name": ...} if machine exists in env, else None.
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(SELECT_MACHINE_IN_ENV_SQL, (machine_id, env_id))
        row = cur.fetchone()
        return dict(row) if row else None


def list_maintenance_logs(
    conn,
    *,
    env_id: int,
    machine_id: Optional[int] = None,
    q: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """
    List maintenance logs for a tenant (environment).
    Optional filters:
      - machine_id
      - q (search in machine_name / reason / notes)
    """
    filters_sql = ""
    params: List[Any] = [env_id]

    if machine_id is not None:
        filters_sql += " AND ml.machine_id = %s"
        params.append(int(machine_id))

    if q and str(q).strip():
        like = f"%{str(q).strip()}%"
        filters_sql += """
          AND (
            m.machine_name ILIKE %s
            OR ml.reason ILIKE %s
            OR COALESCE(ml.notes, '') ILIKE %s
          )
        """
        params.extend([like, like, like])

    # limit/offset always last
    params.extend([int(limit), int(offset)])

    sql = LIST_SQL.format(filters=filters_sql)

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def get_maintenance_log(
    conn,
    *,
    env_id: int,
    log_id: UUID,
) -> Optional[Dict[str, Any]]:
    """
    Returns a single maintenance log row in the frontend shape (includes machine_name),
    or None if not found in this env.
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(GET_ONE_SQL, (env_id, log_id))
        row = cur.fetchone()
        return dict(row) if row else None


def get_maintenance_log_owner(
    conn,
    *,
    env_id: int,
    log_id: UUID,
) -> Optional[Dict[str, Any]]:
    """
    Returns {"id": ..., "created_by": ...} or None.
    Useful for auth checks in routes.
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(GET_OWNER_SQL, (env_id, log_id))
        row = cur.fetchone()
        return dict(row) if row else None


def create_maintenance_log(
    conn,
    *,
    env_id: int,
    user_id: Optional[int],
    machine_id: int,
    reason: str,
    started_at: datetime,
    ended_at: Optional[datetime] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Inserts a maintenance log and returns the created row in frontend shape.

    NOTE:
      - Assumes validation (end >= start etc.) is already handled by the route.
      - Will raise if machine isn't in env (we check explicitly).
      - Does not close connection. Caller should commit/rollback.
    """
    # Tenant safety: ensure machine belongs to env
    machine = get_machine_in_env(conn, env_id=env_id, machine_id=machine_id)
    if not machine:
        raise ValueError("Machine not found in this environment")

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            INSERT_SQL,
            (env_id, machine_id, reason, started_at, ended_at, notes, user_id),
        )
        new_id = cur.fetchone()["id"]

    # Fetch full created row (includes machine_name)
    created = get_maintenance_log(conn, env_id=env_id, log_id=new_id)
    if not created:
        # Extremely unlikely, but keeps callers safe
        raise RuntimeError("Created maintenance log could not be reloaded")

    return created


def delete_maintenance_log(
    conn,
    *,
    env_id: int,
    log_id: UUID,
) -> int:
    """
    Deletes a maintenance log by id within a tenant.
    Returns number of rows deleted (0/1).
    Caller should commit/rollback.
    """
    with conn.cursor() as cur:
        cur.execute(DELETE_SQL, (env_id, log_id))
        return cur.rowcount
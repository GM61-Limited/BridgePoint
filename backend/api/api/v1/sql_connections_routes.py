
# app/api/v1/sql_connections_routes.py
import re
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, Query, Body, status

from app.db.connection import get_db_connection  # psycopg2 connection

import psycopg2
import psycopg2.extras

# IMPORTANT: no '/api' here. The frontend hits '/api/...' and Nginx strips '/api' before proxying.
router = APIRouter(prefix="/v1/sql-connections", tags=["sql-connections"])

# --- safety: SELECT-only guard ---
_SELECT_ONLY_RE = re.compile(r"^\s*SELECT\b", re.IGNORECASE)

def _validate_select_sql(sql: str) -> None:
    if ";" in sql.strip():
        raise HTTPException(status_code=400, detail="Multiple statements are not allowed.")
    if not _SELECT_ONLY_RE.match(sql or ""):
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed.")

# --- helper: build external DSN for psycopg2 ---
def _build_external_dsn(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "host": row["host"],
        "port": int(row["port"] or 5432),
        "dbname": row["database_name"],
        "user": row["username"],
        "password": row["password"],
        "connect_timeout": 5,  # seconds
        # TODO: if/when you add ssl columns, include: "sslmode": "require"
    }

# ----------------------------------------------------------------------
# CREATE: add a new SQL connection row
# ----------------------------------------------------------------------
@router.post("", status_code=201)
def create_sql_connection(
    body: Dict[str, Any] = Body(...),
    conn = Depends(get_db_connection),
) -> Dict[str, Any]:
    """
    Expects JSON body:
    {
      "environment_id": 2,
      "name": "Assure Test",
      "host": "4.250.37.33",
      "database_name": "postgres",
      "port": 5432,
      "table_name": null,
      "username": "GM61",
      "password": "Expert0."
    }
    """
    required = ["environment_id", "name", "host", "database_name", "port", "username", "password"]
    missing = [k for k in required if body.get(k) in (None, "", [])]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing fields: {', '.join(missing)}")

    environment_id = int(body["environment_id"])
    name = str(body["name"])
    host = str(body["host"])
    database_name = str(body["database_name"])
    port = int(body["port"])
    table_name = body.get("table_name")
    username = str(body["username"])
    password = str(body["password"])

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sql_connections
                  (environment_id, name, host, database_name, port, table_name, username, password)
                VALUES
                  (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (environment_id, name, host, database_name, port, table_name, username, password),
            )
            new_id = cur.fetchone()[0]
            conn.commit()
        return {"id": new_id}
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to create connection: {e}")

# ----------------------------------------------------------------------
# LIST: connections for an environment (no password returned)
# ----------------------------------------------------------------------
@router.get("")
def list_for_env(
    envId: int = Query(..., ge=1),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    conn = Depends(get_db_connection),
) -> List[Dict[str, Any]]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
              id, environment_id, name, host, database_name, port, table_name, username, created_at
            FROM sql_connections
            WHERE environment_id = %s
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
            """,
            (envId, limit, offset),
        )
        rows = cur.fetchall()
    return rows

# ----------------------------------------------------------------------
# TEST: external DB credentials (SELECT 1)
# ----------------------------------------------------------------------
@router.post("/{id}/test")
def test_one(
    id: int,
    conn = Depends(get_db_connection),
) -> Dict[str, Any]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM sql_connections WHERE id = %s", (id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SQL connection not found")

    try:
        ext = psycopg2.connect(**_build_external_dsn(row))
        try:
            with ext.cursor() as cur2:
                cur2.execute("SELECT 1")
                cur2.fetchone()
        finally:
            ext.close()
        return {"id": id, "ok": True}
    except Exception as e:
        return {"id": id, "ok": False, "error": str(e)}

# ----------------------------------------------------------------------
# QUERY: run safe, read‑only query against external DB
# ----------------------------------------------------------------------
@router.post("/{id}/query")
def run_query(
    id: int,
    body: Dict[str, Any] = Body(...),  # { "sql": "SELECT ... WHERE col = %s", "params": [123] }
    conn = Depends(get_db_connection),
) -> Dict[str, Any]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM sql_connections WHERE id = %s", (id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SQL connection not found")

    sql = (body.get("sql") or "").strip()
    params = body.get("params") or []
    _validate_select_sql(sql)

    try:
        ext = psycopg2.connect(**_build_external_dsn(row))
        try:
            with ext.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur2:
                cur2.execute(sql, params)
                rows = cur2.fetchmany(500)  # cap to 500 rows
        finally:
            ext.close()
        return {"rows": rows, "count": len(rows)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

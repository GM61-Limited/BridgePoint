
# app/core/external_pg.py
import re
from typing import Any, Dict, List, Optional, Tuple
import asyncpg

class QueryError(Exception):
    pass

# Very conservative check: allow only single SELECT statement.
_SELECT_RE = re.compile(r"^\s*SELECT\b", re.IGNORECASE)

def _validate_select_sql(sql: str) -> None:
    # Reject semicolons to prevent multi-statements
    if ";" in sql.strip():
        raise QueryError("Multiple statements are not allowed.")
    if not _SELECT_RE.match(sql or ""):
        raise QueryError("Only SELECT queries are allowed.")

def build_dsn(*, host: str, port: int, database: str, user: str, password: str, ssl: Optional[bool]) -> Dict[str, Any]:
    # asyncpg.connect accepts individual args; we pass them directly.
    opts: Dict[str, Any] = {
        "host": host,
        "port": int(port),
        "database": database,
        "user": user,
        "password": password,
    }
    # SSL: asyncpg uses a `ssl` argument that may be a context; for simple "require", pass True.
    if ssl:
        opts["ssl"] = True  # simple SSL; for production, provide an SSLContext with proper CA/cert.
    return opts

async def test_connection(opts: Dict[str, Any], *, timeout: float = 5.0) -> Tuple[bool, Optional[str]]:
    try:
        conn = await asyncpg.connect(**opts, timeout=timeout)
        try:
            await conn.execute("SELECT 1")  # lightweight ping
        finally:
            await conn.close()
        return True, None
    except Exception as e:
        return False, str(e)

async def run_select(
    opts: Dict[str, Any],
    *,
    sql: str,
    params: Optional[List[Any]] = None,
    timeout: float = 10.0,
    max_rows: int = 500
) -> List[Dict[str, Any]]:
    _validate_select_sql(sql)
    conn = await asyncpg.connect(**opts, timeout=timeout)
    try:
        # asyncpg uses $1, $2... positional parameters
        records = await conn.fetch(sql, *(params or []))
        # Convert asyncpg.Record -> dict, enforce max_rows
        out: List[Dict[str, Any]] = []
        for i, rec in enumerate(records):
            if i >= max_rows:
                break
            out.append(dict(rec))
        return out
    finally:
        await conn.close()

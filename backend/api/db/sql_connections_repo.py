
# app/db/sql_connections_repo.py
from typing import Any, Dict, List, Optional
from uuid import UUID
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

SELECT_ONE_SQL = """
SELECT
  id, environment_id, created_at,
  name, host, database_name, port, table_name,
  username, password,  -- NOTE: do not expose password to clients
  TRUE::boolean AS has_password
FROM sql_connections
WHERE id = :id
"""

SELECT_BY_ENV_SQL = """
SELECT
  id, environment_id, created_at,
  name, host, database_name, port, table_name,
  username,
  NULL AS password,         -- never send passwords out of the server
  FALSE::boolean AS has_password
FROM sql_connections
WHERE environment_id = :env_id
ORDER BY created_at DESC
LIMIT :limit OFFSET :offset
"""

async def get_sql_connection(conn: AsyncConnection, *, id: int) -> Optional[Dict[str, Any]]:
    row = (await conn.execute(text(SELECT_ONE_SQL), {"id": id})).mappings().first()
    return dict(row) if row else None

async def list_sql_connections(conn: AsyncConnection, *, env_id: int, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    rows = (await conn.execute(text(SELECT_BY_ENV_SQL), {"env_id": env_id, "limit": limit, "offset": offset})).mappings().all()
    return [dict(r) for r in rows]

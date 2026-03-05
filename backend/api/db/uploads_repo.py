from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from app.db.connection import get_db_connection


def create_washer_xml_upload(
    environment_code: str,
    machine_id: int,
    cycle_number: Optional[str],
    original_filename: str,
    stored_filename: str,
    stored_path: str,
    bytes_count: int,
) -> Dict[str, Any]:
    sql = """
        INSERT INTO washer_xml_uploads
          (environment_code, machine_id, cycle_number, original_filename, stored_filename, stored_path, bytes)
        VALUES
          (%s, %s, %s, %s, %s, %s, %s)
        RETURNING
          id, environment_code, machine_id, cycle_number,
          original_filename, stored_filename, stored_path, bytes,
          uploaded_at, parse_status
    """

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                (
                    environment_code,
                    machine_id,
                    cycle_number,
                    original_filename,
                    stored_filename,
                    stored_path,
                    bytes_count,
                ),
            )
            row = cur.fetchone()
            conn.commit()

        return {
            "id": row[0],
            "environment_code": row[1],
            "machine_id": row[2],
            "cycle_number": row[3],
            "original_filename": row[4],
            "stored_filename": row[5],
            "stored_path": row[6],
            "bytes": row[7],
            "uploaded_at": row[8].isoformat() if isinstance(row[8], datetime) else row[8],
            "parse_status": row[9],
        }
    finally:
        conn.close()


def list_washer_xml_uploads(
    environment_code: Optional[str] = None,
    machine_id: Optional[int] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    where = []
    params: List[Any] = []

    if environment_code:
        where.append("environment_code = %s")
        params.append(environment_code)

    if machine_id is not None:
        where.append("machine_id = %s")
        params.append(machine_id)

    where_clause = f"WHERE {' AND '.join(where)}" if where else ""
    sql = f"""
        SELECT
          id, environment_code, machine_id, cycle_number,
          original_filename, stored_filename, stored_path, bytes,
          uploaded_at, parse_status
        FROM washer_xml_uploads
        {where_clause}
        ORDER BY uploaded_at DESC
        LIMIT %s
    """
    params.append(limit)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

        items: List[Dict[str, Any]] = []
        for r in rows:
            items.append(
                {
                    "id": r[0],
                    "environment_code": r[1],
                    "machine_id": r[2],
                    "cycle_number": r[3],
                    "original_filename": r[4],
                    "stored_filename": r[5],
                    "stored_path": r[6],
                    "bytes": r[7],
                    "uploaded_at": r[8].isoformat() if isinstance(r[8], datetime) else r[8],
                    "parse_status": r[9],
                }
            )
        return items
    finally:
        conn.close()
# app/db/machines_repo.py
from __future__ import annotations

from typing import Optional, List, Dict, Any
import psycopg2
import psycopg2.extras

from app.db.connection import get_db_connection


MACHINE_SELECT_FIELDS = """
    id,
    environment_id,
    machine_name,
    machine_code,
    machine_type,
    manufacturer,
    model,
    serial_number,
    ip_address::text AS ip_address,
    port,
    hostname,
    protocol,
    base_path,
    location,
    timezone,
    notes,
    is_active,
    integration_key,
    created_at,
    updated_at
"""


def list_machines(
    env_id: int,
    machine_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    integration_key: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        where = ["environment_id = %s"]
        params: List[Any] = [env_id]

        if machine_type:
            where.append("machine_type = %s")
            params.append(machine_type)

        if is_active is not None:
            where.append("is_active = %s")
            params.append(is_active)

        if integration_key:
            where.append("integration_key = %s")
            params.append(integration_key)

        if search:
            where.append("(machine_name ILIKE %s OR machine_code ILIKE %s OR manufacturer ILIKE %s OR model ILIKE %s)")
            like = f"%{search}%"
            params.extend([like, like, like, like])

        sql = f"""
            SELECT {MACHINE_SELECT_FIELDS}
            FROM machines
            WHERE {" AND ".join(where)}
            ORDER BY machine_name ASC
        """
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        return list(rows) if rows else []
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def get_machine(env_id: int, machine_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            f"""
            SELECT {MACHINE_SELECT_FIELDS}
            FROM machines
            WHERE environment_id = %s AND id = %s
            """,
            (env_id, machine_id),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def create_machine(env_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            f"""
            INSERT INTO machines (
                environment_id,
                machine_name,
                machine_code,
                machine_type,
                manufacturer,
                model,
                serial_number,
                ip_address,
                port,
                hostname,
                protocol,
                base_path,
                location,
                timezone,
                notes,
                is_active,
                integration_key,
                created_at,
                updated_at
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s,
                %s::inet, %s, %s, %s, %s, %s, %s, %s,
                COALESCE(%s, TRUE),
                %s,
                NOW(), NOW()
            )
            RETURNING {MACHINE_SELECT_FIELDS}
            """,
            (
                env_id,
                payload.get("machine_name"),
                payload.get("machine_code"),
                payload.get("machine_type"),
                payload.get("manufacturer"),
                payload.get("model"),
                payload.get("serial_number"),
                payload.get("ip_address"),
                payload.get("port"),
                payload.get("hostname"),
                payload.get("protocol"),
                payload.get("base_path"),
                payload.get("location"),
                payload.get("timezone"),
                payload.get("notes"),
                payload.get("is_active"),
                payload.get("integration_key"),
            ),
        )
        row = cur.fetchone()
        conn.commit()
        return dict(row)
    except psycopg2.IntegrityError:
        conn.rollback()
        raise
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def update_machine(env_id: int, machine_id: int, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Partial update: only updates keys present in payload.
    """
    allowed_fields = {
        "machine_name",
        "machine_code",
        "machine_type",
        "manufacturer",
        "model",
        "serial_number",
        "ip_address",
        "port",
        "hostname",
        "protocol",
        "base_path",
        "location",
        "timezone",
        "notes",
        "is_active",
        "integration_key",
    }

    updates = []
    params: List[Any] = []

    for k, v in payload.items():
        if k not in allowed_fields:
            continue
        if k == "ip_address":
            updates.append("ip_address = %s::inet")
            params.append(v)
        else:
            updates.append(f"{k} = %s")
            params.append(v)

    if not updates:
        # No changes requested; return current
        return get_machine(env_id, machine_id)

    updates.append("updated_at = NOW()")

    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        params.extend([env_id, machine_id])

        cur.execute(
            f"""
            UPDATE machines
            SET {", ".join(updates)}
            WHERE environment_id = %s AND id = %s
            RETURNING {MACHINE_SELECT_FIELDS}
            """,
            tuple(params),
        )
        row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None
    except psycopg2.IntegrityError:
        conn.rollback()
        raise
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def soft_delete_machine(env_id: int, machine_id: int) -> bool:
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE machines
            SET is_active = FALSE, updated_at = NOW()
            WHERE environment_id = %s AND id = %s
            """,
            (env_id, machine_id),
        )
        updated = cur.rowcount > 0
        conn.commit()
        return updated
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()
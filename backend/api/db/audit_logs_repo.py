# app/db/audit_logs_repo.py
from __future__ import annotations

from typing import Optional, List, Dict, Any, Tuple, Union
from datetime import datetime, date, time, timedelta
import json
import logging

import psycopg2.extras

from app.db.connection import get_db_connection

log = logging.getLogger("bridgepoint")

# We alias system_logs as sl and join to users as u
SYSTEM_LOGS_SELECT_FIELDS = """
    sl.id,
    sl.environment_id,
    sl.user_id,
    sl.action,
    sl.details,
    sl.created_at,

    -- Joined user fields (may be NULL if user_id is NULL or user deleted)
    u.username AS user_username,
    u.first_name AS user_first_name,
    u.last_name AS user_last_name,
    u.email AS user_email
"""


def _try_parse_json(details: Optional[str]) -> Optional[Any]:
    if details is None:
        return None
    s = str(details).strip()
    if not s:
        return None
    try:
        return json.loads(s)
    except Exception:
        # Not JSON — return raw string so frontend can still display it
        return s


def _date_bounds(from_str: Optional[str], to_str: Optional[str]) -> Tuple[Optional[datetime], Optional[datetime]]:
    """
    Frontend sends yyyy-mm-dd.
    Interpret:
      created_at >= from_date 00:00:00
      created_at <  (to_date + 1 day) 00:00:00   (inclusive end-day)
    """
    start_dt = None
    end_dt = None

    if from_str:
        d = date.fromisoformat(from_str)
        start_dt = datetime.combine(d, time.min)

    if to_str:
        d = date.fromisoformat(to_str)
        end_dt = datetime.combine(d + timedelta(days=1), time.min)

    return start_dt, end_dt


# ----------------------------
# Optional write helpers (if you added these earlier, keep them)
# ----------------------------
AuditDetails = Union[Dict[str, Any], List[Any], str, None]


def _json_dumps_safe(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        return str(value)


def insert_audit_log(
    *,
    env_id: int,
    action: str,
    user_id: Optional[int] = None,
    details: AuditDetails = None,
) -> int:
    """
    Insert a single audit log record into system_logs.
    Returns inserted id (or 0).
    """
    if not action or not str(action).strip():
        raise ValueError("insert_audit_log: 'action' must be a non-empty string")

    action = str(action).strip()

    details_text: Optional[str]
    if isinstance(details, (dict, list)):
        details_text = _json_dumps_safe(details)
    elif details is None:
        details_text = None
    else:
        details_text = str(details)

    conn = get_db_connection()
    cur = None
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO system_logs (environment_id, user_id, action, details, created_at)
            VALUES (%s, %s, %s, %s, NOW())
            RETURNING id
            """,
            (env_id, user_id, action, details_text),
        )
        row = cur.fetchone()
        conn.commit()
        return int(row[0]) if row and row[0] is not None else 0
    finally:
        try:
            if cur is not None:
                cur.close()
        except Exception:
            pass
        conn.close()


def insert_audit_log_safe(
    *,
    env_id: int,
    action: str,
    user_id: Optional[int] = None,
    details: AuditDetails = None,
) -> int:
    """
    Safe wrapper: never raises. Returns inserted id or 0.
    """
    try:
        return insert_audit_log(env_id=env_id, action=action, user_id=user_id, details=details)
    except Exception:
        log.exception("Failed to insert audit log: env_id=%s action=%s user_id=%s", env_id, action, user_id)
        return 0


# ----------------------------
# READ: List audit logs (with user join)
# ----------------------------
def list_audit_logs(
    env_id: int,
    *,
    q: Optional[str] = None,
    user: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = 1,
    limit: int = 25,
) -> Dict[str, Any]:
    """
    Returns:
      { items: [...], total: int, page: int, page_size: int }

    Enhancements:
    - LEFT JOIN users to return user_email and user_name for display
    - Keeps your existing details parsing and filter behavior
    """
    page = max(1, int(page or 1))
    limit = min(200, max(1, int(limit or 25)))
    offset = (page - 1) * limit

    start_dt, end_dt = _date_bounds(from_date, to_date)

    where = ["sl.environment_id = %s"]
    params: List[Any] = [env_id]

    if action:
        where.append("UPPER(sl.action) = UPPER(%s)")
        params.append(action.strip())

    if user:
        u = user.strip()
        if u.isdigit():
            where.append("sl.user_id = %s")
            params.append(int(u))
        else:
            # Match against joined user fields OR details text
            where.append(
                "("
                "COALESCE(u.username,'') ILIKE %s OR "
                "COALESCE(u.email,'') ILIKE %s OR "
                "COALESCE(u.first_name,'') ILIKE %s OR "
                "COALESCE(u.last_name,'') ILIKE %s OR "
                "COALESCE(sl.details,'') ILIKE %s"
                ")"
            )
            like = f"%{u}%"
            params.extend([like, like, like, like, like])

    if q:
        s = q.strip()
        where.append(
            "("
            "sl.action ILIKE %s OR "
            "CAST(sl.id AS TEXT) ILIKE %s OR "
            "CAST(sl.user_id AS TEXT) ILIKE %s OR "
            "COALESCE(sl.details,'') ILIKE %s OR "
            "COALESCE(u.username,'') ILIKE %s OR "
            "COALESCE(u.email,'') ILIKE %s"
            ")"
        )
        like = f"%{s}%"
        params.extend([like, like, like, like, like, like])

    if entity_type:
        where.append("COALESCE(sl.details,'') ILIKE %s")
        params.append(f"%\"entity_type\"%{entity_type.strip()}%")

    if entity_id:
        where.append("COALESCE(sl.details,'') ILIKE %s")
        params.append(f"%\"entity_id\"%{str(entity_id).strip()}%")

    if start_dt is not None:
        where.append("sl.created_at >= %s")
        params.append(start_dt)

    if end_dt is not None:
        where.append("sl.created_at < %s")
        params.append(end_dt)

    where_sql = " AND ".join(where)

    # FROM/JOIN clause used for both count and page queries
    from_join_sql = """
        FROM system_logs sl
        LEFT JOIN users u
          ON u.id = sl.user_id
         AND u.environment_id = sl.environment_id
    """

    conn = get_db_connection()
    cur = None
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Total count (needs same FROM/JOIN + WHERE)
        cur.execute(
            f"SELECT COUNT(*) AS total {from_join_sql} WHERE {where_sql}",
            tuple(params),
        )
        total_row = cur.fetchone()
        total = int(total_row["total"]) if total_row else 0

        # Items page
        cur.execute(
            f"""
            SELECT {SYSTEM_LOGS_SELECT_FIELDS}
            {from_join_sql}
            WHERE {where_sql}
            ORDER BY sl.created_at DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params + [limit, offset]),
        )
        rows = cur.fetchall() or []

        items: List[Dict[str, Any]] = []
        for r in rows:
            details_obj = _try_parse_json(r.get("details"))

            # Existing extraction from details (if present)
            entity_type_val = None
            entity_id_val = None
            ip_val = None
            ua_val = None
            details_user_email_val = None
            details_user_name_val = None

            if isinstance(details_obj, dict):
                entity_type_val = details_obj.get("entity_type") or details_obj.get("entityType")
                entity_id_val = details_obj.get("entity_id") or details_obj.get("entityId")
                ip_val = details_obj.get("ip_address") or details_obj.get("ip") or details_obj.get("ipAddress")
                ua_val = details_obj.get("user_agent") or details_obj.get("userAgent") or details_obj.get("ua")
                details_user_email_val = details_obj.get("user_email") or details_obj.get("email")
                details_user_name_val = details_obj.get("user_name") or details_obj.get("name")

            # Joined user values (preferred)
            user_username = r.get("user_username")
            user_first = r.get("user_first_name")
            user_last = r.get("user_last_name")
            user_email_join = r.get("user_email")

            # Build a display name
            user_name_join = None
            name_parts = [p for p in [(user_first or "").strip(), (user_last or "").strip()] if p]
            if name_parts:
                user_name_join = " ".join(name_parts)
            elif user_username:
                user_name_join = str(user_username)

            # Prefer joined fields, fallback to details fields
            user_email_val = user_email_join or details_user_email_val
            user_name_val = user_name_join or details_user_name_val

            created_at = r.get("created_at")
            created_at_iso = created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at)

            items.append(
                {
                    "id": r["id"],
                    "user_id": r.get("user_id"),
                    "user_email": user_email_val,
                    "user_name": user_name_val,
                    "action": r.get("action") or "",
                    "entity_type": entity_type_val,
                    "entity_id": entity_id_val,
                    "ip_address": ip_val,
                    "user_agent": ua_val,
                    "created_at": created_at_iso,
                    "details": details_obj,
                }
            )

        return {"items": items, "total": total, "page": page, "page_size": limit}
    finally:
        try:
            if cur is not None:
                cur.close()
        except Exception:
            pass
        conn.close()
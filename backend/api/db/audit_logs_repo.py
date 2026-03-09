# app/db/audit_logs_repo.py
from __future__ import annotations

from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, date, time, timedelta
import json

import psycopg2.extras

from app.db.connection import get_db_connection


SYSTEM_LOGS_SELECT_FIELDS = """
    id,
    environment_id,
    user_id,
    action,
    details,
    created_at
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
      created_at < (to_date + 1 day) 00:00:00   (inclusive end-day)
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

    Notes:
    - system_logs.details is TEXT in your DB screenshot, so we do not rely on jsonb casts.
    - entity_type/entity_id are filtered by searching inside details text.
      If you always store JSON in details, this still works.
    """
    page = max(1, int(page or 1))
    limit = min(200, max(1, int(limit or 25)))
    offset = (page - 1) * limit

    start_dt, end_dt = _date_bounds(from_date, to_date)

    where = ["environment_id = %s"]
    params: List[Any] = [env_id]

    if action:
        where.append("UPPER(action) = UPPER(%s)")
        params.append(action.strip())

    if user:
        u = user.strip()
        if u.isdigit():
            where.append("user_id = %s")
            params.append(int(u))
        else:
            # If you store email/name in details JSON/text, allow matching it
            where.append("COALESCE(details,'') ILIKE %s")
            params.append(f"%{u}%")

    if q:
        s = q.strip()
        where.append(
            "("
            "action ILIKE %s OR "
            "CAST(id AS TEXT) ILIKE %s OR "
            "CAST(user_id AS TEXT) ILIKE %s OR "
            "COALESCE(details,'') ILIKE %s"
            ")"
        )
        like = f"%{s}%"
        params.extend([like, like, like, like])

    if entity_type:
        # Works for JSON or plain text details
        where.append("COALESCE(details,'') ILIKE %s")
        params.append(f"%\"entity_type\"%{entity_type.strip()}%")

    if entity_id:
        where.append("COALESCE(details,'') ILIKE %s")
        params.append(f"%\"entity_id\"%{str(entity_id).strip()}%")

    if start_dt is not None:
        where.append("created_at >= %s")
        params.append(start_dt)

    if end_dt is not None:
        where.append("created_at < %s")
        params.append(end_dt)

    where_sql = " AND ".join(where)

    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Total count
        cur.execute(
            f"SELECT COUNT(*) AS total FROM system_logs WHERE {where_sql}",
            tuple(params),
        )
        total_row = cur.fetchone()
        total = int(total_row["total"]) if total_row else 0

        # Items page
        cur.execute(
            f"""
            SELECT {SYSTEM_LOGS_SELECT_FIELDS}
            FROM system_logs
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params + [limit, offset]),
        )
        rows = cur.fetchall() or []

        items: List[Dict[str, Any]] = []
        for r in rows:
            details_obj = _try_parse_json(r.get("details"))

            # Extract nice-to-have fields from details JSON (if present)
            entity_type_val = None
            entity_id_val = None
            ip_val = None
            ua_val = None
            user_email_val = None
            user_name_val = None

            if isinstance(details_obj, dict):
                entity_type_val = details_obj.get("entity_type") or details_obj.get("entityType")
                entity_id_val = details_obj.get("entity_id") or details_obj.get("entityId")
                ip_val = details_obj.get("ip_address") or details_obj.get("ip") or details_obj.get("ipAddress")
                ua_val = details_obj.get("user_agent") or details_obj.get("userAgent") or details_obj.get("ua")
                user_email_val = details_obj.get("user_email") or details_obj.get("email")
                user_name_val = details_obj.get("user_name") or details_obj.get("name")

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
            cur.close()
        except Exception:
            pass
        conn.close()
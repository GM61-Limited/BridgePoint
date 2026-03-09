# app/api/api/v1/audit_logs_routes.py
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, Query

from app.db.audit_logs_repo import list_audit_logs

# Adjust these imports to match how your other routes do auth/env
from app.core.auth import get_current_user  # <- if different, change it


router = APIRouter(prefix="/api/v1/audit-logs", tags=["Audit Logs"])


def _get_env_id_from_user(user) -> int:
    """
    Bridgepoint has environment scoping.
    Adjust this to match your actual user object shape.
    Common patterns:
      - user["environment_id"]
      - user.environment_id
      - user["env_id"]
    """
    if user is None:
        return 1
    if isinstance(user, dict):
        return int(user.get("environment_id") or user.get("env_id") or 1)
    return int(getattr(user, "environment_id", getattr(user, "env_id", 1)))


@router.get("")
def get_audit_logs(
    q: Optional[str] = Query(None),
    user: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),

    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),

    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=200),

    current_user=Depends(get_current_user),
):
    env_id = _get_env_id_from_user(current_user)

    return list_audit_logs(
        env_id,
        q=q,
        user=user,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        from_date=from_,
        to_date=to,
        page=page,
        limit=limit,
    )
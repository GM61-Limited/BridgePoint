# app/api/v1/audit_logs_routes.py
from __future__ import annotations

from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, Query

from app.core.auth import get_principal, get_env_id
from app.db.audit_logs_repo import list_audit_logs

router = APIRouter(prefix="/v1/audit-logs", tags=["Audit Logs"])


@router.get("/_ping", summary="Audit logs ping (diagnostic)")
def ping_audit_logs():
    return {"ok": True, "route": "/v1/audit-logs"}


@router.get("", summary="List audit logs (paged)")
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
    # ✅ Ensure request is authenticated and tenant-scoped the same way as the rest of the API
    principal: Dict[str, Any] = Depends(get_principal),
    env_id: int = Depends(get_env_id),
):
    # env_id is authoritative for tenant filtering
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
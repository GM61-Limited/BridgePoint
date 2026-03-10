from fastapi import APIRouter, Depends, Query
from typing import Optional

from app.db.audit_logs_repo import list_audit_logs
from app.core.auth import get_current_user  # or whatever your project uses

router = APIRouter(prefix="/v1/audit-logs", tags=["Audit Logs"])  # ✅ IMPORTANT

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
    # env_id resolution here...
    env_id = getattr(current_user, "environment_id", 1)
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

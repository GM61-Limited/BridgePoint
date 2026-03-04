# app/api/v1/modules_routes.py

from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.db.connection import get_db_connection
from app.db.environment_modules_repo import (
    ALLOWED_MODULE_KEYS,
    ensure_defaults_exist,
    get_environment_modules,
    upsert_environment_modules,
)

# NOTE:
# Adjust this import if your auth dependency has a different name.
# Common patterns:
#   - from app.core.auth import get_current_user
#   - from app.core.security import get_current_user
try:
    from app.core.auth import get_current_user
except Exception:  # pragma: no cover
    get_current_user = None


router = APIRouter(tags=["Environment"])


# ---------------------------
# DB dependency (opens/closes a psycopg2 connection per request)
# ---------------------------
def get_db():
    conn = get_db_connection()
    try:
        yield conn
    finally:
        try:
            conn.close()
        except Exception:
            pass


# ---------------------------
# Pydantic models
# ---------------------------
class ModuleToggle(BaseModel):
    key: str = Field(..., description="Module key e.g. machine-monitoring")
    enabled: bool = Field(..., description="Whether the module is enabled")


class ModulesResponse(BaseModel):
    environmentId: int
    modules: List[ModuleToggle]


class ModulesUpdateRequest(BaseModel):
    modules: List[ModuleToggle]


# ---------------------------
# Helpers
# ---------------------------
def _user_role(user: Any) -> str:
    if user is None:
        return ""
    if isinstance(user, dict):
        return str(user.get("role") or "")
    return str(getattr(user, "role", "") or "")


def _user_environment_id(user: Any) -> Optional[int]:
    if user is None:
        return None
    v = user.get("environment_id") if isinstance(user, dict) else getattr(user, "environment_id", None)
    try:
        return int(v) if v is not None else None
    except Exception:
        return None


def _is_admin(user: Any) -> bool:
    # accept "Admin" or "admin"
    return _user_role(user).strip().lower() == "admin"


def _resolve_env_id(x_environment_id: Optional[int], user: Any) -> Optional[int]:
    # Prefer X-Environment-Id header, fallback to user's environment_id
    if x_environment_id is not None:
        return x_environment_id
    return _user_environment_id(user)


def _stable_full_list(rows: List[dict]) -> List[dict]:
    enabled_map = {r["key"]: bool(r["enabled"]) for r in rows}
    return [{"key": k, "enabled": enabled_map.get(k, False)} for k in sorted(ALLOWED_MODULE_KEYS)]


# ---------------------------
# Routes
# ---------------------------
@router.get("/environment/modules", response_model=ModulesResponse)
def api_get_environment_modules(
    conn=Depends(get_db),
    x_environment_id: Optional[int] = Header(default=None, alias="X-Environment-Id"),
    user: Any = Depends(get_current_user) if get_current_user else None,
):
    env_id = _resolve_env_id(x_environment_id, user)
    if env_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Environment id not provided")

    # Ensure defaults exist so UI always sees all keys
    try:
        ensure_defaults_exist(conn, env_id)
    except Exception:
        # Don’t hard-fail reads if default insert fails
        pass

    try:
        rows = get_environment_modules(conn, env_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load modules: {e}")

    return {"environmentId": env_id, "modules": _stable_full_list(rows)}


@router.put("/environment/modules", response_model=ModulesResponse)
def api_put_environment_modules(
    body: ModulesUpdateRequest,
    conn=Depends(get_db),
    x_environment_id: Optional[int] = Header(default=None, alias="X-Environment-Id"),
    user: Any = Depends(get_current_user) if get_current_user else None,
):
    env_id = _resolve_env_id(x_environment_id, user)
    if env_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Environment id not provided")

    # Only admins can change environment-wide feature flags
    if user is not None and not _is_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")

    # Validate keys early for clean frontend errors
    for m in body.modules:
        if m.key not in ALLOWED_MODULE_KEYS:
            raise HTTPException(status_code=400, detail=f"Unknown module key: {m.key}")

    try:
        updated_rows = upsert_environment_modules(
            conn,
            env_id,
            [{"key": m.key, "enabled": m.enabled} for m in body.modules],
            validate_keys=True,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save modules: {e}")

    return {"environmentId": env_id, "modules": _stable_full_list(updated_rows)}

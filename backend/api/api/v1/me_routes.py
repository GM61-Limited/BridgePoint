# app/api/v1/me_routes.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Any, Dict

from app.core.auth import get_current_username, get_env_id
from app.db.users_repo import fetch_user_profile

router = APIRouter(tags=["me"])

Role = Literal["Admin", "Editor", "Viewer"]


class MeResponse(BaseModel):
    # Core identifiers for the UI
    id: int
    username: str
    email: Optional[str] = None

    # Back-compat: friendly display name
    name: str

    # Explicit fields
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    # Role (both single + list for flexibility)
    role: Optional[Role] = None
    roles: List[Role] = Field(default_factory=list)

    environment_id: int


def _safe_strip(v: Optional[str]) -> str:
    return str(v).strip() if v is not None else ""


@router.get("/me", response_model=MeResponse)
def me(
    username: str = Depends(get_current_username),
    env_id: int = Depends(get_env_id),
):
    row = fetch_user_profile(username=username, environment_id=env_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    # Ensure dict-like access
    try:
        get = row.get if hasattr(row, "get") else None
        role_raw = get("role") if get else getattr(row, "role", None)

        user_id = get("id") if get else getattr(row, "id", None)
        uname = get("username") if get else getattr(row, "username", username)
        email = get("email") if get else getattr(row, "email", None)

        fname = get("first_name") if get else getattr(row, "first_name", None)
        lname = get("last_name") if get else getattr(row, "last_name", None)

        env_value = get("environment_id") if get else getattr(row, "environment_id", env_id)
    except Exception:
        raise HTTPException(status_code=500, detail="Unexpected user record shape")

    if user_id is None:
        raise HTTPException(status_code=500, detail="User record missing id")

    # Normalize role
    normalized_role = (str(role_raw).capitalize() if role_raw else None)
    if normalized_role not in {"Admin", "Editor", "Viewer"}:
        normalized_role = None

    f = _safe_strip(fname)
    l = _safe_strip(lname)
    display_name = (f + (" " + l if l else "")).strip() or str(uname)

    return MeResponse(
        id=int(user_id),
        username=str(uname),
        email=str(email) if email else None,
        name=display_name,
        first_name=f if f else None,
        last_name=l if l else None,
        role=normalized_role,  # convenience
        roles=[normalized_role] if normalized_role else [],
        environment_id=int(env_value) if env_value is not None else int(env_id),
    )
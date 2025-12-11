
# app/api/v1/me_routes.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Literal, Optional

from app.core.auth import get_current_username, get_env_id
from app.db.users_repo import fetch_user_profile

router = APIRouter(tags=["me"])

# Keep roles consistent with admin endpoints
Role = Literal["Admin", "Editor", "Viewer"]

class MeResponse(BaseModel):
    name: str
    roles: List[Role] = Field(default_factory=list)
    environment_id: int

@router.get("/me", response_model=MeResponse)
def me(
    username: str = Depends(get_current_username),
    env_id: int = Depends(get_env_id),
):
    row = fetch_user_profile(username=username, environment_id=env_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    # Ensure dict-like access (adapt if your repo returns a model)
    try:
        role = row.get("role") if hasattr(row, "get") else getattr(row, "role", None)
        env_value = row["environment_id"] if isinstance(row, dict) else getattr(row, "environment_id", None)
        uname = row["username"] if isinstance(row, dict) else getattr(row, "username", username)
    except Exception:
        raise HTTPException(status_code=500, detail="Unexpected user record shape")

    if env_value is None:
        # Prefer the dependency value to avoid None/TypeError
        env_value = env_id

    # Normalize role to the Literal values if DB stores lowercase, etc.
    normalized_role = (str(role).capitalize() if role else None)
    if normalized_role not in {"Admin", "Editor", "Viewer"}:
        normalized_role = None

    return MeResponse(
        name=str(uname),
        roles=[normalized_role] if normalized_role else [],
        environment_id=int(env_value),
    )

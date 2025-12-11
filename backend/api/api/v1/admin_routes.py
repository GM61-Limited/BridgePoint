
# app/api/v1/admin_routes.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional, Literal
from psycopg2 import errors

from app.core.auth import get_current_username, get_env_id
from app.db.env_repo import fetch_environment, update_environment
from app.db.users_repo import (
    list_users_for_environment,
    create_user,
    update_user,
    set_user_password,
)

router = APIRouter(tags=["admin"])

# ---------- Environment ----------

class EnvironmentResponse(BaseModel):
    id: int
    name: str
    domain: str

class EnvironmentUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    # NOTE: Your DB doesn't store address/timezone.
    # If the frontend sends them, ignore safely at the API boundary.

@router.get("/environment", response_model=EnvironmentResponse)
def get_environment(env_id: int = Depends(get_env_id)):
    env = fetch_environment(env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    return EnvironmentResponse(
        id=int(env["id"]),
        name=str(env["name"]),
        domain=str(env["domain"]),
    )

@router.patch("/environment", response_model=EnvironmentResponse)
def patch_environment(
    payload: EnvironmentUpdate,
    _: str = Depends(get_current_username),
    env_id: int = Depends(get_env_id),
):
    updated = update_environment(env_id, payload.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Environment not found")
    return EnvironmentResponse(
        id=int(updated["id"]),
        name=str(updated["name"]),
        domain=str(updated["domain"]),
    )

# ---------- Users (tenant-scoped) ----------

Role = Literal["Admin", "Editor", "Viewer"]

class UserCreate(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    role: Role = "Viewer"
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = True

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[Role] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_active: Optional[bool] = None

class PasswordReset(BaseModel):
    password: str

@router.get("/users")
def get_users(
    _: str = Depends(get_current_username),
    env_id: int = Depends(get_env_id),
):
    """List users scoped to the caller's environment."""
    return {"users": list_users_for_environment(env_id)}

@router.post("/users", status_code=201)
def create_user_api(
    payload: UserCreate,
    _: str = Depends(get_current_username),
    env_id: int = Depends(get_env_id),
):
    """Create a user in the caller's environment."""
    try:
        created = create_user(
            environment_id=env_id,
            username=payload.username,
            email=payload.email,
            role=payload.role,
            first_name=payload.first_name,
            last_name=payload.last_name,
            password=payload.password,
            is_active=payload.is_active if payload.is_active is not None else True,
        )
        return created
    except errors.UniqueViolation:
        # Per-tenant uniqueness violation (username/email)
        raise HTTPException(status_code=409, detail="Username or email already exists")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/users/{user_id}")
def update_user_api(
    user_id: int,
    payload: UserUpdate,
    _: str = Depends(get_current_username),
    env_id: int = Depends(get_env_id),
):
    """Patch a user's fields within the caller's environment."""
    try:
        updated = update_user(
            user_id=user_id,
            environment_id=env_id,
            updates=payload.model_dump(exclude_unset=True),
        )
    except errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Username or email already exists")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return updated

@router.post("/users/{user_id}/reset-password")
def reset_password_api(
    user_id: int,
    payload: PasswordReset,
    _: str = Depends(get_current_username),
    env_id: int = Depends(get_env_id),
):
    """Reset a user's password within the caller's environment."""
    ok = set_user_password(user_id=user_id, environment_id=env_id, new_password=payload.password)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}

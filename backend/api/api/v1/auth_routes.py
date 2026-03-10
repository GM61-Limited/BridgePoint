from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from datetime import timedelta

from app.core.security import create_access_token, verify_password
from app.core.config import settings
from app.db.users_repo import fetch_login_user

# ✅ Audit helper
from app.core.audit import audit_success, audit_fail

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    environment_id: int | None = None


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request):
    """
    Login endpoint.
    Writes server-side audit logs for both success and failure.
    """
    username = (data.username or "").strip()

    # Attempt lookup
    user = fetch_login_user(username)

    # Failed login (unknown user or bad password)
    if not user or not verify_password(data.password, user["password_hash"]):
        # Best-effort env_id for audit:
        # - if user exists, log their environment_id
        # - else default to 1 (or change to None if you prefer)
        env_id = int(user["environment_id"]) if user and user.get("environment_id") is not None else 1

        audit_fail(
            action="LOGIN_FAILED",
            request=request,
            env_id=env_id,
            user_id=int(user["id"]) if user and user.get("id") is not None else None,
            message="Invalid credentials",
            extra={
                "username": username,
                # DO NOT include password
                "reason": "bad_username_or_password",
            },
        )

        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Successful login
    token = create_access_token(
        data={"sub": user["username"], "env_id": user["environment_id"]},
        expires=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    audit_success(
        action="LOGIN_SUCCESS",
        request=request,
        env_id=int(user["environment_id"]) if user.get("environment_id") is not None else 1,
        user_id=int(user["id"]) if user.get("id") is not None else None,
        message="User logged in",
        extra={
            "username": user.get("username"),
            # If you have email/name in your user record, include them
            "user_email": user.get("email") or user.get("user_email"),
            "user_name": user.get("name") or user.get("user_name"),
        },
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "environment_id": int(user["environment_id"]) if user.get("environment_id") is not None else None,
    }
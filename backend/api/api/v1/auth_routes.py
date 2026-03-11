# app/api/v1/auth_routes.py
from datetime import timedelta
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
import jwt

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    verify_password,
)
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


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """
    Set refresh token in an HttpOnly cookie.
    """
    # ✅ Option A: refresh expiry is configured in minutes (e.g. 60)
    max_age = int(settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60)

    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=settings.COOKIE_HTTPONLY,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,  # "lax" | "strict" | "none"
        domain=settings.COOKIE_DOMAIN,
        path=settings.COOKIE_PATH,
        max_age=max_age,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        domain=settings.COOKIE_DOMAIN,
        path=settings.COOKIE_PATH,
    )


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, response: Response):
    """
    Login endpoint.
    Writes server-side audit logs for both success and failure.
    Also sets a refresh token cookie (HttpOnly) for silent token renewal later.
    """
    username = (data.username or "").strip()

    # Attempt lookup
    user = fetch_login_user(username)

    # Failed login (unknown user or bad password)
    if not user or not verify_password(data.password, user["password_hash"]):
        env_id = int(user["environment_id"]) if user and user.get("environment_id") is not None else 1

        audit_fail(
            action="LOGIN_FAILED",
            request=request,
            env_id=env_id,
            user_id=int(user["id"]) if user and user.get("id") is not None else None,
            message="Invalid credentials",
            extra={
                "username": username,
                "reason": "bad_username_or_password",
            },
        )

        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Successful login -> access token
    access_token = create_access_token(
        data={"sub": user["username"], "env_id": user["environment_id"]},
        expires=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    # ✅ Also create refresh token -> stored in cookie
    refresh_token = create_refresh_token(
        data={
            "sub": user["username"],
            "env_id": user["environment_id"],
            "uid": int(user["id"]) if user.get("id") is not None else None,
        }
    )
    _set_refresh_cookie(response, refresh_token)

    audit_success(
        action="LOGIN_SUCCESS",
        request=request,
        env_id=int(user["environment_id"]) if user.get("environment_id") is not None else 1,
        user_id=int(user["id"]) if user.get("id") is not None else None,
        message="User logged in",
        extra={
            "username": user.get("username"),
            "user_email": user.get("email") or user.get("user_email"),
            "user_name": user.get("name") or user.get("user_name"),
        },
    )

    # ✅ Response remains compatible with existing frontend
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "environment_id": int(user["environment_id"]) if user.get("environment_id") is not None else None,
    }


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response):
    """
    Mint a new access token using the refresh token cookie.
    Stateless refresh: no DB token table required.
    """
    raw = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not raw:
        audit_fail(
            action="REFRESH_FAILED",
            request=request,
            env_id=1,
            user_id=None,
            message="Missing refresh cookie",
            extra={"reason": "missing_cookie"},
        )
        raise HTTPException(status_code=401, detail="Missing refresh token")

    try:
        payload = decode_refresh_token(raw)
        username = (payload.get("sub") or "").strip()
        env_id = payload.get("env_id")
        uid = payload.get("uid")

        if not username:
            raise jwt.InvalidTokenError("Missing subject")

        # Optional sanity check: user still exists
        user = fetch_login_user(username)
        if not user:
            audit_fail(
                action="REFRESH_FAILED",
                request=request,
                env_id=int(env_id) if env_id is not None else 1,
                user_id=int(uid) if uid is not None else None,
                message="User not found for refresh",
                extra={"username": username, "reason": "user_not_found"},
            )
            _clear_refresh_cookie(response)
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        # New access token
        access_token = create_access_token(
            data={"sub": username, "env_id": user.get("environment_id")},
            expires=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        )

        # Optional: rotate refresh token (stateless rotation; still no DB)
        new_refresh = create_refresh_token(
            data={
                "sub": username,
                "env_id": user.get("environment_id"),
                "uid": int(user["id"]) if user.get("id") is not None else None,
            }
        )
        _set_refresh_cookie(response, new_refresh)

        audit_success(
            action="REFRESH_SUCCESS",
            request=request,
            env_id=int(user["environment_id"]) if user.get("environment_id") is not None else 1,
            user_id=int(user["id"]) if user.get("id") is not None else None,
            message="Access token refreshed",
            extra={"username": username},
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "environment_id": int(user["environment_id"]) if user.get("environment_id") is not None else None,
        }

    except jwt.ExpiredSignatureError:
        audit_fail(
            action="REFRESH_FAILED",
            request=request,
            env_id=1,
            user_id=None,
            message="Refresh token expired",
            extra={"reason": "refresh_expired"},
        )
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Refresh token expired")

    except jwt.InvalidTokenError as e:
        audit_fail(
            action="REFRESH_FAILED",
            request=request,
            env_id=1,
            user_id=None,
            message="Invalid refresh token",
            extra={"reason": "invalid_refresh", "error": str(e)},
        )
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@router.post("/logout")
def logout(request: Request, response: Response):
    """
    Clears refresh cookie so the browser can no longer refresh silently.
    (Stateless design means server cannot revoke already-issued refresh tokens elsewhere without state.)
    """
    _clear_refresh_cookie(response)

    audit_success(
        action="LOGOUT",
        request=request,
        env_id=1,
        user_id=None,
        message="User logged out (refresh cookie cleared)",
        extra={},
    )

    return {"ok": True}
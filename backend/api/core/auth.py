
from __future__ import annotations

import os
from typing import Optional, Dict, Any

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
import psycopg2.extras

from app.core.security import decode_token
from app.db.connection import get_db_connection

# Allow dev fallback to headers when no token is provided
_ALLOW_DEV_FALLBACK = os.getenv("ALLOW_DEV_HEADER_FALLBACK", "1") not in {"0", "false", "False"}

# IMPORTANT: auto_error=False lets us handle "no token" case gracefully for dev/local Postman tests
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)  # matches /login


def _fetch_user_row(username: str) -> Optional[Dict[str, Any]]:
    """
    Return a user record with the fields we need for auth and tenancy.
    """
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(
            """
            SELECT id, username, environment_id, role,
                   COALESCE(is_active, TRUE) AS is_active
            FROM users
            WHERE username = %s
            """,
            (username,),
        )
        row = cur.fetchone()
        return dict(row) if row else None
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def get_principal(request: Request, token: Optional[str] = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """
    Resolve the authenticated principal (username, environment/tenant, role).
    Order of precedence:
      1) JWT (Bearer access token): sub=username, env_id=tenant (authoritative)
      2) Dev fallback via headers (if ALLOW_DEV_HEADER_FALLBACK=1):
         - X-Username
         - X-Environment-Id
    Returns: { "user_id", "username", "env_id", "role" }
    Raises: 401/403 with clear messages when validation fails.
    """
    username: Optional[str] = None
    env_id_claim: Optional[int] = None

    # ---- Case A: token provided ----
    if token:
        try:
            payload = decode_token(token)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

        username = payload.get("sub")
        if not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token (missing sub)"
            )

        # env_id can be named env_id or environment_id depending on issuer
        raw_env = payload.get("env_id", payload.get("environment_id"))
        if raw_env is not None:
            try:
                env_id_claim = int(raw_env)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token (env_id is not an integer)"
                )

    # ---- Case B: no token; dev-only header fallback ----
    if not token and _ALLOW_DEV_FALLBACK:
        hdr_user = request.headers.get("X-Username")
        hdr_env = request.headers.get("X-Environment-Id")
        if hdr_user:
            username = hdr_user
        if hdr_env:
            try:
                env_id_claim = int(hdr_env)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid X-Environment-Id header (must be integer)"
                )

    # We require at least a username from some source
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized (missing token or dev headers)"
        )

    # ---- Validate user exists & is active; derive definitive env_id ----
    row = _fetch_user_row(username)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid principal (user not found)"
        )

    if not bool(row.get("is_active", True)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is disabled"
        )

    # Authoritative environment resolution:
    #  - Prefer env_id from token if present
    #  - Otherwise use the user row's environment_id
    row_env = row.get("environment_id")
    try:
        row_env_int = int(row_env) if row_env is not None else None
    except Exception:
        row_env_int = None

    env_id_final: Optional[int] = env_id_claim if env_id_claim is not None else row_env_int

    if env_id_final is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Environment not set for principal"
        )

    # If both token/env claim and DB disagree, block to prevent cross-tenant tampering
    if env_id_claim is not None and row_env_int is not None and env_id_claim != row_env_int:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tenant mismatch between token and user record"
        )

    principal = {
        "user_id": int(row["id"]),
        "username": str(row["username"]),
        "env_id": int(env_id_final),
        "role": str(row.get("role") or "Viewer"),
    }
    return principal


def get_current_username(principal: Dict[str, Any] = Depends(get_principal)) -> str:
    return principal["username"]


def get_env_id(principal: Dict[str, Any] = Depends(get_principal)) -> int:
    return principal["env_id"]

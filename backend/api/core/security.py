# app/core/security.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import uuid

import bcrypt
import jwt

from app.core.config import settings


def _utcnow() -> datetime:
    # Use timezone-aware UTC timestamps (cleaner + avoids subtle issues)
    return datetime.now(timezone.utc)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: Dict[str, Any], expires: Optional[timedelta] = None) -> str:
    """
    Creates a short-lived JWT access token.
    """
    to_encode = data.copy()
    expire = _utcnow() + (expires or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": _utcnow(), "typ": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: Dict[str, Any], expires: Optional[timedelta] = None) -> str:
    """
    Creates a longer-lived JWT refresh token.

    Stateless refresh means the token remains valid until exp.
    We include `typ=refresh` to prevent misuse as an access token.
    """
    to_encode = data.copy()

    # ✅ Option A: refresh token expiry is configured in minutes (e.g. 60)
    expire = _utcnow() + (expires or timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES))

    to_encode.update(
        {
            "exp": expire,
            "iat": _utcnow(),
            "typ": "refresh",
            "jti": str(uuid.uuid4()),
        }
    )
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    """
    Decodes a JWT using the shared SECRET_KEY and ALGORITHM.
    Intended for access tokens.
    """
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


def decode_refresh_token(token: str) -> Dict[str, Any]:
    """
    Decodes and validates a refresh token.
    Ensures typ=refresh.
    """
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    if payload.get("typ") != "refresh":
        raise jwt.InvalidTokenError("Invalid token type")
    return payload
# app/core/audit.py
from __future__ import annotations

from typing import Any, Dict, Optional, Union, Iterable
import logging

from fastapi import Request

from app.db.audit_logs_repo import insert_audit_log_safe

log = logging.getLogger("bridgepoint")

JsonLike = Union[Dict[str, Any], list, str, None]


# ----------------------------
# Redaction helpers
# ----------------------------
_DEFAULT_REDACT_KEYS = {
    "password",
    "pass",
    "pwd",
    "secret",
    "token",
    "access_token",
    "refresh_token",
    "authorization",
    "bearer",
    "api_key",
    "apikey",
    "client_secret",
}


def _redact_value(v: Any) -> Any:
    # Keep structure but hide sensitive values
    if isinstance(v, str):
        return "***"
    return "***"


def _redact(obj: Any, *, redact_keys: Iterable[str] = _DEFAULT_REDACT_KEYS) -> Any:
    """
    Recursively redact sensitive keys in dict/list payloads.
    - Only redacts when obj is dict-like and key matches a redact key (case-insensitive).
    - Leaves other values intact.
    """
    try:
        redact_set = {k.lower() for k in redact_keys}
    except Exception:
        redact_set = {k.lower() for k in _DEFAULT_REDACT_KEYS}

    if isinstance(obj, dict):
        out: Dict[str, Any] = {}
        for k, v in obj.items():
            key_l = str(k).lower()
            if key_l in redact_set:
                out[k] = _redact_value(v)
            else:
                out[k] = _redact(v, redact_keys=redact_set) if isinstance(v, (dict, list)) else v
        return out

    if isinstance(obj, list):
        return [_redact(v, redact_keys=redact_set) if isinstance(v, (dict, list)) else v for v in obj]

    return obj


# ----------------------------
# Request context extraction
# ----------------------------
def _get_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None

    # Prefer X-Forwarded-For if present (Nginx/proxies)
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # Could be "client, proxy1, proxy2"
        return xff.split(",")[0].strip() or None

    # Fall back to Starlette client
    if request.client:
        return request.client.host
    return None


def _get_user_agent(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    return request.headers.get("user-agent")


def _get_request_id(request: Optional[Request]) -> Optional[str]:
    """
    If you add middleware that sets request.state.request_id, we will automatically capture it.
    """
    if request is None:
        return None
    rid = getattr(getattr(request, "state", None), "request_id", None)
    if rid:
        return str(rid)
    # Also allow inbound request-id headers if you use them
    hdr = request.headers.get("x-request-id") or request.headers.get("x-correlation-id")
    return hdr or None


def _env_id_from_user(current_user: Any, default: int = 1) -> int:
    """
    Best-effort environment resolution.
    Adjust if your user model differs.
    """
    if current_user is None:
        return default

    if isinstance(current_user, dict):
        try:
            return int(current_user.get("environment_id") or default)
        except Exception:
            return default

    try:
        return int(getattr(current_user, "environment_id", default) or default)
    except Exception:
        return default


def _user_id_from_user(current_user: Any) -> Optional[int]:
    if current_user is None:
        return None

    if isinstance(current_user, dict):
        v = current_user.get("id") or current_user.get("user_id")
        try:
            return int(v) if v is not None else None
        except Exception:
            return None

    v = getattr(current_user, "id", None) or getattr(current_user, "user_id", None)
    try:
        return int(v) if v is not None else None
    except Exception:
        return None


def _email_from_user(current_user: Any) -> Optional[str]:
    if current_user is None:
        return None
    if isinstance(current_user, dict):
        v = current_user.get("email") or current_user.get("user_email")
        return str(v) if v else None
    v = getattr(current_user, "email", None) or getattr(current_user, "user_email", None)
    return str(v) if v else None


def _name_from_user(current_user: Any) -> Optional[str]:
    if current_user is None:
        return None
    if isinstance(current_user, dict):
        v = current_user.get("name") or current_user.get("user_name")
        return str(v) if v else None
    v = getattr(current_user, "name", None) or getattr(current_user, "user_name", None)
    return str(v) if v else None


# ----------------------------
# Public audit API
# ----------------------------
def audit_event(
    *,
    action: str,
    request: Optional[Request] = None,
    current_user: Any = None,
    env_id: Optional[int] = None,
    user_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[Union[str, int]] = None,
    outcome: Optional[str] = None,  # e.g. "SUCCESS" / "FAIL"
    message: Optional[str] = None,  # short human hint (avoid secrets)
    extra: Optional[Dict[str, Any]] = None,
    redact_keys: Iterable[str] = _DEFAULT_REDACT_KEYS,
) -> int:
    """
    Write an audit log entry (server-side).

    - Never raises (uses insert_audit_log_safe)
    - Captures request context (ip, user_agent, request_id) when provided
    - Stores entity_type/entity_id in details (so your filters work)
    - Redacts sensitive keys from `extra`

    Returns:
      inserted id (int), or 0 if not inserted.
    """
    if not action or not str(action).strip():
        # Don't raise — auditing should never break flows
        log.warning("audit_event called with empty action")
        return 0

    env_id_final = int(env_id) if env_id is not None else _env_id_from_user(current_user, default=1)
    user_id_final = user_id if user_id is not None else _user_id_from_user(current_user)

    details: Dict[str, Any] = {}

    # Core context
    rid = _get_request_id(request)
    ip = _get_ip(request)
    ua = _get_user_agent(request)

    if rid:
        details["request_id"] = rid
    if ip:
        details["ip_address"] = ip
    if ua:
        details["user_agent"] = ua

    # Optional user fields (nice-to-have for display)
    user_email = _email_from_user(current_user)
    user_name = _name_from_user(current_user)
    if user_email:
        details["user_email"] = user_email
    if user_name:
        details["user_name"] = user_name

    # Entity context for filtering
    if entity_type:
        details["entity_type"] = str(entity_type)
    if entity_id is not None:
        details["entity_id"] = str(entity_id)

    # Outcome + message
    if outcome:
        details["outcome"] = str(outcome)
    if message:
        details["message"] = str(message)

    # Extra payload (redacted)
    if extra:
        details["extra"] = _redact(extra, redact_keys=redact_keys)

    return insert_audit_log_safe(
        env_id=env_id_final,
        user_id=user_id_final,
        action=str(action).strip(),
        details=details,
    )


def audit_success(
    *,
    action: str,
    request: Optional[Request] = None,
    current_user: Any = None,
    env_id: Optional[int] = None,
    user_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[Union[str, int]] = None,
    message: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> int:
    return audit_event(
        action=action,
        request=request,
        current_user=current_user,
        env_id=env_id,
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        outcome="SUCCESS",
        message=message,
        extra=extra,
    )


def audit_fail(
    *,
    action: str,
    request: Optional[Request] = None,
    current_user: Any = None,
    env_id: Optional[int] = None,
    user_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[Union[str, int]] = None,
    message: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> int:
    return audit_event(
        action=action,
        request=request,
        current_user=current_user,
        env_id=env_id,
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        outcome="FAIL",
        message=message,
        extra=extra,
    )
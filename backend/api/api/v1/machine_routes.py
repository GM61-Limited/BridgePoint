# app/api/v1/machines_routes.py
from __future__ import annotations

from typing import Optional, Dict, Any, Tuple

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request

from app.core.auth import get_principal, get_env_id
from app.core.audit import audit_success, audit_fail

from app.db.machines_repo import (
    list_machines,
    get_machine,
    create_machine,
    update_machine,
    soft_delete_machine,
)

router = APIRouter(prefix="/v1/machines", tags=["Machines"])


# ----------------------------
# Helpers
# ----------------------------
def _principal_user_id(principal: Dict[str, Any]) -> Optional[int]:
    """
    Best-effort user id extraction from principal dict.
    Adjust if your principal uses a different key.
    """
    v = principal.get("id") or principal.get("user_id")
    try:
        return int(v) if v is not None else None
    except Exception:
        return None


def _diff(before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compute a small diff object for audit logs.
    Only includes keys that changed.
    """
    ignore = {"created_at", "updated_at"}
    out: Dict[str, Any] = {}

    before = before or {}
    after = after or {}

    keys = set(before.keys()) | set(after.keys())
    for k in keys:
        if k in ignore:
            continue
        bv = before.get(k)
        av = after.get(k)
        if bv != av:
            out[k] = {"from": bv, "to": av}
    return out


def _require_editor_or_admin(
    *,
    action_denied: str,
    request: Request,
    principal: Dict[str, Any],
    env_id: int,
    entity_id: Optional[int] = None,
) -> None:
    """
    Enforce role and audit the denied attempt.
    """
    role = (principal.get("role") or "Viewer").lower()
    if role not in {"admin", "editor"}:
        audit_fail(
            action=action_denied,
            request=request,
            env_id=env_id,
            user_id=_principal_user_id(principal),
            entity_type="machine",
            entity_id=entity_id,
            message="Insufficient permissions (requires Admin or Editor)",
            extra={"role": principal.get("role")},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions (requires Admin or Editor)",
        )


# ----------------------------
# Read endpoints (typically not audited)
# ----------------------------
@router.get("")
def machines_list(
    env_id: int = Depends(get_env_id),
    machine_type: Optional[str] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
    integration_key: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
):
    items = list_machines(
        env_id=env_id,
        machine_type=machine_type,
        is_active=is_active,
        integration_key=integration_key,
        search=search,
    )
    return {"items": items}


@router.get("/{machine_id}")
def machines_get(
    machine_id: int,
    env_id: int = Depends(get_env_id),
):
    row = get_machine(env_id=env_id, machine_id=machine_id)
    if not row:
        raise HTTPException(status_code=404, detail="Machine not found")
    return row


# ----------------------------
# Create machine (AUDITED)
# ----------------------------
@router.post("", status_code=201)
def machines_create(
    payload: Dict[str, Any],
    request: Request,
    principal: Dict[str, Any] = Depends(get_principal),
    env_id: int = Depends(get_env_id),
):
    _require_editor_or_admin(
        action_denied="MACHINE_CREATE_DENIED",
        request=request,
        principal=principal,
        env_id=env_id,
    )

    # Minimal required fields validation (DB will also enforce some)
    for f in ("machine_name", "machine_code", "machine_type"):
        if not payload.get(f):
            audit_fail(
                action="MACHINE_CREATE_FAILED",
                request=request,
                env_id=env_id,
                user_id=_principal_user_id(principal),
                entity_type="machine",
                message=f"Missing required field: {f}",
                extra={"payload": payload},
            )
            raise HTTPException(status_code=400, detail=f"Missing required field: {f}")

    try:
        created = create_machine(env_id=env_id, payload=payload)

        audit_success(
            action="MACHINE_CREATED",
            request=request,
            env_id=env_id,
            user_id=_principal_user_id(principal),
            entity_type="machine",
            entity_id=created.get("id") if isinstance(created, dict) else None,
            message="Machine created",
            extra={
                "payload": payload,
                "machine_name": (created.get("machine_name") if isinstance(created, dict) else None),
                "machine_code": (created.get("machine_code") if isinstance(created, dict) else None),
            },
        )

        return created

    except psycopg2.IntegrityError as e:
        # Handle unique constraint & FK errors in a user-friendly way
        msg = str(e).lower()
        if "machines_env_code_uniq" in msg or "duplicate key" in msg:
            audit_fail(
                action="MACHINE_CREATE_FAILED",
                request=request,
                env_id=env_id,
                user_id=_principal_user_id(principal),
                entity_type="machine",
                message="Machine code already exists",
                extra={"payload": payload, "reason": "duplicate_machine_code"},
            )
            raise HTTPException(status_code=409, detail="Machine code already exists in this environment")

        if "machines_machine_type_fk" in msg or "violates foreign key" in msg:
            audit_fail(
                action="MACHINE_CREATE_FAILED",
                request=request,
                env_id=env_id,
                user_id=_principal_user_id(principal),
                entity_type="machine",
                message="Invalid machine_type",
                extra={"payload": payload, "reason": "invalid_machine_type"},
            )
            raise HTTPException(status_code=400, detail="Invalid machine_type (must exist in machine_types)")

        audit_fail(
            action="MACHINE_CREATE_FAILED",
            request=request,
            env_id=env_id,
            user_id=_principal_user_id(principal),
            entity_type="machine",
            message="Database constraint error",
            extra={"payload": payload, "reason": "db_constraint"},
        )
        raise HTTPException(status_code=400, detail="Database constraint error")


# ----------------------------
# Update machine (AUDITED)
# ----------------------------
@router.put("/{machine_id}")
def machines_update(
    machine_id: int,
    payload: Dict[str, Any],
    request: Request,
    principal: Dict[str, Any] = Depends(get_principal),
    env_id: int = Depends(get_env_id),
):
    _require_editor_or_admin(
        action_denied="MACHINE_UPDATE_DENIED",
        request=request,
        principal=principal,
        env_id=env_id,
        entity_id=machine_id,
    )

    # Capture BEFORE snapshot (for audit diff)
    before = get_machine(env_id=env_id, machine_id=machine_id)
    if not before:
        audit_fail(
            action="MACHINE_UPDATE_NOT_FOUND",
            request=request,
            env_id=env_id,
            user_id=_principal_user_id(principal),
            entity_type="machine",
            entity_id=machine_id,
            message="Machine not found",
        )
        raise HTTPException(status_code=404, detail="Machine not found")

    try:
        updated = update_machine(env_id=env_id, machine_id=machine_id, payload=payload)
        if not updated:
            # Defensive: if repo returns None, treat as not found
            audit_fail(
                action="MACHINE_UPDATE_NOT_FOUND",
                request=request,
                env_id=env_id,
                user_id=_principal_user_id(principal),
                entity_type="machine",
                entity_id=machine_id,
                message="Machine not found",
            )
            raise HTTPException(status_code=404, detail="Machine not found")

        changes = _diff(before, updated if isinstance(updated, dict) else {})

        audit_success(
            action="MACHINE_UPDATED",
            request=request,
            env_id=env_id,
            user_id=_principal_user_id(principal),
            entity_type="machine",
            entity_id=machine_id,
            message="Machine updated",
            extra={
                "payload": payload,
                "changes": changes,
            },
        )

        return updated

    except psycopg2.IntegrityError as e:
        msg = str(e).lower()
        if "machines_env_code_uniq" in msg or "duplicate key" in msg:
            audit_fail(
                action="MACHINE_UPDATE_FAILED",
                request=request,
                env_id=env_id,
                user_id=_principal_user_id(principal),
                entity_type="machine",
                entity_id=machine_id,
                message="Machine code already exists",
                extra={"payload": payload, "reason": "duplicate_machine_code"},
            )
            raise HTTPException(status_code=409, detail="Machine code already exists in this environment")

        if "machines_machine_type_fk" in msg or "violates foreign key" in msg:
            audit_fail(
                action="MACHINE_UPDATE_FAILED",
                request=request,
                env_id=env_id,
                user_id=_principal_user_id(principal),
                entity_type="machine",
                entity_id=machine_id,
                message="Invalid machine_type",
                extra={"payload": payload, "reason": "invalid_machine_type"},
            )
            raise HTTPException(status_code=400, detail="Invalid machine_type (must exist in machine_types)")

        audit_fail(
            action="MACHINE_UPDATE_FAILED",
            request=request,
            env_id=env_id,
            user_id=_principal_user_id(principal),
            entity_type="machine",
            entity_id=machine_id,
            message="Database constraint error",
            extra={"payload": payload, "reason": "db_constraint"},
        )
        raise HTTPException(status_code=400, detail="Database constraint error")


# ----------------------------
# Deactivate (soft delete) machine (AUDITED)
# ----------------------------
@router.delete("/{machine_id}", status_code=204)
def machines_delete(
    machine_id: int,
    request: Request,
    principal: Dict[str, Any] = Depends(get_principal),
    env_id: int = Depends(get_env_id),
):
    _require_editor_or_admin(
        action_denied="MACHINE_DEACTIVATE_DENIED",
        request=request,
        principal=principal,
        env_id=env_id,
        entity_id=machine_id,
    )

    # Fetch before so the audit log can include machine name/code if desired
    before = get_machine(env_id=env_id, machine_id=machine_id)
    if not before:
        audit_fail(
            action="MACHINE_DEACTIVATE_NOT_FOUND",
            request=request,
            env_id=env_id,
            user_id=_principal_user_id(principal),
            entity_type="machine",
            entity_id=machine_id,
            message="Machine not found",
        )
        raise HTTPException(status_code=404, detail="Machine not found")

    ok = soft_delete_machine(env_id=env_id, machine_id=machine_id)
    if not ok:
        audit_fail(
            action="MACHINE_DEACTIVATE_FAILED",
            request=request,
            env_id=env_id,
            user_id=_principal_user_id(principal),
            entity_type="machine",
            entity_id=machine_id,
            message="Machine not found",
        )
        raise HTTPException(status_code=404, detail="Machine not found")

    audit_success(
        action="MACHINE_DEACTIVATED",
        request=request,
        env_id=env_id,
        user_id=_principal_user_id(principal),
        entity_type="machine",
        entity_id=machine_id,
        message="Machine deactivated",
        extra={
            "machine_name": before.get("machine_name"),
            "machine_code": before.get("machine_code"),
        },
    )

    return None
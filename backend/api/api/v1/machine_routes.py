# app/api/v1/machines_routes.py
from __future__ import annotations

from typing import Optional, Dict, Any

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, status, Query

from app.core.auth import get_principal, get_env_id
from app.db.machines_repo import (
    list_machines,
    get_machine,
    create_machine,
    update_machine,
    soft_delete_machine,
)

router = APIRouter(prefix="/v1/machines", tags=["Machines"])


def _require_editor_or_admin(principal: Dict[str, Any]) -> None:
    role = (principal.get("role") or "Viewer").lower()
    if role not in {"admin", "editor"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions (requires Admin or Editor)",
        )


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


@router.post("", status_code=201)
def machines_create(
    payload: Dict[str, Any],
    principal: Dict[str, Any] = Depends(get_principal),
    env_id: int = Depends(get_env_id),
):
    _require_editor_or_admin(principal)

    # Minimal required fields validation (DB will also enforce some)
    for f in ("machine_name", "machine_code", "machine_type"):
        if not payload.get(f):
            raise HTTPException(status_code=400, detail=f"Missing required field: {f}")

    try:
        created = create_machine(env_id=env_id, payload=payload)
        return created
    except psycopg2.IntegrityError as e:
        # Handle unique constraint & FK errors in a user-friendly way
        msg = str(e).lower()
        if "machines_env_code_uniq" in msg or "duplicate key" in msg:
            raise HTTPException(status_code=409, detail="Machine code already exists in this environment")
        if "machines_machine_type_fk" in msg or "violates foreign key" in msg:
            raise HTTPException(status_code=400, detail="Invalid machine_type (must exist in machine_types)")
        raise HTTPException(status_code=400, detail="Database constraint error")


@router.put("/{machine_id}")
def machines_update(
    machine_id: int,
    payload: Dict[str, Any],
    principal: Dict[str, Any] = Depends(get_principal),
    env_id: int = Depends(get_env_id),
):
    _require_editor_or_admin(principal)

    try:
        updated = update_machine(env_id=env_id, machine_id=machine_id, payload=payload)
        if not updated:
            raise HTTPException(status_code=404, detail="Machine not found")
        return updated
    except psycopg2.IntegrityError as e:
        msg = str(e).lower()
        if "machines_env_code_uniq" in msg or "duplicate key" in msg:
            raise HTTPException(status_code=409, detail="Machine code already exists in this environment")
        if "machines_machine_type_fk" in msg or "violates foreign key" in msg:
            raise HTTPException(status_code=400, detail="Invalid machine_type (must exist in machine_types)")
        raise HTTPException(status_code=400, detail="Database constraint error")


@router.delete("/{machine_id}", status_code=204)
def machines_delete(
    machine_id: int,
    principal: Dict[str, Any] = Depends(get_principal),
    env_id: int = Depends(get_env_id),
):
    _require_editor_or_admin(principal)

    ok = soft_delete_machine(env_id=env_id, machine_id=machine_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Machine not found")
    return None
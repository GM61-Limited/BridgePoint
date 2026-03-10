# app/api/v1/maintenance_routes.py
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response, status, Request

from app.core.auth import get_principal
from app.core.audit import audit_success, audit_fail
from app.db.connection import get_db_connection
from app.db.maintenance_repo import (
    list_maintenance_logs as repo_list_maintenance_logs,
    create_maintenance_log as repo_create_maintenance_log,
    get_maintenance_log_owner as repo_get_maintenance_log_owner,
    delete_maintenance_log as repo_delete_maintenance_log,
)

# IMPORTANT: no '/api' here. Frontend hits '/api/...' and Nginx strips '/api' before proxying.
router = APIRouter(prefix="/v1/maintenance", tags=["maintenance"])


def _parse_uuid(value: str) -> UUID:
    try:
        return UUID(str(value))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid maintenance log id (must be UUID)")


def _validate_create_payload(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validates and normalises incoming create payload.
    Expects:
      machine_id (int)
      reason (str)
      started_at (ISO str)
      ended_at (optional ISO str or null)
      notes (optional str)
    """
    # machine_id
    if body.get("machine_id") in (None, "", []):
        raise HTTPException(status_code=400, detail="machine_id is required")
    try:
        machine_id = int(body["machine_id"])
        if machine_id <= 0:
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=400, detail="machine_id must be a positive integer")

    # reason
    reason = str(body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="reason is required")

    # started_at
    raw_started = body.get("started_at")
    if not raw_started:
        raise HTTPException(status_code=400, detail="started_at is required")
    try:
        started_at = datetime.fromisoformat(str(raw_started).replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="started_at must be a valid ISO datetime")

    # ended_at (optional)
    ended_at: Optional[datetime] = None
    raw_ended = body.get("ended_at")
    if raw_ended not in (None, "", "null"):
        try:
            ended_at = datetime.fromisoformat(str(raw_ended).replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="ended_at must be a valid ISO datetime or null")

    if ended_at is not None and ended_at < started_at:
        raise HTTPException(status_code=400, detail="ended_at cannot be before started_at")

    # notes (optional)
    notes_raw = body.get("notes")
    notes = None
    if notes_raw is not None:
        notes = str(notes_raw).strip()
        if notes == "":
            notes = None

    return {
        "machine_id": machine_id,
        "reason": reason,
        "started_at": started_at,
        "ended_at": ended_at,
        "notes": notes,
    }


@router.get("")
def list_maintenance_logs(
    machine_id: Optional[int] = Query(default=None, ge=1),
    q: Optional[str] = Query(default=None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    principal: Dict[str, Any] = Depends(get_principal),
    conn=Depends(get_db_connection),
) -> List[Dict[str, Any]]:
    """
    List maintenance logs for the current tenant (environment).
    Optional filters:
      - machine_id
      - q (search in machine_name/reason/notes)
    """
    env_id = int(principal["env_id"])

    try:
        rows = repo_list_maintenance_logs(
            conn,
            env_id=env_id,
            machine_id=machine_id,
            q=q,
            limit=limit,
            offset=offset,
        )
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list maintenance logs: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.post("", status_code=status.HTTP_201_CREATED)
def create_maintenance_log(
    request: Request,
    body: Dict[str, Any] = Body(...),
    principal: Dict[str, Any] = Depends(get_principal),
    conn=Depends(get_db_connection),
) -> Dict[str, Any]:
    """
    Create a maintenance log for the current tenant (environment).
    Body example:
    {
      "machine_id": 1,
      "reason": "Preventative service",
      "started_at": "2026-03-09T12:00:00.000Z",
      "ended_at": null,
      "notes": "Checked seals..."
    }
    """
    env_id = int(principal["env_id"])
    user_id = int(principal["user_id"])

    # Validate input (this can raise HTTPException 400)
    try:
        data = _validate_create_payload(body)
    except HTTPException as he:
        audit_fail(
            action="MAINTENANCE_CREATE_FAILED",
            request=request,
            env_id=env_id,
            user_id=user_id,
            entity_type="maintenance",
            message=str(he.detail),
            extra={"payload": body, "reason": "validation_error"},
        )
        raise

    try:
        created = repo_create_maintenance_log(
            conn,
            env_id=env_id,
            user_id=user_id,
            machine_id=data["machine_id"],
            reason=data["reason"],
            started_at=data["started_at"],
            ended_at=data["ended_at"],
            notes=data["notes"],
        )
        conn.commit()

        # Try to capture the created UUID/id returned from repo
        created_id = None
        if isinstance(created, dict):
            created_id = created.get("id") or created.get("log_id")

        audit_success(
            action="MAINTENANCE_CREATED",
            request=request,
            env_id=env_id,
            user_id=user_id,
            entity_type="maintenance",
            entity_id=created_id,
            message="Maintenance log created",
            extra={
                "payload": body,
                "machine_id": data["machine_id"],
                "reason": data["reason"],
            },
        )

        return created

    except ValueError as ve:
        # Repo uses ValueError for "not found in env" etc.
        try:
            conn.rollback()
        except Exception:
            pass

        audit_fail(
            action="MAINTENANCE_CREATE_FAILED",
            request=request,
            env_id=env_id,
            user_id=user_id,
            entity_type="maintenance",
            message=str(ve),
            extra={"payload": body, "reason": "repo_value_error"},
        )

        raise HTTPException(status_code=404, detail=str(ve))

    except HTTPException as he:
        try:
            conn.rollback()
        except Exception:
            pass

        audit_fail(
            action="MAINTENANCE_CREATE_FAILED",
            request=request,
            env_id=env_id,
            user_id=user_id,
            entity_type="maintenance",
            message=str(he.detail),
            extra={"payload": body, "reason": "http_exception"},
        )

        raise

    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass

        audit_fail(
            action="MAINTENANCE_CREATE_FAILED",
            request=request,
            env_id=env_id,
            user_id=user_id,
            entity_type="maintenance",
            message="Failed to create maintenance log",
            extra={"payload": body, "error": str(e), "reason": "exception"},
        )

        raise HTTPException(status_code=500, detail=f"Failed to create maintenance log: {e}")

    finally:
        try:
            conn.close()
        except Exception:
            pass


@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_maintenance_log(
    log_id: str,
    request: Request,
    principal: Dict[str, Any] = Depends(get_principal),
    conn=Depends(get_db_connection),
) -> Response:
    """
    Delete a maintenance log within the current tenant.
    Authorization:
      - Admin can delete any log
      - Otherwise only the creator can delete (if created_by is set)
    """
    env_id = int(principal["env_id"])
    user_id = int(principal["user_id"])
    role = str(principal.get("role") or "Viewer")

    log_uuid = _parse_uuid(log_id)

    try:
        row = repo_get_maintenance_log_owner(conn, env_id=env_id, log_id=log_uuid)
        if not row:
            audit_fail(
                action="MAINTENANCE_DELETE_NOT_FOUND",
                request=request,
                env_id=env_id,
                user_id=user_id,
                entity_type="maintenance",
                entity_id=str(log_uuid),
                message="Maintenance log not found",
            )
            raise HTTPException(status_code=404, detail="Maintenance log not found")

        created_by = row.get("created_by")

        # Simple auth rule
        if role != "Admin":
            if created_by is None or int(created_by) != user_id:
                audit_fail(
                    action="MAINTENANCE_DELETE_DENIED",
                    request=request,
                    env_id=env_id,
                    user_id=user_id,
                    entity_type="maintenance",
                    entity_id=str(log_uuid),
                    message="Not permitted to delete this entry",
                    extra={"role": role, "created_by": created_by},
                )
                raise HTTPException(status_code=403, detail="Not permitted to delete this entry")

        deleted_count = repo_delete_maintenance_log(conn, env_id=env_id, log_id=log_uuid)
        if deleted_count == 0:
            audit_fail(
                action="MAINTENANCE_DELETE_NOT_FOUND",
                request=request,
                env_id=env_id,
                user_id=user_id,
                entity_type="maintenance",
                entity_id=str(log_uuid),
                message="Maintenance log not found",
            )
            raise HTTPException(status_code=404, detail="Maintenance log not found")

        conn.commit()

        audit_success(
            action="MAINTENANCE_DELETED",
            request=request,
            env_id=env_id,
            user_id=user_id,
            entity_type="maintenance",
            entity_id=str(log_uuid),
            message="Maintenance log deleted",
            extra={
                "machine_id": row.get("machine_id"),
                "reason": row.get("reason"),
            },
        )

        return Response(status_code=status.HTTP_204_NO_CONTENT)

    except HTTPException:
        try:
            conn.rollback()
        except Exception:
            pass
        raise

    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass

        audit_fail(
            action="MAINTENANCE_DELETE_FAILED",
            request=request,
            env_id=env_id,
            user_id=user_id,
            entity_type="maintenance",
            entity_id=str(log_uuid),
            message="Failed to delete maintenance log",
            extra={"error": str(e), "reason": "exception"},
        )

        raise HTTPException(status_code=500, detail=f"Failed to delete maintenance log: {e}")

    finally:
        try:
            conn.close()
        except Exception:
            pass
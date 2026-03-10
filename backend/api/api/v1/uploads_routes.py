from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Query, Request

from app.core.config import settings
from app.core.audit import audit_success, audit_fail
from app.core.washer_xml_phase1 import parse_washer_xml_phase1
from app.db.connection import get_db_connection
from app.db.uploads_repo import create_washer_xml_upload, list_washer_xml_uploads

router = APIRouter(prefix="/v1/uploads", tags=["Uploads"])

_ALLOWED_CONTENT_TYPES = {"application/xml", "text/xml", "application/octet-stream"}


def _safe_segment(value: str) -> str:
    value = (value or "").strip().replace(" ", "_")
    value = re.sub(r"[^A-Za-z0-9._-]", "", value)
    return value or "unknown"


def _safe_filename(filename: str) -> str:
    filename = (filename or "").strip().replace(" ", "_")
    filename = re.sub(r"[^A-Za-z0-9._-]", "", filename)
    if not filename:
        filename = "upload.xml"
    if not filename.lower().endswith(".xml"):
        filename += ".xml"
    return filename


def _rel_upload_path(env_seg: str, machine_id: int, stored_name: str) -> str:
    # Avoid logging absolute filesystem paths in audit logs
    return f"washer-xml/env_{env_seg}/machine_{machine_id}/{stored_name}"


# ==================================================
# LIST UPLOADS (usually not audited)
# ==================================================
@router.get("/washer-xml")
def get_washer_xml_uploads(
    environment_code: Optional[str] = Query(None),
    machine_id: Optional[int] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
):
    items = list_washer_xml_uploads(
        environment_code=environment_code,
        machine_id=machine_id,
        limit=limit,
    )
    return {"items": items}


# ==================================================
# UPLOAD XML (AUDITED)
# ==================================================
@router.post("/washer-xml")
async def upload_washer_xml(
    request: Request,
    file: UploadFile = File(...),
    environment_code: str = Form(...),
    machine_id: int = Form(...),
    cycle_number: Optional[str] = Form(None),
):
    """
    Upload washer XML and trigger phase-1 parsing (critical).
    Audit logs are written server-side for compliance.
    """
    # --------------------------------------------------
    # Validate filename and content type
    # --------------------------------------------------
    filename = _safe_filename(file.filename or "upload.xml")

    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        # Allow octet-stream only when filename endswith .xml; otherwise reject
        if not filename.lower().endswith(".xml"):
            audit_fail(
                action="WASHER_XML_UPLOAD_REJECTED",
                request=request,
                env_id=1,  # env_id may be unknown at this point
                user_id=None,
                entity_type="upload",
                message="Unsupported content-type",
                extra={
                    "content_type": file.content_type,
                    "filename": filename,
                    "environment_code": environment_code,
                    "machine_id": machine_id,
                    "cycle_number": cycle_number,
                },
            )
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported content-type: {file.content_type}",
            )

    # --------------------------------------------------
    # Storage path
    # --------------------------------------------------
    env_seg = _safe_segment(environment_code)
    base_dir = (
        Path(settings.UPLOAD_BASE_DIR)
        / "washer-xml"
        / f"env_{env_seg}"
        / f"machine_{machine_id}"
    )
    base_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    cycle_part = f"__cycle-{_safe_segment(cycle_number)}" if cycle_number else ""
    stored_name = f"{ts}{cycle_part}__{filename}"
    stored_path = base_dir / stored_name

    # --------------------------------------------------
    # Stream upload to disk (size‑capped)
    # --------------------------------------------------
    max_bytes = int(getattr(settings, "MAX_UPLOAD_MB", 25)) * 1024 * 1024
    written = 0

    try:
        with stored_path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    try:
                        stored_path.unlink(missing_ok=True)
                    except Exception:
                        pass

                    audit_fail(
                        action="WASHER_XML_UPLOAD_TOO_LARGE",
                        request=request,
                        env_id=1,
                        user_id=None,
                        entity_type="upload",
                        message="File too large",
                        extra={
                            "filename": filename,
                            "environment_code": environment_code,
                            "machine_id": machine_id,
                            "cycle_number": cycle_number,
                            "bytes_written": written,
                            "max_bytes": max_bytes,
                        },
                    )

                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Max {settings.MAX_UPLOAD_MB}MB",
                    )
                out.write(chunk)
    finally:
        await file.close()

    # --------------------------------------------------
    # Insert upload metadata (DB)
    # --------------------------------------------------
    record = create_washer_xml_upload(
        environment_code=environment_code,
        machine_id=machine_id,
        cycle_number=cycle_number,
        original_filename=filename,
        stored_filename=stored_name,
        stored_path=str(stored_path),
        bytes_count=written,
    )

    upload_id = record.get("id") if isinstance(record, dict) else None
    rel_path = _rel_upload_path(env_seg, machine_id, stored_name)

    # We do not yet know env_id for sure until we validate machine_id in DB.
    # Still log that an upload was received/stored.
    audit_success(
        action="WASHER_XML_UPLOADED",
        request=request,
        env_id=1,
        user_id=None,
        entity_type="upload",
        entity_id=upload_id,
        message="Washer XML stored",
        extra={
            "upload_id": upload_id,
            "environment_code": environment_code,
            "machine_id": machine_id,
            "cycle_number": cycle_number,
            "original_filename": filename,
            "stored_filename": stored_name,
            "stored_path": rel_path,  # relative only (no absolute path leakage)
            "bytes": written,
            "content_type": file.content_type,
        },
    )

    # --------------------------------------------------
    # Phase 1 parsing (CRITICAL, synchronous)
    # --------------------------------------------------
    conn = get_db_connection()
    try:
        # Resolve environment_id from machine_id (authoritative)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT environment_id
                FROM machines
                WHERE id = %s
                """,
                (machine_id,),
            )
            row = cur.fetchone()
            if not row:
                audit_fail(
                    action="WASHER_XML_UPLOAD_INVALID_MACHINE",
                    request=request,
                    env_id=1,
                    user_id=None,
                    entity_type="upload",
                    entity_id=upload_id,
                    message="Invalid machine_id",
                    extra={
                        "upload_id": upload_id,
                        "machine_id": machine_id,
                        "environment_code": environment_code,
                        "stored_path": rel_path,
                    },
                )
                raise HTTPException(status_code=400, detail="Invalid machine_id")

            environment_id = int(row[0])

        try:
            # ✅ Phase 1 — must succeed
            cycle_id = parse_washer_xml_phase1(
                conn=conn,
                upload_id=upload_id,
                xml_path=record["stored_path"],
                environment_id=environment_id,
                machine_id=machine_id,
            )

            conn.commit()

            audit_success(
                action="WASHER_XML_PHASE1_OK",
                request=request,
                env_id=environment_id,
                user_id=None,
                entity_type="upload",
                entity_id=upload_id,
                message="Phase 1 parsing succeeded",
                extra={
                    "cycle_id": cycle_id,
                    "machine_id": machine_id,
                    "environment_code": environment_code,
                    "stored_path": rel_path,
                },
            )

        except Exception as parse_err:
            conn.rollback()

            # Do not break uploads (as per your current behaviour)
            audit_fail(
                action="WASHER_XML_PHASE1_FAILED",
                request=request,
                env_id=environment_id,
                user_id=None,
                entity_type="upload",
                entity_id=upload_id,
                message="Phase 1 parsing failed",
                extra={
                    "machine_id": machine_id,
                    "environment_code": environment_code,
                    "stored_path": rel_path,
                    "error": str(parse_err),
                },
            )

            # Keep existing behaviour (return ok + record)
            return {"ok": True, **record}

        # --------------------------------------------------
        # Phase 2 process signals (OPTIONAL, SAFE)
        # --------------------------------------------------
        try:
            from app.core.process_signals import (
                parse_process_signals_from_xml,
                insert_process_signals,
            )

            # Read XML once
            with open(record["stored_path"], "rb") as f:
                xml_bytes = f.read()

            signals = parse_process_signals_from_xml(xml_bytes)

            if signals:
                insert_process_signals(
                    conn=conn,
                    cycle_id=cycle_id,
                    signals=signals,
                )

            conn.commit()

            audit_success(
                action="PROCESS_SIGNALS_OK",
                request=request,
                env_id=environment_id,
                user_id=None,
                entity_type="cycle",
                entity_id=cycle_id,
                message="Process signals parsed/inserted",
                extra={
                    "upload_id": upload_id,
                    "machine_id": machine_id,
                    "signals_count": (len(signals) if signals else 0),
                },
            )

        except Exception as signals_err:
            conn.rollback()

            # Process signals must NEVER break uploads
            audit_fail(
                action="PROCESS_SIGNALS_FAILED",
                request=request,
                env_id=environment_id,
                user_id=None,
                entity_type="cycle",
                entity_id=cycle_id,
                message="Process signals parsing failed",
                extra={
                    "upload_id": upload_id,
                    "machine_id": machine_id,
                    "error": str(signals_err),
                },
            )

    finally:
        conn.close()

    return {"ok": True, **record}
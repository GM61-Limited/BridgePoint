from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Query

from app.core.config import settings
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


# ==================================================
# LIST UPLOADS
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
# UPLOAD XML
# ==================================================
@router.post("/washer-xml")
async def upload_washer_xml(
    file: UploadFile = File(...),
    environment_code: str = Form(...),
    machine_id: int = Form(...),
    cycle_number: Optional[str] = Form(None),
):
    # --------------------------------------------------
    # Validate filename and content type
    # --------------------------------------------------
    filename = _safe_filename(file.filename or "upload.xml")

    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        if not filename.lower().endswith(".xml"):
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
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Max {settings.MAX_UPLOAD_MB}MB",
                    )
                out.write(chunk)
    finally:
        await file.close()

    # --------------------------------------------------
    # Insert upload metadata
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

    # --------------------------------------------------
    # Phase 1 parsing (CRITICAL, synchronous)
    # --------------------------------------------------
    conn = get_db_connection()
    try:
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
                raise HTTPException(status_code=400, detail="Invalid machine_id")
            environment_id = row[0]

        try:
            # ✅ Phase 1 — must succeed
            cycle_id = parse_washer_xml_phase1(
                conn=conn,
                upload_id=record["id"],
                xml_path=record["stored_path"],
                environment_id=environment_id,
                machine_id=machine_id,
            )

            conn.commit()

        except Exception as parse_err:
            conn.rollback()
            print(
                f"[WARN] Washer XML phase 1 parsing failed for upload {record['id']}: {parse_err}"
            )
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
                    conn=conn,          # ✅ FIXED
                    cycle_id=cycle_id,
                    signals=signals,
                )

            conn.commit()

        except Exception as signals_err:
            # Process signals must NEVER break uploads
            conn.rollback()
            print(
                f"[WARN] Process signal parsing failed for cycle {cycle_id}: {signals_err}"
            )

    finally:
        conn.close()

    return {"ok": True, **record}
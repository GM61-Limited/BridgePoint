from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Query

from app.core.config import settings
from app.core.washer_xml_parser import parse_washer_xml_phase1
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


@router.get("/washer-xml")
def get_washer_xml_uploads(
    environment_code: Optional[str] = Query(None),
    machine_id: Optional[int] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
):
    """
    List uploaded washer XML metadata.
    """
    items = list_washer_xml_uploads(
        environment_code=environment_code,
        machine_id=machine_id,
        limit=limit,
    )
    return {"items": items}


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
        # content_type is unreliable; allow based on extension
        if not filename.lower().endswith(".xml"):
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported content-type: {file.content_type}",
            )

    # --------------------------------------------------
    # Storage path (Docker volume)
    # --------------------------------------------------
    env_seg = _safe_segment(environment_code)
    base_dir = (
        Path(settings.UPLOAD_BASE_DIR)
        / "washer-xml"
        / f"env_{env_seg}"
        / f"machine_{machine_id}"
    )
    base_dir.mkdir(parents=True, exist_ok=True)

    # Collision-safe filename
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    cycle_part = f"__cycle-{_safe_segment(cycle_number)}" if cycle_number else ""
    stored_name = f"{ts}{cycle_part}__{filename}"
    stored_path = base_dir / stored_name

    # --------------------------------------------------
    # Stream upload to disk with size cap
    # --------------------------------------------------
    max_bytes = int(getattr(settings, "MAX_UPLOAD_MB", 25)) * 1024 * 1024
    written = 0

    try:
        with stored_path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)  # 1MB chunks
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
    # Phase 1 parsing (synchronous, non-fatal)
    # --------------------------------------------------
    conn = get_db_connection()
    try:
        # Resolve environment_id via machine (authoritative)
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
                raise HTTPException(
                    status_code=400,
                    detail="Invalid machine_id",
                )
            environment_id = row[0]

        try:
            parse_washer_xml_phase1(
                conn=conn,
                upload_id=record["id"],
                xml_path=record["stored_path"],
                environment_id=environment_id,
                machine_id=machine_id,
            )
        except Exception as parse_err:
            # IMPORTANT:
            # Parsing errors are recorded in DB but must NOT
            # break the upload request.
            # This allows retry / re-parse later.
            print(f"[WARN] Washer XML parsing failed for upload {record['id']}: {parse_err}")

    finally:
        conn.close()    

    return {"ok": True, **record}

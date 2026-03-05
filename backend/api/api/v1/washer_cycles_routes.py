from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os

from app.db.connection import get_db_connection

router = APIRouter(prefix="/v1/washer-cycles", tags=["Washer Cycles"])


@router.get("")
def list_washer_cycles():
    """
    List parsed washer cycles (Phase 1 fields only).
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    wc.id,
                    wc.cycle_number,
                    wc.program_name,
                    wc.started_at,
                    wc.machine_id,
                    m.machine_name,
                    wx.original_filename
                FROM washer_cycles wc
                JOIN machines m ON m.id = wc.machine_id
                LEFT JOIN washer_xml_uploads wx ON wx.id = wc.upload_id
                ORDER BY wc.started_at DESC
                """
            )
            rows = cur.fetchall()

        items = []
        for r in rows:
            items.append(
                {
                    "id": r[0],
                    "cycle_number": r[1],
                    "program_name": r[2],
                    "started_at": r[3].isoformat() if r[3] else None,
                    "machine_id": r[4],
                    "machine_name": r[5],
                    "original_filename": r[6],
                }
            )

        return {"items": items}
    finally:
        conn.close()


@router.get("/{cycle_id}")
def get_washer_cycle(cycle_id: int):
    """
    Get details for a single washer cycle (Phase 1).
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    wc.id,
                    wc.cycle_number,
                    wc.program_name,
                    wc.started_at,
                    wc.machine_id,
                    m.machine_name,
                    wx.original_filename
                FROM washer_cycles wc
                JOIN machines m ON m.id = wc.machine_id
                LEFT JOIN washer_xml_uploads wx ON wx.id = wc.upload_id
                WHERE wc.id = %s
                """,
                (cycle_id,),
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Cycle not found")

        return {
            "id": row[0],
            "cycle_number": row[1],
            "program_name": row[2],
            "started_at": row[3].isoformat() if row[3] else None,
            "machine_id": row[4],
            "machine_name": row[5],
            "original_filename": row[6],
        }
    finally:
        conn.close()


@router.get("/{cycle_id}/download")
def download_washer_cycle_xml(cycle_id: int):
    """
    Download the original XML file for a washer cycle.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    wx.stored_path,
                    wx.original_filename
                FROM washer_cycles wc
                JOIN washer_xml_uploads wx ON wx.id = wc.upload_id
                WHERE wc.id = %s
                """,
                (cycle_id,),
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Cycle or XML not found")

        stored_path, original_filename = row

        if not stored_path or not os.path.exists(stored_path):
            raise HTTPException(status_code=404, detail="XML file missing on disk")

        return FileResponse(
            path=stored_path,
            filename=original_filename,
            media_type="application/xml; charset=utf-8",
        )
    finally:
        conn.close()
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.db.connection import get_db_connection

router = APIRouter(prefix="/v1/washer-cycles", tags=["Washer Cycles"])


# ==================================================
# LIST CYCLES
# ==================================================
@router.get("")
def list_washer_cycles():
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
                    wc.ended_at,
                    wc.machine_id,
                    m.machine_name,
                    wx.original_filename,
                    wc.result,
                    wc.extra
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
                    "ended_at": r[4].isoformat() if r[4] else None,
                    "machine_id": r[5],
                    "machine_name": r[6],
                    "original_filename": r[7],
                    "result": r[8],
                    "extra": r[9],  # ✅ CRITICAL
                }
            )

        return {"items": items}
    finally:
        conn.close()


# ==================================================
# GET SINGLE CYCLE
# ==================================================
@router.get("/{cycle_id}")
def get_washer_cycle(cycle_id: int):
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
                    wc.ended_at,
                    wc.machine_id,
                    m.machine_name,
                    wx.original_filename,
                    wc.result,
                    wc.extra
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
            "ended_at": row[4].isoformat() if row[4] else None,
            "machine_id": row[5],
            "machine_name": row[6],
            "original_filename": row[7],
            "result": row[8],
            "extra": row[9],  # ✅ THIS FIXES THE UI
        }
    finally:
        conn.close()


# ==================================================
# DOWNLOAD ORIGINAL XML
# ==================================================
@router.get("/{cycle_id}/download")
def download_washer_cycle_xml(cycle_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT wx.stored_path, wx.original_filename
                FROM washer_cycles wc
                JOIN washer_xml_uploads wx ON wx.id = wc.upload_id
                WHERE wc.id = %s
                """,
                (cycle_id,),
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Cycle not found")

        stored_path, original_filename = row

        return FileResponse(
            path=stored_path,
            media_type="application/xml",
            filename=original_filename or "cycle.xml",
        )
    finally:
        conn.close()


# ==================================================
# DELETE CYCLE
# ==================================================
@router.delete("/{cycle_id}")
def delete_washer_cycle(cycle_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM washer_cycles WHERE id = %s",
                (cycle_id,),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Cycle not found")

            cur.execute(
                "DELETE FROM washer_cycles WHERE id = %s",
                (cycle_id,),
            )

        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ==================================================
# PHASE 2.1 — TELEMETRY (UNCHANGED)
# ==================================================
@router.get("/{cycle_id}/telemetry")
def get_washer_cycle_telemetry(cycle_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    wc.id,
                    wc.started_at,
                    wc.result,
                    wx.original_filename
                FROM washer_cycles wc
                LEFT JOIN washer_xml_uploads wx ON wx.id = wc.upload_id
                WHERE wc.id = %s
                """,
                (cycle_id,),
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Cycle not found")

        cycle_id, started_at, result_bool, original_filename = row

        if result_bool is True:
            result = "PASS"
        elif result_bool is False:
            result = "FAIL"
        else:
            result = "UNKNOWN"

        return {
            "cycle_id": cycle_id,
            "started_at": started_at.isoformat() if started_at else None,
            "validation": {
                "source": "cycle_result",
                "result": result,
                "original_filename": original_filename,
            },
            "points": [],
        }
    finally:
        conn.close()
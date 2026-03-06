from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.db.connection import get_db_connection

router = APIRouter(prefix="/v1/washer-cycles", tags=["Washer Cycles"])


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
                    wc.result
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
                }
            )

        return {"items": items}
    finally:
        conn.close()


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


# --------------------------------------------------
# ✅ FIXED DELETE (PHASE‑1 SAFE, NO 500s)
# --------------------------------------------------
@router.delete("/{cycle_id}")
def delete_washer_cycle(cycle_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Ensure cycle exists
            cur.execute(
                "SELECT 1 FROM washer_cycles WHERE id = %s",
                (cycle_id,),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Cycle not found")

            # Delete cycle only (rely on DB constraints / cascades)
            cur.execute(
                "DELETE FROM washer_cycles WHERE id = %s",
                (cycle_id,),
            )

        conn.commit()
        return {"ok": True}
    finally:
        conn.close()
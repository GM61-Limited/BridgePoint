from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from io import BytesIO

from app.db.connection import get_db_connection


router = APIRouter(prefix="/v1/cycles", tags=["Cycles PDF"])


@router.get("/{cycle_id}/export-pdf")
def export_cycle_pdf(cycle_id: int):
    """
    Export a single wash cycle as a one-page PDF.
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
                    wc.ended_at,
                    wc.result,
                    wc.extra,
                    m.machine_name
                FROM washer_cycles wc
                JOIN machines m ON m.id = wc.machine_id
                WHERE wc.id = %s
                """,
                (cycle_id,),
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Cycle not found")

        (
            _id,
            cycle_number,
            program_name,
            started_at,
            ended_at,
            result,
            extra,
            machine_name,
        ) = row

        buffer = BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=15 * mm,
            leftMargin=15 * mm,
            topMargin=15 * mm,
            bottomMargin=15 * mm,
        )

        styles = getSampleStyleSheet()
        elements = []

        # -------------------------
        # Header
        # -------------------------
        elements.append(Paragraph("Wash Cycle Report", styles["Title"]))
        elements.append(Spacer(1, 6))

        duration = None
        if started_at and ended_at:
            duration = int((ended_at - started_at).total_seconds())

        header_table = Table(
            [
                ["Machine", machine_name],
                ["Program", program_name or "—"],
                ["Cycle Number", cycle_number or "—"],
                ["Start", started_at.isoformat() if started_at else "—"],
                ["End", ended_at.isoformat() if ended_at else "—"],
                [
                    "Duration",
                    f"{duration // 60} min {duration % 60} sec" if duration else "—",
                ],
                ["Result", result or "—"],
            ],
            colWidths=[45 * mm, 120 * mm],
        )

        header_table.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("BACKGROUND", (0, 0), (0, -1), colors.whitesmoke),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )

        elements.append(header_table)
        elements.append(Spacer(1, 10))

        # -------------------------
        # Graph placeholder
        # -------------------------
        elements.append(
            Paragraph(
                "Cycle Telemetry Graph (placeholder)",
                styles["Heading3"],
            )
        )

        graph_box = Table(
            [[""]],
            colWidths=[170 * mm],
            rowHeights=[90 * mm],
        )
        graph_box.setStyle(
            TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 1, colors.black),
                ]
            )
        )

        elements.append(graph_box)
        elements.append(Spacer(1, 10))

        # -------------------------
        # Critical parameters
        # -------------------------
        elements.append(Paragraph("Critical Parameters", styles["Heading3"]))
        elements.append(Spacer(1, 4))

        stages = (extra or {}).get("stages", {})

        rows = [["Stage", "Start", "End", "Temp (°C)"]]

        for key in ["pre_wash", "wash", "rinse", "disinfection", "drying"]:
            s = stages.get(key, {})
            rows.append(
                [
                    key.replace("_", " ").title(),
                    s.get("started_at", "—"),
                    s.get("ended_at", "—"),
                    s.get("temperature_c", "—"),
                ]
            )

        stages_table = Table(
            rows,
            colWidths=[35 * mm, 45 * mm, 45 * mm, 35 * mm],
        )

        stages_table.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                ]
            )
        )

        elements.append(stages_table)
        elements.append(Spacer(1, 14))

        # -------------------------
        # Signature block
        # -------------------------
        signature_table = Table(
            [
                ["Signature:", "______________________________"],
                ["Printed Name:", "______________________________"],
                ["Date:", "______________________________"],
            ],
            colWidths=[40 * mm, 120 * mm],
        )

        signature_table.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ]
            )
        )

        elements.append(signature_table)

        doc.build(elements)

        pdf_bytes = buffer.getvalue()
        buffer.close()

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="cycle_{cycle_id}.pdf"'
            },
        )

    finally:
        conn.close()
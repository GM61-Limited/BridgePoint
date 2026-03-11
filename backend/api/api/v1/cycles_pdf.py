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
    Image,
)
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from io import BytesIO
from datetime import datetime

from app.db.connection import get_db_connection

# --------------------------------------------------
# Optional matplotlib import (DO NOT crash backend)
# --------------------------------------------------

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    HAS_MATPLOTLIB = True
except Exception:
    HAS_MATPLOTLIB = False


router = APIRouter(prefix="/v1/cycles", tags=["Cycles PDF"])


# --------------------------------------------------
# Helpers
# --------------------------------------------------

def fmt_dt(value):
    if not value:
        return "—"

    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y %H:%M:%S")

    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime(
                "%d/%m/%Y %H:%M:%S"
            )
        except Exception:
            return value

    return "—"


def fmt_result(result):
    if result is True:
        return "PASS"
    if result is False:
        return "FAIL"
    return "UNKNOWN"


# --------------------------------------------------
# Graph rendering (4 Y-axes, legend below)
# --------------------------------------------------

def render_cycle_graph(cycle_id: int) -> BytesIO | None:
    if not HAS_MATPLOTLIB:
        return None

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    st.code,
                    wcp.t_sec,
                    wcp.value
                FROM washer_cycle_points wcp
                JOIN sensor_types st ON st.id = wcp.sensor_type_id
                WHERE wcp.cycle_id = %s
                ORDER BY st.code, wcp.t_sec
                """,
                (cycle_id,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        return None

    # -----------------------------
    # Group telemetry
    # -----------------------------
    series = {}
    for code, t_sec, value in rows:
        series.setdefault(code, {"t": [], "v": []})
        series[code]["t"].append(t_sec / 60)
        series[code]["v"].append(value)

    # -----------------------------
    # Figure + axes
    # -----------------------------
    fig, ax_temp = plt.subplots(figsize=(9, 5.5))
    fig.patch.set_facecolor("white")

    ax_a0 = ax_temp.twinx()
    ax_pressure = ax_temp.twinx()
    ax_cond = ax_temp.twinx()

    # Axis offsets
    ax_pressure.spines["right"].set_position(("axes", 1.08))
    ax_cond.spines["right"].set_position(("axes", 1.18))
    ax_a0.spines["left"].set_position(("axes", -0.12))

    ax_a0.yaxis.set_label_position("left")
    ax_a0.yaxis.tick_left()

    colours = {
        "temperature_1": "#ff7a00",
        "temperature_2": "#ff3b3b",
        "a0": "#00bcd4",
        "pressure": "#2ecc71",
        "conductivity": "#6f42c1",
    }

    # -----------------------------
    # Plot data
    # -----------------------------
    for code, data in series.items():
        c = colours.get(code, "#555")

        if code.startswith("temperature"):
            ax_temp.plot(data["t"], data["v"], color=c, label=code)
        elif code == "a0":
            ax_a0.plot(data["t"], data["v"], color=c, label=code)
        elif code == "pressure":
            ax_pressure.plot(data["t"], data["v"], color=c, label=code)
        elif code == "conductivity":
            ax_cond.plot(data["t"], data["v"], color=c, label=code)

    # -----------------------------
    # Axis labels
    # -----------------------------
    ax_temp.set_xlabel("Time (minutes)")
    ax_temp.set_ylabel("Temperature (°C)", color=colours["temperature_1"])
    ax_a0.set_ylabel("A₀", color=colours["a0"])
    ax_pressure.set_ylabel("Pressure (bar)", color=colours["pressure"])
    ax_cond.set_ylabel("Conductivity (µS/cm)", color=colours["conductivity"])

    ax_temp.grid(True, alpha=0.25)

    # -----------------------------
    # Legend BELOW the graph
    # -----------------------------
    lines, labels = [], []
    for ax in (ax_temp, ax_a0, ax_pressure, ax_cond):
        l, lab = ax.get_legend_handles_labels()
        lines.extend(l)
        labels.extend(lab)

    fig.legend(
        lines,
        labels,
        loc="lower center",
        ncol=3,
        fontsize=8,
        frameon=False,
    )

    # Leave space for legend
    plt.tight_layout(rect=[0, 0.12, 1, 1])

    # -----------------------------
    # Render to buffer
    # -----------------------------
    buf = BytesIO()
    plt.savefig(buf, format="png", dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf


# --------------------------------------------------
# PDF Export
# --------------------------------------------------

@router.get("/{cycle_id}/export-pdf")
def export_cycle_pdf(cycle_id: int):
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
    finally:
        conn.close()

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

    duration = None
    if started_at and ended_at:
        duration = int((ended_at - started_at).total_seconds())

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=12 * mm,
        leftMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )

    styles = getSampleStyleSheet()
    elements = []

    elements.append(
        Paragraph(f"Wash Cycle Report – Cycle #{cycle_number}", styles["Title"])
    )
    elements.append(Spacer(1, 6))

    header_table = Table(
        [
            ["Machine", machine_name],
            ["Program", program_name or "—"],
            ["Cycle Number", cycle_number or "—"],
            ["Start", fmt_dt(started_at)],
            ["End", fmt_dt(ended_at)],
            [
                "Duration",
                f"{duration // 60} min {duration % 60} sec" if duration else "—",
            ],
            ["Result", fmt_result(result)],
        ],
        colWidths=[45 * mm, 115 * mm],
    )

    header_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("BACKGROUND", (0, 0), (0, -1), colors.whitesmoke),
            ]
        )
    )

    elements.append(header_table)
    elements.append(Spacer(1, 8))

    elements.append(Paragraph("Cycle Telemetry Graph", styles["Heading3"]))
    elements.append(Spacer(1, 4))

    graph_buf = render_cycle_graph(cycle_id)
    if graph_buf:
        elements.append(Image(graph_buf, width=180 * mm, height=110 * mm))
    else:
        elements.append(
            Table(
                [["Graph unavailable"]],
                colWidths=[180 * mm],
                rowHeights=[110 * mm],
            )
        )

    elements.append(Spacer(1, 8))

    elements.append(Paragraph("Critical Parameters", styles["Heading3"]))
    elements.append(Spacer(1, 4))

    stages = (extra or {}).get("stages", {})
    rows = [["Stage", "Start", "End", "Temp (°C)"]]

    for key in ["pre_wash", "wash", "rinse", "disinfection", "drying"]:
        s = stages.get(key, {})
        rows.append(
            [
                key.replace("_", " ").title(),
                fmt_dt(s.get("started_at")),
                fmt_dt(s.get("ended_at")),
                s.get("temperature_c", "—"),
            ]
        )

    stages_table = Table(
        rows,
        colWidths=[35 * mm, 45 * mm, 45 * mm, 30 * mm],
    )

    stages_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                ("ALIGN", (1, 1), (-1, -1), "CENTER"),
            ]
        )
    )

    elements.append(stages_table)
    elements.append(Spacer(1, 10))

    signature_table = Table(
        [
            ["Signature:", "______________________________"],
            ["Printed Name:", "______________________________"],
            ["Date:", "______________________________"],
        ],
        colWidths=[40 * mm, 115 * mm],
    )

    signature_table.setStyle(
        TableStyle(
            [("GRID", (0, 0), (-1, -1), 0.5, colors.grey)]
        )
    )

    elements.append(signature_table)

    def _set_pdf_metadata(canvas, _):
        canvas.setTitle(f"Wash Cycle {cycle_number}")

    doc.build(elements, onFirstPage=_set_pdf_metadata)

    pdf_bytes = buffer.getvalue()
    buffer.close()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'inline; filename="wash_cycle_{cycle_number or cycle_id}.pdf"'
            )
        },
    )
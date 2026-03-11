import json
from typing import Dict, List, Any
from datetime import datetime, timedelta

from app.core.washer_xml_common import (
    parse_epoch,
    first_present,
    parse_result,
    canonical_stage,
)

from app.core.process_signals import parse_process_signals_from_xml


def _valid_epoch(dt: datetime | None) -> datetime | None:
    if not dt:
        return None
    try:
        if dt.timestamp() <= 0:
            return None
    except Exception:
        return None
    return dt


# ------------------------------------------------------------------
# Stage temperature logic
# ------------------------------------------------------------------

def _stage_temperature(
    rows: List[Dict[str, Any]],
    start: datetime,
    end: datetime,
    stage_name: str,
) -> float | None:
    """
    Derive stage temperature from process signals.

    Rules:
      - Normal stages: average temp during stage
      - Pre-wash: first temp >= start
      - Drying: max temp within 5 minutes AFTER stage end
    """

    # -------------------------
    # Temps during stage
    # -------------------------

    temps_during = [
        row["values"]["temperature_1"]
        for row in rows
        if start <= row["timestamp"] <= end
        and "temperature_1" in row["values"]
    ]

    if temps_during:
        return round(sum(temps_during) / len(temps_during), 2)

    # -------------------------
    # Pre-wash fallback
    # -------------------------

    if stage_name == "pre_wash":
        for row in rows:
            if row["timestamp"] >= start and "temperature_1" in row["values"]:
                return round(row["values"]["temperature_1"], 2)

    # -------------------------
    # Drying fallback (heat continues after stage)
    # -------------------------

    if stage_name == "drying":
        cutoff = end + timedelta(minutes=5)
        temps_after = [
            row["values"]["temperature_1"]
            for row in rows
            if end <= row["timestamp"] <= cutoff
            and "temperature_1" in row["values"]
        ]
        if temps_after:
            return round(max(temps_after), 2)

    return None


# ------------------------------------------------------------------
# Phase‑1 parser
# ------------------------------------------------------------------

def parse_washer_xml_phase1(
    conn,
    upload_id: int,
    xml_path: str,
    environment_id: int,
    machine_id: int,
) -> int:
    """
    Phase 1 MUST NEVER FAIL.
    Returns cycle_id.
    """

    cur = conn.cursor()

    # --------------------------------------------------
    # Load raw XML bytes
    # --------------------------------------------------

    with open(xml_path, "rb") as f:
        xml_bytes = f.read()

    # --------------------------------------------------
    # Parse process signals (same source as graph)
    # --------------------------------------------------

    process_rows = parse_process_signals_from_xml(xml_bytes)

    # --------------------------------------------------
    # XML map for metadata / stages
    # --------------------------------------------------

    from app.core.washer_xml_common import extract_xml_map
    xml = extract_xml_map(xml_path)

    # --------------------------------------------------
    # Cycle metadata
    # --------------------------------------------------

    try:
        cycle_number = int(xml.get("chargnr"))
    except Exception:
        cycle_number = None

    program_name = xml.get("programmname")

    try:
        program_number = int(xml.get("programNo"))
    except Exception:
        program_number = None

    result = parse_result(xml, xml_path)

    # --------------------------------------------------
    # Stage metadata
    # --------------------------------------------------

    extra = {"stages": {}}
    stage_start_times: List[datetime] = []
    stage_end_times: List[datetime] = []

    for stage_idx in range(0, 10):
        name = xml.get(f"wiStageName:{stage_idx}")
        if not name:
            continue

        canonical = canonical_stage(name)
        if not canonical:
            continue

        start_val = first_present(
            xml,
            f"wiStage1Start:{stage_idx}",
            f"wiStageStart:{stage_idx}",
        )
        end_val = first_present(
            xml,
            f"wiStage1End:{stage_idx}",
            f"wiStageEnd:{stage_idx}",
        )

        if canonical == "disinfection":
            start_val = first_present(xml, "disinfectionStart", start_val)
            end_val = first_present(xml, "disinfectionEnd", end_val)

        started_at = _valid_epoch(parse_epoch(start_val))
        ended_at = _valid_epoch(parse_epoch(end_val))

        if started_at:
            stage_start_times.append(started_at)
        if ended_at:
            stage_end_times.append(ended_at)

        temperature_c = None
        if started_at and ended_at and process_rows:
            temperature_c = _stage_temperature(
                process_rows,
                started_at,
                ended_at,
                canonical,
            )

        extra["stages"][canonical] = {
            "started_at": started_at.isoformat() if started_at else None,
            "ended_at": ended_at.isoformat() if ended_at else None,
            "temperature_c": temperature_c,
        }

    # --------------------------------------------------
    # Cycle timing (earliest stage = Pre‑Wash)
    # --------------------------------------------------

    started_at = min(stage_start_times) if stage_start_times else None
    ended_at = max(stage_end_times) if stage_end_times else None

    duration_sec = None
    if started_at and ended_at and ended_at > started_at:
        duration_sec = int((ended_at - started_at).total_seconds())

    # --------------------------------------------------
    # Insert washer_cycles
    # --------------------------------------------------

    cur.execute(
        """
        INSERT INTO washer_cycles (
            environment_id,
            machine_id,
            upload_id,
            cycle_number,
            program_name,
            program_number,
            started_at,
            ended_at,
            duration_sec,
            result,
            extra
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (machine_id, cycle_number) DO NOTHING
        RETURNING id
        """,
        (
            environment_id,
            machine_id,
            upload_id,
            cycle_number,
            program_name,
            program_number,
            started_at,
            ended_at,
            duration_sec,
            result,
            json.dumps(extra),
        ),
    )

    row = cur.fetchone()
    if row:
        cycle_id = row[0]
    else:
        cur.execute(
            """
            SELECT id FROM washer_cycles
            WHERE machine_id = %s AND cycle_number = %s
            """,
            (machine_id, cycle_number),
        )
        cycle_id = cur.fetchone()[0]

    # --------------------------------------------------
    # Mark upload parsed
    # --------------------------------------------------

    cur.execute(
        """
        UPDATE washer_xml_uploads
        SET parsed = TRUE,
            parsed_at = NOW(),
            parse_status = 'parsed',
            parse_error = NULL
        WHERE id = %s
        """,
        (upload_id,),
    )

    return cycle_id
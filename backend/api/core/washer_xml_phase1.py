# app/core/washer_xml_phase1.py

import json
from typing import Dict, List
from datetime import datetime

from app.core.washer_xml_common import (
    extract_xml_map,
    parse_epoch,
    first_present,
    parse_result,
    canonical_stage,
)


def _valid_epoch(dt: datetime | None) -> datetime | None:
    """
    Guard against invalid washer timestamps.
    Many MMM washers emit -3600000 or 0 for unused dates.
    """
    if not dt:
        return None
    try:
        # Defensive: epoch 0 / negative dates are not valid cycle times
        if dt.timestamp() <= 0:
            return None
    except Exception:
        return None
    return dt


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
    xml: Dict[str, str] = extract_xml_map(xml_path)

    # -------------------------
    # Cycle metadata
    # -------------------------

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

    # -------------------------
    # Stage metadata
    # -------------------------

    extra = {"stages": {}}
    stage_start_times: List[datetime] = []
    stage_end_times: List[datetime] = []

    for stage_idx in range(0, 10):
        stage_name = xml.get(f"wiStageName:{stage_idx}")
        if not stage_name:
            continue

        canonical = canonical_stage(stage_name)
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

        started_at = _valid_epoch(parse_epoch(start_val))
        ended_at = _valid_epoch(parse_epoch(end_val))

        if started_at:
            stage_start_times.append(started_at)
        if ended_at:
            stage_end_times.append(ended_at)

        stage_data = {}
        if started_at:
            stage_data["started_at"] = started_at.isoformat()
        if ended_at:
            stage_data["ended_at"] = ended_at.isoformat()

        if stage_data:
            extra["stages"][canonical] = stage_data

    # -------------------------
    # Authoritative cycle times
    # -------------------------

    # Start: prefer chargstart, fallback to earliest stage start
    cycle_started_at = _valid_epoch(parse_epoch(xml.get("chargstart")))

    # End: prefer chargende (authoritative)
    cycle_ended_at = _valid_epoch(parse_epoch(xml.get("chargende")))

    # Fallback 1: latest stageChange:*
    if not cycle_ended_at:
        stage_changes: List[datetime] = []
        for key, val in xml.items():
            if key.startswith("stageChange:"):
                ts = _valid_epoch(parse_epoch(val))
                if ts:
                    stage_changes.append(ts)

        if stage_changes:
            cycle_ended_at = max(stage_changes)

    # Fallback 2: stage end times (least reliable)
    started_at = cycle_started_at or (
        min(stage_start_times) if stage_start_times else None
    )

    ended_at = cycle_ended_at or (
        max(stage_end_times) if stage_end_times else None
    )

    # -------------------------
    # Duration
    # -------------------------

    duration_sec = None
    if started_at and ended_at and ended_at > started_at:
        duration_sec = int((ended_at - started_at).total_seconds())

    # -------------------------
    # Insert washer_cycles
    # -------------------------

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

    # -------------------------
    # Mark upload parsed
    # -------------------------

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
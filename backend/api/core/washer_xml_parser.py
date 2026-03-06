import re
import json
from datetime import datetime, timezone
from typing import Dict


_SIMPLE_KV_PATTERN = re.compile(
    r"<string>(?P<key>[^<]+)</string>\s*<[^>]+>(?P<value>[^<]+)</[^>]+>",
    re.IGNORECASE,
)

_DATE_KV_PATTERN = re.compile(
    r"<string>(?P<key>[^<]+)</string>.*?<long>(?P<value>-?\d+)</long>",
    re.IGNORECASE | re.DOTALL,
)


def _extract_xml_map(xml_path: str) -> Dict[str, str]:
    with open(xml_path, "rb") as f:
        raw = f.read()

    text = raw.decode("utf-8", errors="ignore")
    data: Dict[str, str] = {}

    for m in _SIMPLE_KV_PATTERN.finditer(text):
        data[m.group("key")] = m.group("value")

    for m in _DATE_KV_PATTERN.finditer(text):
        data[m.group("key")] = m.group("value")

    return data


def _parse_epoch(value):
    try:
        value = int(value)
        if value <= 0:
            return None
        if value < 10_000_000_000:
            return datetime.fromtimestamp(value, tz=timezone.utc)
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    except Exception:
        return None


def _first_present(xml: Dict[str, str], *keys):
    for k in keys:
        if k in xml and xml.get(k) not in ("", None):
            return xml.get(k)
    return None


def _parse_result(xml: Dict[str, str], xml_path: str):
    val = xml.get("res", "").lower()
    if val == "true":
        return True
    if val == "false":
        return False
    if xml_path.endswith("+.xml"):
        return True
    if xml_path.endswith("-.xml"):
        return False
    return None


def _canonical_stage(name: str):
    n = name.lower()
    if "pre" in n:
        return "pre_wash"
    if "wash" in n:
        return "wash"
    if "rinse" in n:
        return "rinse"
    if "disinfect" in n:
        return "disinfection"
    if "dry" in n:
        return "drying"
    return None


# --------------------------------------------------
# PARSER
# --------------------------------------------------

def parse_washer_xml_phase1(
    conn,
    upload_id: int,
    xml_path: str,
    environment_id: int,
    machine_id: int,
):
    cur = conn.cursor()
    xml = _extract_xml_map(xml_path)

    try:
        cycle_number = int(xml.get("chargnr"))
    except Exception:
        cycle_number = None

    program_name = xml.get("programmname")

    try:
        program_number = int(xml.get("programNo"))
    except Exception:
        program_number = None

    result = _parse_result(xml, xml_path)

    extra = {"stages": {}}
    stage_start_times = []
    stage_end_times = []

    for stage_idx in range(0, 6):
        stage_name = xml.get(f"wiStageName:{stage_idx}")
        if not stage_name:
            continue

        canonical = _canonical_stage(stage_name)
        if not canonical:
            continue

        start_val = _first_present(
            xml,
            f"wiStage1Start:{stage_idx}",
            f"wiStageStart:{stage_idx}",
        )
        end_val = _first_present(
            xml,
            f"wiStage1End:{stage_idx}",
            f"wiStageEnd:{stage_idx}",
        )

        stage_started_at = _parse_epoch(start_val)
        stage_ended_at = _parse_epoch(end_val)

        if stage_started_at:
            stage_start_times.append(stage_started_at)
        if stage_ended_at:
            stage_end_times.append(stage_ended_at)

        # ✅ EXPANDED temperature keys
        temp_val = _first_present(
            xml,
            f"wiStageSetTemp:{stage_idx}",
            f"wiStageTempMax:{stage_idx}",
            f"wiStageTempMean:{stage_idx}",
            f"wiTempMax:{stage_idx}",
            f"wiTempMean:{stage_idx}",
            f"wiTemp:{stage_idx}",
            f"wiStageTemperature:{stage_idx}",
            f"wiDisTemp:{stage_idx}",
        )

        try:
            temperature_c = int(float(temp_val)) if temp_val is not None else None
        except Exception:
            temperature_c = None

        stage_data = {}

        if stage_started_at:
            stage_data["started_at"] = stage_started_at.isoformat()
        if stage_ended_at:
            stage_data["ended_at"] = stage_ended_at.isoformat()
        if temperature_c is not None:
            stage_data["temperature_c"] = temperature_c

        if stage_data:
            extra["stages"][canonical] = stage_data

    started_at = min(stage_start_times) if stage_start_times else None
    ended_at = max(stage_end_times) if stage_end_times else None

    duration_sec = None
    if started_at and ended_at and ended_at > started_at:
        duration_sec = int((ended_at - started_at).total_seconds())

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
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (machine_id, cycle_number) DO NOTHING
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
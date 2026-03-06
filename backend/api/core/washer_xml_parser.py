import re
from datetime import datetime, timezone
from typing import Dict


# --------------------------------------------------
# XML extraction helpers
# --------------------------------------------------

_SIMPLE_KV_PATTERN = re.compile(
    r"<string>(?P<key>[^<]+)</string>\s*<[^>]+>(?P<value>[^<]+)</[^>]+>",
    re.IGNORECASE,
)

_DATE_PATTERN_TEMPLATE = (
    r"<string>{key}</string>.*?<long>(?P<value>\d+)</long>"
)


def _extract_xml_map(xml_path: str) -> Dict[str, str]:
    """
    Extract key/value pairs from Java XMLDecoder washer files.

    Strategy:
      - Regex-based (intentionally)
      - UTF-safe (bytes + ignore errors)
      - Handles:
          * simple values (string/int/boolean)
          * nested date values (epoch millis in <long>)
    """

    with open(xml_path, "rb") as f:
        raw = f.read()

    text = raw.decode("utf-8", errors="ignore")
    data: Dict[str, str] = {}

    # ----------------------------------------------
    # 1) Simple direct values (res, programNo, etc.)
    # ----------------------------------------------
    for match in _SIMPLE_KV_PATTERN.finditer(text):
        data[match.group("key")] = match.group("value")

    # ----------------------------------------------
    # 2) Date fields (nested <long>)
    # ----------------------------------------------
    for key in ("datum", "chargende"):
        pattern = re.compile(
            _DATE_PATTERN_TEMPLATE.format(key=key),
            re.IGNORECASE | re.DOTALL,
        )
        m = pattern.search(text)
        if m:
            data[key] = m.group("value")

    return data


# --------------------------------------------------
# Phase 1 parser
# --------------------------------------------------

def parse_washer_xml_phase1(
    conn,
    upload_id: int,
    xml_path: str,
    environment_id: int,
    machine_id: int,
):
    """
    PHASE 1 — STABLE + EXTENDED

    Parses:
      - cycle_number
      - program_name
      - program_number
      - started_at
      - ended_at
      - duration_sec
      - result (BOOLEAN)

    NO commits.
    NO rollbacks.
    """

    cur = conn.cursor()
    xml = _extract_xml_map(xml_path)

    # --------------------------------------------------
    # Cycle number
    # --------------------------------------------------
    cycle_number = None
    try:
        cycle_number = int(xml["chargnr"])
    except Exception:
        pass

    # --------------------------------------------------
    # Program
    # --------------------------------------------------
    program_name = xml.get("programmname")

    program_number = None
    try:
        program_number = int(xml["programNo"])
    except Exception:
        pass

    # --------------------------------------------------
    # Start / End times
    # --------------------------------------------------
    started_at = None
    ended_at = None

    try:
        started_at = datetime.fromtimestamp(
            int(xml["datum"]) / 1000,
            tz=timezone.utc,
        )
    except Exception:
        pass

    try:
        ended_at = datetime.fromtimestamp(
            int(xml["chargende"]) / 1000,
            tz=timezone.utc,
        )
    except Exception:
        pass

    duration_sec = None
    if started_at and ended_at:
        duration_sec = int((ended_at - started_at).total_seconds())

    # --------------------------------------------------
    # Result (BOOLEAN)
    # --------------------------------------------------
    result = None
    val = xml.get("res", "").lower()
    if val == "true":
        result = True
    elif val == "false":
        result = False

    # --------------------------------------------------
    # Insert
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
            result
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
        ),
    )

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
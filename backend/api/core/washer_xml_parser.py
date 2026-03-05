import json
import re
from datetime import datetime, timezone
from typing import Dict


# --------------------------------------------------
# Low-level XML map extraction (encoding-safe)
# --------------------------------------------------
def _extract_xml_map(xml_path: str) -> Dict[str, str]:
    """
    Extracts key/value pairs from Java XMLDecoder-style XML
    without relying on an XML parser (encoding-safe).
    """

    # Read as raw bytes to avoid encoding issues (UTF-16, BOM, etc.)
    with open(xml_path, "rb") as f:
        raw = f.read()

    # Decode as UTF-8 *ignoring errors*
    # This is safe for numeric + ASCII keys we care about
    text = raw.decode("utf-8", errors="ignore")

    data: Dict[str, str] = {}

    # Matches:
    # <string>key</string> <int>123</int>
    # <string>key</string> <string>value</string>
    pattern = re.compile(
        r"<string>(?P<key>[^<]+)</string>\s*<[^>]+>(?P<value>[^<]+)</[^>]+>",
        re.IGNORECASE,
    )

    for match in pattern.finditer(text):
        key = match.group("key").strip()
        value = match.group("value").strip()
        data[key] = value

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
    Phase 1 washer XML parsing:
    - cycle number
    - program name
    - program number
    - started_at
    """

    cur = conn.cursor()

    try:
        xml_data = _extract_xml_map(xml_path)

        # Core fields
        cycle_number = int(xml_data["chargnr"]) if "chargnr" in xml_data else None
        program_name = xml_data.get("programmname")
        program_number = int(xml_data["programNo"]) if "programNo" in xml_data else None

        started_at = None
        if "datum" in xml_data:
            started_at = datetime.fromtimestamp(
                int(xml_data["datum"]) / 1000,
                tz=timezone.utc,
            )

        extra = {
            "swVersion": xml_data.get("swVersion"),
            "fabriknr": xml_data.get("fabriknr"),
            "model": xml_data.get("footermiddle"),
        }

        # Insert cycle
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
                extra
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                environment_id,
                machine_id,
                upload_id,
                cycle_number,
                program_name,
                program_number,
                started_at,
                json.dumps(extra),
            ),
        )

        # Mark upload as parsed
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

        conn.commit()

    except Exception as e:
        conn.rollback()

        # Record error but DO NOT crash upload
        cur.execute(
            """
            UPDATE washer_xml_uploads
            SET parse_status = 'error',
                parse_error = %s
            WHERE id = %s
            """,
            (str(e), upload_id),
        )
        conn.commit()

        # Re-raise so caller can log (but route already catches this)
        raise
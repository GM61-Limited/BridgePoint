from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

def _safe_float(value: Optional[str]) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Optional[str]) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_xml_bytes(xml_bytes: bytes) -> bytes:
    """
    Remove bad XML encoding declarations (common in MMM XML).
    """
    text = xml_bytes.decode("utf-8", errors="ignore")
    text = re.sub(r'^<\?xml[^>]*\?>', '', text).lstrip()
    return text.encode("utf-8")


def _map_oem_label_to_sensor_type(label: str) -> Optional[str]:
    label = label.strip()

    if label == "A0" or label.startswith("A₀"):
        return "a0"
    if label.startswith("B25-1") or label == "B251":
        return "temperature_1"
    if label.startswith("B25-2") or label == "B252":
        return "temperature_2"
    if label.startswith("B35"):
        return "pressure"
    if label.startswith("B55"):
        return "conductivity"

    return None


# ---------------------------------------------------------------------
# Core XML Parsing
# ---------------------------------------------------------------------

def parse_process_signals_from_xml(xml_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Parse MMM XML and return index-aligned telemetry rows.
    """

    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        root = ET.fromstring(_normalize_xml_bytes(xml_bytes))

    # --------------------------------------------------
    # STEP 1: sensorID index -> OEM label
    # --------------------------------------------------

    sensor_map: Dict[int, str] = {}

    for void in root.findall(".//void"):
        string_elem = void.find("string")
        if string_elem is None:
            continue

        key = string_elem.text or ""
        if not key.startswith("sensorID:"):
            continue

        idx = _safe_int(key.split("sensorID:")[-1])
        value_strings = void.findall("string")
        label = value_strings[-1].text if value_strings else None

        if idx is not None and label:
            sensor_map[idx] = label.strip()

    if not sensor_map:
        return []

    # --------------------------------------------------
    # STEP 2: Extract all java.util.ArrayList blocks
    # --------------------------------------------------

    arrays: List[List[Any]] = []
    array_kinds: List[str] = []

    for obj in root.findall(".//object"):
        if obj.attrib.get("class") != "java.util.ArrayList":
            continue

        values: List[Any] = []
        is_time_array = False

        for void in obj.findall("void"):
            if void.attrib.get("method") != "add":
                continue

            value_obj = void.find("object")
            if value_obj is None:
                continue

            # Time array (GregorianCalendar)
            if value_obj.attrib.get("class") == "java.util.GregorianCalendar":
                is_time_array = True
                long_elem = value_obj.find(".//long")
                values.append(_safe_int(long_elem.text) if long_elem is not None else None)
                continue

            # Numeric wrappers
            if (d := value_obj.find("double")) is not None:
                values.append(_safe_float(d.text))
            elif (i := value_obj.find("int")) is not None:
                values.append(_safe_int(i.text))
            else:
                values.append(None)

        if values:
            arrays.append(values)
            array_kinds.append("time" if is_time_array else "data")

    if "time" not in array_kinds:
        return []

    # --------------------------------------------------
    # STEP 3: Align time + sensors
    # --------------------------------------------------

    time_idx = array_kinds.index("time")
    time_series = arrays[time_idx]

    # Sensors follow the time array in MMM ordering
    sensor_arrays = arrays[time_idx + 1 : time_idx + 1 + len(sensor_map) - 1]

    rows: List[Dict[str, Any]] = []

    for i, ts_ms in enumerate(time_series):
        if ts_ms is None:
            continue

        row = {
            "timestamp": datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc),
            "t_index": i,
            "values": {},
        }

        for offset, series in enumerate(sensor_arrays, start=1):
            if i >= len(series):
                continue

            value = series[i]
            if value is None:
                continue

            label = sensor_map.get(offset)
            if not label:
                continue

            sensor_type = _map_oem_label_to_sensor_type(label)
            if not sensor_type:
                continue

            row["values"][sensor_type] = value

        if row["values"]:
            rows.append(row)

    return rows


# ---------------------------------------------------------------------
# Database Insert Helper
# ---------------------------------------------------------------------

def insert_process_signals(
    conn,
    cycle_id: int,
    signals: List[Dict[str, Any]],
):
    if not signals:
        return

    with conn.cursor() as cur:
        cur.execute("SELECT id, code FROM sensor_types")
        sensor_type_map = {code: sid for sid, code in cur.fetchall()}

    with conn.cursor() as cur:
        for row in signals:
            t_sec = row["t_index"]

            for sensor_code, value in row["values"].items():
                sensor_type_id = sensor_type_map.get(sensor_code)
                if not sensor_type_id:
                    continue

                cur.execute(
                    """
                    INSERT INTO washer_cycle_points (
                        cycle_id,
                        sensor_type_id,
                        t_sec,
                        value
                    )
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        cycle_id,
                        sensor_type_id,
                        t_sec,
                        value,
                    ),
                )
"""
process_signals.py

Extracts true process signal time-series data from MMM washer XML files.

Writes to washer_cycle_points using the normalized schema:
- cycle_id
- sensor_type_id
- t_sec (sample index, NOT wall-clock seconds)
- value

Physical sensor mapping (LOSSLESS):
- B25-1 -> temperature_1
- B25-2 -> temperature_2
- B35*  -> pressure
- B55*  -> conductivity
- A0    -> a0
"""

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
    """
    Map MMM OEM sensor labels to *physical* sensor_types.code values.
    """
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

    IMPORTANT:
    - MMM uses ONE shared Time array (sensorID:0)
    - All sensor arrays align by index
    - Arrays may contain None values
    """

    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        root = ET.fromstring(_normalize_xml_bytes(xml_bytes))

    # --------------------------------------------------
    # STEP 1: Map sensorID index -> OEM label
    # --------------------------------------------------

    sensor_map: Dict[int, str] = {}

    for void in root.findall(".//void"):
        string_elem = void.find("string")
        if string_elem is None:
            continue

        text = string_elem.text or ""
        if not text.startswith("sensorID:"):
            continue

        idx = _safe_int(text.split("sensorID:")[-1])
        strings = void.findall("string")
        label = strings[-1].text if strings else None

        if idx is not None and label:
            sensor_map[idx] = label.strip()

    # --------------------------------------------------
    # STEP 2: Collect ALL ArrayLists with their raw objects
    # --------------------------------------------------

    all_arrays: List[List[Any]] = []
    array_types: List[str] = []

    for obj in root.findall(".//object"):
        class_elem = obj.find("class")
        if class_elem is None or class_elem.text != "java.util.ArrayList":
            continue

        values: List[Any] = []
        contains_calendar = False

        for void in obj.findall("void"):
            if void.findtext("method") != "add":
                continue

            value_obj = void.find("object")
            if value_obj is None:
                continue

            if value_obj.find(".//class") is not None and \
               value_obj.findtext(".//class") == "java.util.GregorianCalendar":
                contains_calendar = True
                long_val = value_obj.find(".//long")
                values.append(_safe_int(long_val.text) if long_val is not None else None)

            elif (v := value_obj.find("double")) is not None:
                values.append(_safe_float(v.text))
            elif (v := value_obj.find("int")) is not None:
                values.append(_safe_int(v.text))
            else:
                values.append(None)

        if values:
            all_arrays.append(values)
            array_types.append("time" if contains_calendar else "data")

    # --------------------------------------------------
    # STEP 3: Locate the telemetry block
    # --------------------------------------------------

    try:
        time_idx = array_types.index("time")
    except ValueError:
        return []

    time_series = all_arrays[time_idx]
    sensor_arrays = all_arrays[time_idx + 1 : time_idx + 1 + len(sensor_map) - 1]

    # --------------------------------------------------
    # STEP 4: Index-align samples
    # --------------------------------------------------

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

            xml_label = sensor_map.get(offset)
            if not xml_label:
                continue

            sensor_type = _map_oem_label_to_sensor_type(xml_label)
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
    """
    Insert parsed process signals into washer_cycle_points.
    """

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
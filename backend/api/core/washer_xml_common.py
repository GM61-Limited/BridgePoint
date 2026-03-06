# app/core/washer_xml_common.py

import re
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


def extract_xml_map(xml_path: str) -> Dict[str, str]:
    with open(xml_path, "rb") as f:
        raw = f.read()

    text = raw.decode("utf-8", errors="ignore")
    data: Dict[str, str] = {}

    for m in _SIMPLE_KV_PATTERN.finditer(text):
        data[m.group("key")] = m.group("value")

    for m in _DATE_KV_PATTERN.finditer(text):
        data[m.group("key")] = m.group("value")

    return data


def parse_epoch(value):
    try:
        value = int(value)
        if value <= 0:
            return None
        if value < 10_000_000_000:
            return datetime.fromtimestamp(value, tz=timezone.utc)
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    except Exception:
        return None


def first_present(xml: Dict[str, str], *keys):
    for k in keys:
        if k in xml and xml.get(k) not in ("", None):
            return xml.get(k)
    return None


def parse_result(xml: Dict[str, str], xml_path: str):
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


def canonical_stage(name: str):
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
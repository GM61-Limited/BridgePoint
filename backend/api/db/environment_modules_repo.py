# app/db/environment_modules_repo.py

from __future__ import annotations

from typing import Dict, List, Tuple, Iterable, Optional


# Canonical module keys (keep aligned with frontend + init.sql seeds)
ALLOWED_MODULE_KEYS = {
    "machine-monitoring",
    "finance",
    "integration-hub",
    "tray-archive",
    "analytics",
}

# Default enablement (keep aligned with init.sql and frontend defaults)
DEFAULT_MODULES: Dict[str, bool] = {
    "machine-monitoring": True,
    "finance": False,
    "integration-hub": False,
    "tray-archive": False,
    "analytics": False,
}


def _rows_to_list(rows: Iterable[Tuple[str, bool]]) -> List[Dict[str, object]]:
    return [{"key": str(k), "enabled": bool(v)} for (k, v) in rows]


def get_environment_modules(conn, environment_id: int) -> List[Dict[str, object]]:
    """
    Fetch module flags for the given environment_id.
    Returns: [{"key": "...", "enabled": true/false}, ...]
    """
    if environment_id is None:
        raise ValueError("environment_id is required")

    sql = """
        SELECT module_key, enabled
        FROM environment_modules
        WHERE environment_id = %(env_id)s
        ORDER BY module_key
    """

    with conn.cursor() as cur:
        cur.execute(sql, {"env_id": environment_id})
        rows = cur.fetchall() or []
    return _rows_to_list(rows)


def ensure_defaults_exist(conn, environment_id: int) -> None:
    """
    Ensure every allowed module key has a row for this environment.
    Inserts missing rows only (safe to call on GET).
    """
    existing = get_environment_modules(conn, environment_id)
    existing_keys = {r["key"] for r in existing}

    missing = [k for k in ALLOWED_MODULE_KEYS if k not in existing_keys]
    if not missing:
        return

    sql = """
        INSERT INTO environment_modules (environment_id, module_key, enabled, updated_at)
        VALUES (%(env_id)s, %(key)s, %(enabled)s, NOW())
        ON CONFLICT (environment_id, module_key) DO NOTHING
    """

    with conn.cursor() as cur:
        for key in missing:
            cur.execute(
                sql,
                {
                    "env_id": environment_id,
                    "key": key,
                    "enabled": bool(DEFAULT_MODULES.get(key, False)),
                },
            )

    conn.commit()


def upsert_environment_modules(
    conn,
    environment_id: int,
    modules: List[Dict[str, object]],
    *,
    validate_keys: bool = True,
) -> List[Dict[str, object]]:
    """
    Upsert module flags for an environment.
    Input: [{"key": "...", "enabled": true/false}, ...]
    Returns current rows from DB after save.
    """
    if environment_id is None:
        raise ValueError("environment_id is required")
    if modules is None:
        modules = []

    # Normalise + validate + dedupe (last wins)
    dedup: Dict[str, bool] = {}
    for m in modules:
        key = str(m.get("key", "")).strip()
        if not key:
            continue
        if validate_keys and key not in ALLOWED_MODULE_KEYS:
            raise ValueError(f"Unknown module key: {key}")
        dedup[key] = bool(m.get("enabled", False))

    if not dedup:
        # No changes requested; just return stable view
        ensure_defaults_exist(conn, environment_id)
        return get_environment_modules(conn, environment_id)

    sql = """
        INSERT INTO environment_modules (environment_id, module_key, enabled, updated_at)
        VALUES (%(env_id)s, %(key)s, %(enabled)s, NOW())
        ON CONFLICT (environment_id, module_key)
        DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
    """

    with conn.cursor() as cur:
        for key, enabled in dedup.items():
            cur.execute(sql, {"env_id": environment_id, "key": key, "enabled": enabled})

    conn.commit()

    # Make sure all keys exist so response is stable
    ensure_defaults_exist(conn, environment_id)
    return get_environment_modules(conn, environment_id)
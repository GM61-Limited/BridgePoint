# app/main.py
import os
import logging
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

# Existing routers
from app.api.v1.auth_routes import router as auth_router
from app.api.v1.me_routes import router as me_router
from app.api.v1.admin_routes import router as admin_router

# SQL Connections router (list/test/query external Postgres using params from sql_connections)
from app.api.v1.sql_connections_routes import router as sql_connections_router

# Modules router (environment module enablement)
from app.api.v1.modules_routes import router as modules_router

# Lookups + Machines routers
from app.api.v1.lookup_routes import router as lookup_router
from app.api.v1.machine_routes import router as machine_router

from app.api.v1.washer_cycles_routes import router as washer_cycles_router

# ✅ Maintenance router
from app.api.v1.maintenance_routes import router as maintenance_router

# (Optional) if you later add the connectors module and want to expose those routes too:
# from app.api.v1.connectors_routes import router as connectors_router


log = logging.getLogger("bridgepoint")


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_env_first(*keys: str, default: str | None = None) -> str | None:
    """
    Return the first non-empty env var found from keys.
    """
    for k in keys:
        v = os.getenv(k)
        if v is not None and str(v).strip() != "":
            return str(v).strip()
    return default


# App metadata (used in FastAPI docs and /version endpoint)
APP_VERSION = _get_env_first("APP_VERSION", "VERSION", default="unknown")
GIT_SHA = _get_env_first("GIT_SHA", "COMMIT_SHA", default=None)
BUILD_TIME = _get_env_first("BUILD_TIME", "BUILT_AT", default=None)

# Azure Container Apps runtime metadata (these are injected by the platform)
CONTAINER_APP_NAME = _get_env_first("CONTAINER_APP_NAME", default=None)
CONTAINER_APP_REVISION = _get_env_first("CONTAINER_APP_REVISION", default=None)


app = FastAPI(
    title=settings.APP_NAME,
    version=APP_VERSION,
    root_path=settings.ROOT_PATH,
)

# -------------------------
# CORS
# -------------------------
app.add_middleware(
    CORSMiddleware,
    # ✅ settings.ALLOWED_ORIGINS is now a string (CSV or JSON); this property returns list[str]
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# -------------------------
# Startup log (helps a TON in cloud diagnostics)
# -------------------------
@app.on_event("startup")
def _startup_log():
    log.info(
        "BridgePoint starting | version=%s commit=%s buildTime=%s containerApp=%s revision=%s",
        APP_VERSION,
        (GIT_SHA[:12] if GIT_SHA else None),
        BUILD_TIME,
        CONTAINER_APP_NAME,
        CONTAINER_APP_REVISION,
    )

# -------------------------
# Health / hello
# -------------------------
@app.get("/health")
def health():
    return {"ok": True, "time": "up"}


@app.get("/hello")
def hello_world():
    return {"message": "Hello World From GM61 BridgePoint!"}


# -------------------------
# App version metadata for Settings "About BridgePoint"
# -------------------------
@app.get("/version")
def version():
    """
    Simple metadata endpoint consumed by the Settings UI.
    Keep keys stable: version, commit, buildTime.
    """
    return {
        "version": APP_VERSION,
        "commit": GIT_SHA,
        "buildTime": BUILD_TIME,
        # Extra diagnostics (safe additions; frontend ignores unknown keys)
        "appName": settings.APP_NAME,
        "containerApp": CONTAINER_APP_NAME,
        "revision": CONTAINER_APP_REVISION,
        "reportedAt": _iso_now(),
    }


# -------------------------
# API routes
# -------------------------
app.include_router(auth_router)
app.include_router(me_router)
app.include_router(admin_router)

# Register SQL Connections API
app.include_router(sql_connections_router)

# Register Modules API
app.include_router(modules_router)

# Register Lookups + Machines APIs
app.include_router(lookup_router)
app.include_router(machine_router)

app.include_router(washer_cycles_router)

# ✅ Register Maintenance API
app.include_router(maintenance_router)

# ✅ Register Audit Logs API (safe optional import so backend never fails to boot)
try:
    from app.api.v1.audit_logs_routes import router as audit_logs_router
    app.include_router(audit_logs_router)
    log.info("Audit Logs API enabled: /api/v1/audit-logs")
except Exception as e:
    # IMPORTANT: don't crash the entire backend if audit logs file isn't present in the image yet
    log.warning("Audit Logs API NOT enabled (audit_logs_routes missing or failed to import): %s", e)

# ✅ Register Uploads API (safe optional import so backend never fails to boot)
try:
    from app.api.v1.uploads_routes import router as uploads_router
    app.include_router(uploads_router)
    log.info("Uploads API enabled: /v1/uploads/*")
except Exception as e:
    # IMPORTANT: don't crash the entire backend if uploads file isn't present in the image yet
    log.warning("Uploads API NOT enabled (uploads_routes missing or failed to import): %s", e)

# (Optional) if you add the connectors routes:
# app.include_router(connectors_router)
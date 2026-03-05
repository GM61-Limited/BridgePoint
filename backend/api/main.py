# app/main.py
import os
import logging

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

# (Optional) if you later add the connectors module and want to expose those routes too:
# from app.api.v1.connectors_routes import router as connectors_router


log = logging.getLogger("bridgepoint")


app = FastAPI(
    title=settings.APP_NAME,
    version=os.getenv("APP_VERSION", "unknown"),
)

# -------------------------
# CORS
# -------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.ALLOWED_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
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
# Optional: App version metadata for Settings "About BridgePoint"
# -------------------------
@app.get("/version")
def version():
    return {
        "version": os.getenv("APP_VERSION", "unknown"),
        "commit": os.getenv("GIT_SHA"),
        "buildTime": os.getenv("BUILD_TIME"),
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

# ✅ Register Uploads API (safe optional import so backend never fails to boot)
try:
    # ✅ Register Uploads API (fail fast in dev so we don't silently ship 404s)
    from app.api.v1.uploads_routes import router as uploads_router
    app.include_router(uploads_router)
    log.info("Uploads API enabled: /v1/uploads/*")
except Exception as e:
    # IMPORTANT: don't crash the entire backend if uploads file isn't present in the image yet
    log.warning("Uploads API NOT enabled (uploads_routes missing or failed to import): %s", e)

# (Optional) if you add the connectors routes:
# app.include_router(connectors_router)


# ----------------------------------------------------------------------
# OPTIONAL: If you want the app to ensure certain tables exist on startup
# (useful only if you add app/db/migrations_connectors.py later),
# you can uncomment this block and provide the engine + migration helper.
# ----------------------------------------------------------------------
# from app.db.connection import engine  # AsyncEngine
# from app.db.migrations_connectors import ensure_connectors_schema
#
# @app.on_event("startup")
# async def startup():
#     async with engine.begin() as conn:
#         await ensure_connectors_schema(conn)
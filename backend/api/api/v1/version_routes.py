from fastapi import APIRouter
import os
from datetime import datetime, timezone

router = APIRouter(tags=["meta"])

def _iso_now():
    return datetime.now(timezone.utc).isoformat()

@router.get("/version")
def version():
    """
    Returns build metadata for diagnostics UI.
    Values are injected via environment variables at deploy time.
    """
    app_version = os.getenv("APP_VERSION") or os.getenv("VERSION") or "unknown"
    commit = os.getenv("GIT_SHA") or os.getenv("COMMIT_SHA")
    build_time = os.getenv("BUILD_TIME") or os.getenv("BUILT_AT")

    # Helpful Container Apps runtime metadata (optional)
    container_app = os.getenv("CONTAINER_APP_NAME")
    revision = os.getenv("CONTAINER_APP_REVISION")

    return {
        "version": app_version,
        "commit": commit,
        "buildTime": build_time,
        "containerApp": container_app,
        "revision": revision,
        "reportedAt": _iso_now(),
    }
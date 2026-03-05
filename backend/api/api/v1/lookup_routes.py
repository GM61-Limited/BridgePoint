# backend/api/api/v1/lookup_routes.py
from __future__ import annotations

from fastapi import APIRouter

from app.db.lookups_repo import get_machine_types, get_integration_profiles

router = APIRouter(prefix="/v1/lookups", tags=["Lookups"])


@router.get("/machine-types")
def list_machine_types():
    return {"items": get_machine_types()}


@router.get("/integration-profiles")
def list_integration_profiles():
    return {"items": get_integration_profiles()}
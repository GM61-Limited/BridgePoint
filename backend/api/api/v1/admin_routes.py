
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.auth import get_current_username, get_env_id
from app.db.users_repo import list_users
from app.db.env_repo import fetch_environment

router = APIRouter(tags=["admin"])

class EnvironmentResponse(BaseModel):
  id: int
  name: str
  domain: str

@router.get("/users")
def get_users(_: str = Depends(get_current_username)):
  return {"users": list_users()}

@router.get("/environment", response_model=EnvironmentResponse)
def get_environment(env_id: int = Depends(get_env_id)):
  env = fetch_environment(env_id)
  if not env:
    raise HTTPException(status_code=404, detail="Environment not found")
  return EnvironmentResponse(id=int(env["id"]), name=str(env["name"]), domain=str(env["domain"]))

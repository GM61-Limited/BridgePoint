
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.auth import get_current_username
from app.db.users_repo import fetch_user_profile

router = APIRouter(tags=["me"])

class MeResponse(BaseModel):
    name: str
    roles: list[str] = []
    environment_id: int

@router.get("/me", response_model=MeResponse)
def me(username: str = Depends(get_current_username)):
    row = fetch_user_profile(username)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return MeResponse(
        name=row["username"],
        roles=[row["role"]] if row.get("role") else [],
        environment_id=int(row["environment_id"]),
    )

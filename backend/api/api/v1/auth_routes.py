
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import timedelta
from app.core.security import create_access_token, verify_password
from app.core.config import settings
from app.db.users_repo import fetch_login_user

router = APIRouter(tags=["auth"])

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    environment_id: int | None = None

@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest):
    user = fetch_login_user(data.username)
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(
        data={"sub": user["username"], "env_id": user["environment_id"]},
        expires=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": token, "token_type": "bearer", "environment_id": int(user["environment_id"])}

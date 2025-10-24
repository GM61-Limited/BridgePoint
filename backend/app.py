from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
from fastapi.security import OAuth2PasswordBearer
import jwt

app = FastAPI(title="FinanceModule Backend API")

# Allow frontend to talk to backend (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change this later to your frontend domain for security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Sample hardcoded data ---
users = {
    "admin": {"password": "admin", "role": "Administrator", "company": "GM61 Limited"},
    "user": {"password": "password", "role": "User", "company": "IHSS Limited"}
}

mock_data = [
    {"customer": "Acme Ltd", "amount": 1200, "status": "Billed"},
    {"customer": "BetaCorp", "amount": 950, "status": "Pending"},
    {"customer": "Delta Industries", "amount": 720, "status": "Paid"},
]

# --- Test route ---
@app.get("/hello")
def hello_world():
    return {"message": "Hello World From GM61 BridgePoint!"}

# --- JWT Config ---
SECRET_KEY = "your_secret_key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# --- Pydantic models ---
class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

# --- Helper functions ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta if expires_delta else timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None or username not in users:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# --- Routes ---
@app.post("/login", response_model=TokenResponse)
def login(data: LoginRequest):
    username = data.username
    password = data.password    
    if username in users and users[username]["password"] == password:
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": username}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}
    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")

@app.get("/data")
def get_data(token: str = Depends(oauth2_scheme)):
    username = verify_token(token)
    return {"records": mock_data}
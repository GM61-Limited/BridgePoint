from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
from fastapi.security import OAuth2PasswordBearer
import jwt
import psycopg2
import psycopg2.extras
import bcrypt

app = FastAPI(title="FinanceModule Backend API")

# Allow frontend to talk to backend (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change this later to your frontend domain for security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

class EnvironmentResponse(BaseModel):
    id: int
    name: str
    domain: str

import os

# --- Database config ---
DB_HOST = os.environ.get("DB_HOST", "database")
DB_PORT = int(os.environ.get("DB_PORT", 5432))
DB_NAME = os.environ.get("DB_NAME", "bridgepointbd")
DB_USER = os.environ.get("DB_USER", "gm61admin")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "camioninsta")

def get_db_connection():
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    return conn

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
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        # Check user exists in DB
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute("SELECT username FROM users WHERE username = %s", (username,))
        user = cur.fetchone()
        cur.close()
        conn.close()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_env_id_from_token(token: str) -> int:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        env_id = payload.get("env_id")
        if env_id is None:
            raise HTTPException(status_code=401, detail="Invalid token: environment ID missing")
        return env_id
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# --- Routes ---
@app.get("/hello")
def hello_world():
    return {"message": "Hello World From GM61 BridgePoint!"}

@app.post("/login", response_model=TokenResponse)
def login(data: LoginRequest):
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute("SELECT username, password_hash, environment_id FROM users WHERE username = %s", (data.username,))
        user = cur.fetchone()
        cur.close()
        conn.close()

        if user and bcrypt.checkpw(data.password.encode('utf-8'), user["password_hash"].encode('utf-8')):
            access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = create_access_token(
                data={"sub": user["username"], "env_id": user["environment_id"]},
                expires_delta=access_token_expires
            )
            return {"access_token": access_token, "token_type": "bearer", "environment_id": user["environment_id"]}
        else:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/users")
def get_users(token: str = Depends(oauth2_scheme)):
    verify_token(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("SELECT id, username, role, environment_id FROM users")
    users = cur.fetchall()
    cur.close()
    conn.close()
    return {"users": [dict(user) for user in users]}

@app.get("/environment", response_model=EnvironmentResponse)
def get_environment(token: str = Depends(oauth2_scheme)):
    env_id = get_env_id_from_token(token)
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute("SELECT id, name, domain FROM environment WHERE id = %s", (env_id,))
        environment = cur.fetchone()
        cur.close()
        conn.close()
        if not environment:
            raise HTTPException(status_code=404, detail="Environment not found")
        return EnvironmentResponse(id=environment["id"], name=environment["name"], domain=environment["domain"])
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
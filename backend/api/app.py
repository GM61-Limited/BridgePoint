
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi.security import OAuth2PasswordBearer
import jwt  # PyJWT
import psycopg2
import psycopg2.extras
import bcrypt
import os

app = FastAPI(title="FinanceModule Backend API")

# -------------------- CORS (safe for dev; same-origin via Nginx in prod) --------------------
# If you do need cross-origin during dev, set ALLOWED_ORIGINS env var, e.g.:
# ALLOWED_ORIGINS=http://localhost,http://127.0.0.1
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost,http://127.0.0.1") \
    .split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_credentials=True,  # allows cookies; safe with explicit origins
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# -------------------- JWT Config --------------------
# Use env var in production: SECRET_KEY="..."
SECRET_KEY = os.environ.get("SECRET_KEY", "your_secret_key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")  # matches /login

# -------------------- Pydantic models --------------------
class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    environment_id: Optional[int] = None  # include env id if you return it

class EnvironmentResponse(BaseModel):
    id: int
    name: str
    domain: str

class MeResponse(BaseModel):
    name: str
    roles: List[str] = []
    environment_id: int

# -------------------- Database config --------------------
DB_HOST = os.environ.get("DB_HOST", "database")
DB_PORT = int(os.environ.get("DB_PORT", 5432))
DB_NAME = os.environ.get("DB_NAME", "bridgepointdb")  # fixed default
DB_USER = os.environ.get("DB_USER", "gm61admin")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "camioninsta")

def get_db_connection():
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )
    return conn

# -------------------- Helper functions --------------------
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta if expires_delta else timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> str:
    """
    Returns the username (sub) if token is valid and user exists.
    Raises 401 if invalid.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: Optional[str] = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token (missing sub)")
        # Ensure user exists
        conn = get_db_connection()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute("SELECT username FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
        finally:
            if cur: cur.close()
            conn.close()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token (user not found)")
        return username
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_env_id_from_token(token: str) -> int:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        env_id = payload.get("env_id")
        if env_id is None:
            raise HTTPException(status_code=401, detail="Invalid token: environment ID missing")
        return int(env_id)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def get_user_by_username(username: str):
    """Return minimal user info needed by /me."""
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(
            "SELECT username, role, environment_id FROM users WHERE username = %s",
            (username,),
        )
        row = cur.fetchone()
        return row
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

# -------------------- Routes --------------------
@app.get("/health")
def health():
    return {"ok": True, "time": datetime.utcnow().isoformat()}

@app.get("/hello")
def hello_world():
    return {"message": "Hello World From GM61 BridgePoint!"}

@app.post("/login", response_model=TokenResponse)
def login(data: LoginRequest):
    try:
        conn = get_db_connection()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(
                "SELECT username, password_hash, environment_id FROM users WHERE username = %s",
                (data.username,),
            )
            user = cur.fetchone()
        finally:
            try:
                cur.close()
            except Exception:
                pass
            conn.close()

        if user and bcrypt.checkpw(data.password.encode("utf-8"),
                                   user["password_hash"].encode("utf-8")):
            access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = create_access_token(
                data={"sub": user["username"], "env_id": user["environment_id"]},
                expires_delta=access_token_expires,
            )
            # Include environment_id so client can consume it if needed
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "environment_id": int(user["environment_id"]),
            }
        else:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except Exception as e:
        # Log server-side for diagnosis; return a clean 500 to client
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/me", response_model=MeResponse)
def me(token: str = Depends(oauth2_scheme)):
    """
    Return current user profile derived from Authorization: Bearer <jwt>.
    """
    username = verify_token(token)
    row = get_user_by_username(username)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    return MeResponse(
        name=row["username"],
        roles=[row["role"]] if row["role"] else [],
        environment_id=int(row["environment_id"]),
    )

@app.get("/users")
def get_users(token: str = Depends(oauth2_scheme)):
    verify_token(token)
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute("SELECT id, username, role, environment_id FROM users")
        users = cur.fetchall()
        return {"users": [dict(user) for user in users]}
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

@app.get("/environment", response_model=EnvironmentResponse)
def get_environment(token: str = Depends(oauth2_scheme)):
    env_id = get_env_id_from_token(token)
    try:
        conn = get_db_connection()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute(
                "SELECT id, name, domain FROM environment WHERE id = %s",
                (env_id,),
            )
            environment = cur.fetchone()
        finally:
            try:
                cur.close()
            except Exception:
                pass
            conn.close()

        if not environment:
            raise HTTPException(status_code=404, detail="Environment not found")
        return EnvironmentResponse(
            id=int(environment["id"]),
            name=str(environment["name"]),
            domain=str(environment["domain"]),
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal server error")

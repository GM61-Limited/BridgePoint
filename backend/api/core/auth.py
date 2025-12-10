
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import psycopg2.extras
from app.core.security import decode_token
from app.db.connection import get_db_connection

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")  # matches /login

def get_current_username(token: str = Depends(oauth2_scheme)) -> str:
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token (missing sub)")
        # confirm user exists
        conn = get_db_connection()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            cur.execute("SELECT username FROM users WHERE username = %s", (sub,))
            if not cur.fetchone():
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token (user not found)")
        finally:
            try: cur.close()
            except Exception: pass
            conn.close()
        return sub
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

def get_env_id(token: str = Depends(oauth2_scheme)) -> int:
    try:
        payload = decode_token(token)
        env_id = payload.get("env_id")
        if env_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token: environment ID missing")
        return int(env_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

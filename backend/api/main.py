
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.auth_routes import router as auth_router
from app.api.v1.me_routes import router as me_router
from app.api.v1.admin_routes import router as admin_router

app = FastAPI(title=settings.APP_NAME)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.ALLOWED_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Health/hello
@app.get("/health")
def health(): return {"ok": True, "time": "up"}
@app.get("/hello")
def hello_world(): return {"message": "Hello World From GM61 BridgePoint!"}

# API v1
app.include_router(auth_router)
app.include_router(me_router)
app.include_router(admin_router)

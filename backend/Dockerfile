
# ----------------------------
# BridgePoint API (FastAPI)
# Production-friendly base
# ----------------------------
FROM python:3.12-slim

# Prevent Python from writing .pyc files & ensure real-time logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Workdir inside the container
WORKDIR /backend

# Install Python deps (prefer requirements.txt for reproducible builds)
COPY requirements.txt /backend/
RUN pip install --no-cache-dir -r requirements.txt

# Copy your backend code:
# NOTE: we copy the local "api/" folder into the image as "app/"
# so imports like `from app.core.config import settings` work
COPY api /backend/app

# (Optional) dev env file; remove if you inject envs differently
# COPY .env /backend/.env

# Expose FastAPI port
EXPOSE 8000

# Start FastAPI (points at the package "app", module "main", variable "app")
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

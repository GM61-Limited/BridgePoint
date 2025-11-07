# Use an official Python image
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy app files
COPY app.py /app/

# Install dependencies
RUN pip install --no-cache-dir fastapi uvicorn PyJWT bcrypt psycopg2-binary

# Expose FastAPI port
EXPOSE 8000

# Start FastAPI server
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
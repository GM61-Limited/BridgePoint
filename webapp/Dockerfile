
# webapp/Dockerfile

# --- Stage 1: Build the React app ---
FROM node:20-alpine AS build
WORKDIR /app

# ---- Build-time metadata (optional ARGs with sensible defaults) ----
# Supply these via `--build-arg` during docker build to stamp the UI.
ARG APP_VERSION=0.0.0
ARG GIT_SHA=dev
ARG BUILD_TIME=unknown
# Optional: backend base URL for the frontend (matches your Vite usage)
ARG API_BASE_URL=http://localhost:8000

# ---- Make metadata available to Vite at build time ----
# Vite only embeds env vars that begin with VITE_
ENV VITE_APP_VERSION=${APP_VERSION} \
    VITE_GIT_SHA=${GIT_SHA} \
    VITE_BUILD_TIME=${BUILD_TIME} \
    VITE_API_BASE_URL=${API_BASE_URL}

# Install deps using layer caching
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build
COPY frontend ./
# Output goes to /app/dist
RUN npm run build

# --- Stage 2: Nginx runtime ---
FROM nginx:1.27-alpine

# Copy SPA-aware Nginx config (with / -> index.html fallback and /api proxy)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# (Optional) add a basic healthcheck
# NOTE: nginx:alpine includes busybox; wget is typically available.
# If your image lacks wget, switch to: `CMD curl -fsS http://localhost/ || exit 1`
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://localhost/ || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

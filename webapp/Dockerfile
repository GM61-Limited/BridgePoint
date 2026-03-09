# webapp/Dockerfile

# --- Stage 1: Build the React app ---
FROM node:20-alpine AS build
WORKDIR /app

ARG APP_VERSION=0.0.0
ARG GIT_SHA=dev
ARG BUILD_TIME=unknown

# Default to /api so browser calls same-origin /api/*
ARG API_BASE_URL=/api

# Vite embeds VITE_* at build time
ENV VITE_APP_VERSION=${APP_VERSION} \
    VITE_GIT_SHA=${GIT_SHA} \
    VITE_BUILD_TIME=${BUILD_TIME} \
    VITE_API_BASE_URL=${API_BASE_URL}

COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund

COPY frontend ./
RUN npm run build


# --- Stage 2: Nginx runtime ---
FROM nginx:1.27-alpine

# Runtime defaults (override in docker-compose / Azure Container App env vars)
ENV BACKEND_HOST=backend \
    BACKEND_PORT=8000 \
    BACKEND_SCHEME=http \
    BACKEND_LOGIN_PATH=/login

# Template goes here; nginx entrypoint envsubst will generate /etc/nginx/conf.d/default.conf [1](https://reearth.engineering/posts/ngnix-docker-envsubst/)[2](https://serverfault.com/questions/577370/how-can-i-use-environment-variables-in-nginx-conf)
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://localhost/ || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
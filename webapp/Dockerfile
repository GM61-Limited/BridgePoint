
# webapp/Dockerfile

# --- Stage 1: Build the React app ---
FROM node:20-alpine AS build
WORKDIR /app

# Install deps using layer caching
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build
COPY frontend ./
RUN npm run build   # outputs /app/dist

# --- Stage 2: Nginx runtime ---
FROM nginx:1.27-alpine

# Copy SPA-aware Nginx config (with / -> index.html fallback and /api proxy)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# (Optional) add a basic healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://localhost/ || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Stage 1: Build stage (optional if you later use a framework like React/Vue)
# For now, we’ll skip the build process and just serve static content.

# Stage 2: Nginx runtime
FROM nginx:alpine

# Copy static website files into Nginx HTML directory
COPY ./html /usr/share/nginx/html

# Copy custom Nginx config (optional, but best practice)
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 for web traffic
EXPOSE 80

# Start Nginx server
CMD ["nginx", "-g", "daemon off;"]
# Multi-stage Dockerfile for Slimbooks
# Optimized for security, smaller image size, and Raspberry Pi OS Lite compatibility

# Build stage for frontend
FROM node:24-alpine AS frontend-builder

# Minimal memory settings
ENV NODE_OPTIONS="--max-old-space-size=1024"

# Set Puppeteer environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Set working directory
WORKDIR /app

# Copy package files (package.json and package-lock.json)
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build frontend assets
RUN npm run build

# Production stage
FROM node:24-alpine

ENV NODE_ENV=production

RUN addgroup -g 1001 -S slimbooks && \
 adduser -S -u 1001 -G slimbooks slimbooks

WORKDIR /app

# Install system dependencies for runtime (better-sqlite3, puppeteer)
RUN apk update && apk upgrade && apk add --no-cache \
 python3 make gcc g++ sqlite-dev chromium nss freetype freetype-dev harfbuzz ca-certificates fontconfig ttf-freefont udev

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --no-audit && npm cache clean --force

# Clean up build dependencies to reduce image size
RUN apk del python3 make gcc g++ freetype-dev

# Copy the rest of app (frontend assets + server)
COPY --from=frontend-builder /app/dist ./dist
# Certificates are NOT copied. `certs/` holds no tracked files, so it does not
# exist after a fresh `git clone` and `COPY certs ./certs` failed the build —
# it only ever succeeded because the directory happened to be on the
# developer's disk. docker-compose bind-mounts ./certs over the same path, and
# baking a TLS private key into a layer is wrong on its own terms: layers are
# shared, pushed and cached.
#
# vite.config.ts is not copied either. Dependencies here are installed with
# `npm ci --omit=dev`, so vite is not present to read it; it was a remnant of
# the `vite preview` production path that 2.0.0 removed.

# No environment file is baked into the image. This previously copied
# `.env.production` — a template of placeholder values — to `/app/.env`, so
# every container built from this image ran with the published default signing
# secret unless something happened to override it, and nothing did.
#
# Configuration is supplied at run time instead: docker-compose passes the
# operator's own `.env` through `env_file`.

# The persistent surface is exactly DATA_DIR and UPLOAD_DIR. There is no log
# directory: nothing under server/runtime/ resolves one, and container logs go
# to the Docker logging driver.
RUN mkdir -p /app/data /app/uploads && \
 chown -R slimbooks:slimbooks /app

USER slimbooks

# The port the process actually binds. PORT may override it, and may be a named
# pipe path on hosts that supply one — this is documentation, not a binding.
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const secure = process.env.TLS_MODE === 'self'; const client = secure ? require('https') : require('http'); client.get({ hostname: 'localhost', port: process.env.PORT || 3002, path: '/api/health', rejectUnauthorized: false }, (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "run", "start"]
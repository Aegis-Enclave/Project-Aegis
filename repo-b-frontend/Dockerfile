# ──────────────────────────────────────────────────────────────────
# Project Aegis — Validation Sandbox
# ──────────────────────────────────────────────────────────────────
# Minimal image for running tsc --noEmit in isolation.
# No server, no runtime process — type-check only.
# ──────────────────────────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /app

# Install dependencies first (separate layer for clarity, --no-cache
# is applied at docker build time so this always runs fresh)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy all source files: tsconfig.json, next.config.js, src/, etc.
COPY . .

CMD ["npm", "run", "type-check"]

# syntax=docker/dockerfile:1.7

# ---- deps ----
FROM node:22-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholders so prisma generate / next build do not require real secrets.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public" \
    DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public" \
    APP_BASE_URL="http://localhost:3000" \
    NEXT_PUBLIC_APP_URL="http://localhost:3000" \
    SESSION_SECRET="build-time-placeholder-build-time-placeholder" \
    DEMO_LOGIN_PASSWORD="build-time-placeholder"
RUN npx prisma generate && npm run build

# ---- web runner (standalone, non-root) ----
FROM node:22-alpine AS web-runner
RUN apk add --no-cache openssl tini wget
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/prisma ./prisma
COPY --from=builder --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=app:app /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=app:app /app/node_modules/prisma ./node_modules/prisma
USER app
EXPOSE 3000
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","server.js"]

# ---- worker runner (full deps, tsx for ts entry) ----
FROM node:22-alpine AS worker-runner
RUN apk add --no-cache openssl tini
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=app:app package.json package-lock.json tsconfig.json ./
COPY --chown=app:app prisma ./prisma
COPY --chown=app:app agent ./agent
COPY --chown=app:app lib ./lib
USER app
ENTRYPOINT ["/sbin/tini","--"]
CMD ["npx","tsx","agent/agent-worker.ts"]

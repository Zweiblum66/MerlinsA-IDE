# ─── Stage 1: Install dependencies ───────────────────────────────────────
FROM node:22-slim AS deps

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json              packages/db/package.json
COPY packages/core/package.json            packages/core/package.json
COPY packages/scrum/package.json           packages/scrum/package.json
COPY packages/rag/package.json             packages/rag/package.json
COPY packages/token-optimizer/package.json packages/token-optimizer/package.json
COPY packages/api-registry/package.json    packages/api-registry/package.json
COPY packages/naming/package.json          packages/naming/package.json
COPY packages/wizard/package.json          packages/wizard/package.json
COPY packages/cli/package.json             packages/cli/package.json
COPY packages/api/package.json             packages/api/package.json
COPY packages/web/package.json             packages/web/package.json

RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build all TypeScript packages ──────────────────────────────
FROM deps AS builder

COPY tsconfig.base.json ./
COPY packages/ packages/

# Build backend packages (order matters: db first, then dependents)
RUN pnpm -r build

# Build Vue frontend for production
WORKDIR /app/packages/web
RUN pnpm exec vite build

# ─── Stage 3: Production image (Ubuntu-based) ───────────────────────────
FROM ubuntu:latest AS production

# Install Node.js 22
RUN apt-get update && \
    apt-get install -y curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Create app user
RUN useradd --create-home --shell /bin/bash appuser

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules

# Copy all built packages (dist/ folders + package.json)
COPY --from=builder /app/packages/db/dist          packages/db/dist
COPY --from=builder /app/packages/db/package.json   packages/db/package.json
COPY --from=builder /app/packages/core/dist         packages/core/dist
COPY --from=builder /app/packages/core/package.json packages/core/package.json
COPY --from=builder /app/packages/scrum/dist        packages/scrum/dist
COPY --from=builder /app/packages/scrum/package.json packages/scrum/package.json
COPY --from=builder /app/packages/rag/dist          packages/rag/dist
COPY --from=builder /app/packages/rag/package.json  packages/rag/package.json
COPY --from=builder /app/packages/token-optimizer/dist        packages/token-optimizer/dist
COPY --from=builder /app/packages/token-optimizer/package.json packages/token-optimizer/package.json
COPY --from=builder /app/packages/api-registry/dist        packages/api-registry/dist
COPY --from=builder /app/packages/api-registry/package.json packages/api-registry/package.json
COPY --from=builder /app/packages/naming/dist        packages/naming/dist
COPY --from=builder /app/packages/naming/package.json packages/naming/package.json
COPY --from=builder /app/packages/wizard/dist        packages/wizard/dist
COPY --from=builder /app/packages/wizard/package.json packages/wizard/package.json
COPY --from=builder /app/packages/api/dist          packages/api/dist
COPY --from=builder /app/packages/api/package.json  packages/api/package.json

# Copy each package's node_modules (for workspace deps)
COPY --from=builder /app/packages/db/node_modules          packages/db/node_modules
COPY --from=builder /app/packages/core/node_modules        packages/core/node_modules
COPY --from=builder /app/packages/scrum/node_modules       packages/scrum/node_modules
COPY --from=builder /app/packages/rag/node_modules         packages/rag/node_modules
COPY --from=builder /app/packages/token-optimizer/node_modules packages/token-optimizer/node_modules
COPY --from=builder /app/packages/api-registry/node_modules packages/api-registry/node_modules
COPY --from=builder /app/packages/naming/node_modules      packages/naming/node_modules
COPY --from=builder /app/packages/wizard/node_modules      packages/wizard/node_modules
COPY --from=builder /app/packages/api/node_modules         packages/api/node_modules

# Copy built Vue frontend static files
COPY --from=builder /app/packages/web/dist packages/web/dist

# Create data directory for SQLite
RUN mkdir -p /data && chown appuser:appuser /data

USER appuser

# Environment defaults
ENV NODE_ENV=production
ENV PORT=19700
ENV HOST=0.0.0.0
ENV DB_PATH=/data/the-ide.db

EXPOSE 19700

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:19700/api/v1/health || exit 1

# Start the Fastify API server (serves Vue SPA via @fastify/static)
CMD ["node", "packages/api/dist/index.js"]

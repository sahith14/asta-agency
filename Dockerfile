# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# AgencyOS production image — Next.js 16 standalone + Prisma + SQLite.
#
# The SQLite database lives on a Docker VOLUME mounted at /app/db so data
# survives restarts and redeploys. Secrets are NOT baked into the image;
# they are supplied at runtime via environment variables.
#
# STATUS: prepared for the deployment target. Docker was not available in
# the development sandbox, so this image has not been built locally — run a
# throwaway smoke deploy on your chosen host first:
#   docker build -t agencyos .
#   docker run --rm -p 3000:3000 -v agencyos-data:/app/db agencyos
#
# Build & run (any container host — Fly.io, Railway, Render, or a VPS):
#   fly launch && fly volumes create agencyos-data --size 3 && fly deploy
#   railway init && railway volume add --mount-path /app/db && railway up
# ─────────────────────────────────────────────────────────────────────────────

# ── 1. Install dependencies ─────────────────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# ── 2. Build the standalone bundle ──────────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A placeholder URL satisfies the build-time DATABASE_URL validation;
# no real data is touched during build.
ENV DATABASE_URL="file:/tmp/build-placeholder.db"
RUN bunx prisma generate
RUN bun run build

# ── 3. Runtime image ────────────────────────────────────────────────────────
FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# SQLite on the persistent volume (override only if you mount elsewhere).
ENV DATABASE_URL="file:/app/db/custom.db"

RUN mkdir -p /app/db
VOLUME /app/db

# Full node_modules first (gives the entrypoint the Prisma CLI for the
# schema-apply step), then the standalone bundle on top — the standalone
# subset is file-identical for shared packages, so the merge is safe.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]

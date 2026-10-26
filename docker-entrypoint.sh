#!/bin/sh
# AgencyOS container entrypoint.
# 1. Apply the Prisma schema to the SQLite database on the persistent volume.
#    - Idempotent: no-op when the schema already matches.
#    - Non-destructive on purpose: without --accept-data-loss Prisma REFUSES
#      (and the container fails loudly) if a change would destroy data.
# 2. Hand off to the Next.js standalone server.
set -e

echo "[entrypoint] Applying Prisma schema to $DATABASE_URL (non-destructive)..."
bunx prisma db push --skip-generate

echo "[entrypoint] Starting AgencyOS on port ${PORT:-3000}..."
exec bun server.js

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# ASTA AGENCY — one-command local setup (macOS / Linux)
# Installs the Bun runtime + all dependencies and verifies the
# bundled SQLite database. Safe to re-run at any time.
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

echo "━━━ ASTA AGENCY · local setup ━━━"

# 1) Bun runtime (required — package scripts use Bun's cross-platform shell)
if ! command -v bun >/dev/null 2>&1; then
  echo "→ Installing Bun runtime..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi
echo "→ Bun $(bun --version) ✓"

# 2) Install dependencies (Prisma client is generated automatically on postinstall)
echo "→ Installing packages (first run downloads a few hundred MB)..."
bun install

# 3) Make sure the Prisma client exists (idempotent, fast if already generated)
bun x prisma generate >/dev/null 2>&1 || true

# 4) Database is bundled at db/custom.db — recreate only if it's missing
if [ ! -f db/custom.db ]; then
  echo "→ Database missing — recreating schema (demo:reset will re-seed content)..."
  bun x prisma db push
fi

# 5) Local config — .env ships ready-to-use; recreate a minimal one if deleted
if [ ! -f .env ]; then
  cat > .env <<'EOF'
DATABASE_URL=file:../db/custom.db
ENABLE_TEST_ACCOUNTS=false
EOF
  echo "→ Recreated a minimal .env (demo accounts disabled)."
fi

echo ""
echo "✓ Setup complete."
echo "    Start the website:   bun run dev"
echo "    Then open:           http://localhost:3000"

# ASTA AGENCY — Install on your PC

This package is the **complete website, ready to run locally**: full source code,
SQLite database with all content, and demo login accounts. One script does
everything.

---

## Requirements

- An internet connection (one-time, to download dependencies)
- That's it. The setup script installs everything else (the **Bun** runtime,
  all packages, the database client).

---

## Quick start — 3 steps

### 1. Unzip
Unzip this folder anywhere you like (a simple path like `C:\asta` or `~/asta`
works best — avoid spaces/special characters if possible).

### 2. Run setup (one time)

| System | How |
|---|---|
| **Windows** | Double-click **`setup.bat`** (or run it from Command Prompt) |
| **macOS** | Open Terminal in this folder → `bash setup.sh` |
| **Linux** | Open Terminal in this folder → `bash setup.sh` |

The script will: install Bun → install all packages → prepare the database.
Takes 1–3 minutes depending on your connection.

### 3. Start the website

```bash
bun run dev
```

Then open **http://localhost:3000** in your browser. That's the whole site.

> Stop the server anytime with `Ctrl + C`. Start it again later with `bun run dev`.

---

## Demo login accounts

The login page (`/login`) shows a built-in panel with these accounts. They are
also stored in the `.env` file.

| Role | Email | Password |
|---|---|---|
| Owner | `founder@astas.local` | `j1lNtxiMPYIuaA1!` |
| Client Manager | `priya@astas.local` | `3SJvAxa5yj7PaA1!` |
| Creative Director | `tom@astas.local` | `AEdbcgrjJxiIaA1!` |
| Support / Finance | `hannah@astas.local` | `NkIm9yJ_gf8iaA1!` |
| Videographer | `marcus@astas.local` | `kTjQG19lxlBgaA1!` |
| Video Editor | `elena@astas.local` | `q3HWDQsGsArLaA1!` |
| Web Developer | `daniel@astas.local` | `qS6EnzJI_yN-aA1!` |
| Client (Brightcuts) | `jordan@brightcuts.local` | `PKlPRa_QS52saA1!` |
| Client (Anchor Bar) | `marta@anchorbar.local` | `_DIIhE3Ib00oaA1!` |

---

## Everyday commands

Always use `bun run …` (not `npm run …`) — the scripts use Bun's
cross-platform shell, so they work identically on Windows, macOS and Linux.

| Command | What it does |
|---|---|
| `bun run dev` | Start the website at http://localhost:3000 |
| `bun run build` | Production build |
| `bun run start` | Serve the production build |
| `bun run lint` | Check code quality |
| `bun run db:push` | Apply `prisma/schema.prisma` changes to the database |
| `bun run demo:reset` | Re-seed demo content & rotate demo passwords |

---

## What's inside

```
INSTALL.md            ← this file
setup.sh / setup.bat  ← one-time setup scripts
.env                  ← local config (database path + demo accounts). Keep private.
db/custom.db          ← ready-to-use SQLite database (all content, demo accounts)
prisma/               ← database schema
src/                  ← the entire application
public/               ← static assets (images, logo)
scripts/              ← seeding & maintenance utilities
docs/                 ← project & deployment documentation
Dockerfile            ← optional Docker deployment
DEPLOYMENT.md         ← production deployment guide
```

The database is **bundled and pre-seeded** — you don't need to create or seed
anything. If `db/custom.db` is ever deleted, the setup script (or the next
`bun run dev`) recreates the schema automatically, and
`bun run demo:reset` re-seeds demo content.

---

## Troubleshooting

**Port 3000 already in use**
```bash
bun x next dev -p 3001
```
(then open http://localhost:3001)

**"prisma" errors / login broken**
```bash
bun x prisma generate
bun x prisma db push
```
The dev server also self-heals credentials at every startup (see
`scripts/bootstrap-if-empty.ts`), so a simple restart usually fixes login issues.

**Windows blocked `setup.bat`** — right-click → Properties → Unblock, or run
`setup.bat` from a normal Command Prompt window.

**macOS says `setup.sh` can't be opened** — run it from Terminal:
`bash setup.sh`.

**AI-powered features** (AI text/image tools) use the `z-ai-web-dev-sdk`,
which is pre-configured in the original cloud workspace. The core website,
portfolio, configurator, client portal and enquiry flows work fully offline;
AI routes may require configuring your own API keys on your machine.

---

## Deploying for real

When you're ready to put this on a real server, read `DEPLOYMENT.md` (a
Dockerfile is included). **Before deploying publicly, delete the temporary
`src/app/api/download/[file]/route.ts`** — it exists only to let you download
this package from the cloud workspace and is marked in the code.

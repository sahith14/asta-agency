@echo off
rem ─────────────────────────────────────────────────────────────
rem ASTA AGENCY — one-command local setup (Windows)
rem Installs the Bun runtime + all dependencies and verifies the
rem bundled SQLite database. Safe to re-run at any time.
rem ─────────────────────────────────────────────────────────────
title ASTA AGENCY - local setup
cd /d "%~dp0"

echo === ASTA AGENCY - local setup ===

rem 1) Bun runtime (required - package scripts use Bun's cross-platform shell)
rem    NOTE: we test `bun --version`, not `where bun` - Windows Store alias stubs
rem    can make `where` succeed while bun is NOT actually installed.
bun --version >nul 2>nul
if %errorlevel% neq 0 (
  echo ^> Installing Bun runtime...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
)
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
bun --version >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo [ERROR] Bun could not be installed automatically.
  echo   Fix: run this command, then CLOSE and REOPEN PowerShell and
  echo   run setup.bat again:
  echo     powershell -c "irm bun.sh/install.ps1 | iex"
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('bun --version 2^>nul') do echo ^> Bun v%%v OK

rem 2) Install dependencies (Prisma client generated automatically on postinstall)
echo ^> Installing packages...
call bun install

rem 3) Make sure the Prisma client exists (idempotent)
echo ^> Ensuring Prisma client...
call bun x prisma generate

rem 4) Database is bundled at db\custom.db - recreate only if missing
if not exist db\custom.db (
  echo ^> Database missing - recreating schema...
  call bun x prisma db push
)

rem 5) Local config - .env ships ready-to-use; recreate minimal one if deleted
if not exist .env (
  echo DATABASE_URL=file:../db/custom.db> .env
  echo ENABLE_TEST_ACCOUNTS=false>> .env
  echo ^> Recreated a minimal .env
)

echo.
echo Setup complete.
echo   Start the website:   bun run dev
echo   Then open:           http://localhost:3000
pause

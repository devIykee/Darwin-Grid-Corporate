@echo off
setlocal EnableDelayedExpansion
title Darwin Grid — Corporate Edition

echo.
echo   ╔══════════════════════════════════════════╗
echo   ║   THE DARWIN GRID — CORPORATE EDITION   ║
echo   ╚══════════════════════════════════════════╝
echo.

:: ── Node.js check ──────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo         Download it from https://nodejs.org  ^(v18 or later^)
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODEVER=%%v
echo [OK] Node.js %NODEVER%

:: ── npm check ──────────────────────────────────────────────
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed ^(it normally ships with Node.js^).
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('npm --version') do set NPMVER=%%v
echo [OK] npm %NPMVER%

:: ── GROQ_API_KEY check ────────────────────────────────────
if "%GROQ_API_KEY%"=="" (
    echo.
    echo [WARN] GROQ_API_KEY is not set.
    echo        Get a free key at https://console.groq.com
    set /p GROQ_INPUT="       Paste your key now (or press Enter to skip): "
    if not "!GROQ_INPUT!"=="" (
        set GROQ_API_KEY=!GROQ_INPUT!
        echo [OK] Key accepted.
    ) else (
        echo [WARN] No key — agents will fall back to WAIT each tick.
    )
) else (
    echo [OK] GROQ_API_KEY is set
)

:: ── Install dependencies ───────────────────────────────────
cd /d "%~dp0"
if not exist "node_modules" (
    echo.
    echo [INFO] Installing dependencies ^(first run only^)...
    call npm install
    if errorlevel 1 (
        echo [WARN] Retrying with --legacy-peer-deps...
        call npm install --legacy-peer-deps
        if errorlevel 1 ( echo [ERROR] npm install failed. See errors above. & pause & exit /b 1 )
    )
    echo [OK] Dependencies installed
) else (
    echo [OK] Dependencies already installed
)

:: ── Launch ─────────────────────────────────────────────────
echo.
echo   Starting the simulation...
echo.
echo   World server  ^=^>  http://localhost:3001   ^<^-- open this in your browser
echo   Orchestrator  ^=^>  http://localhost:3002
echo   Settlement    ^=^>  http://localhost:3003
echo.
echo   Press Ctrl+C to stop.
echo.

:: Open browser after a short delay
start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:3001"

call npm start
endlocal

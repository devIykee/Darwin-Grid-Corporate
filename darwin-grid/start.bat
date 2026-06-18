@echo off
setlocal EnableDelayedExpansion
title Darwin Grid — Corporate Edition

echo.
echo   ╔══════════════════════════════════════════╗
echo   ║   THE DARWIN GRID — CORPORATE EDITION   ║
echo   ╚══════════════════════════════════════════╝
echo.

:: ── Port configuration ─────────────────────────────────────
:: Defaults: 3001 / 3002 / 3003
:: Override with env vars before calling the script:
::   set WORLD_SERVER_PORT=4001 && set ORCHESTRATOR_PORT=4002 && set SETTLEMENT_PORT=4003 && start.bat
:: Or pass flags:
::   start.bat --world 4001 --orchestrator 4002 --settlement 4003

if "%WORLD_SERVER_PORT%"=="" ( set P_WORLD=3001 ) else ( set P_WORLD=%WORLD_SERVER_PORT% )
if "%ORCHESTRATOR_PORT%"==""  ( set P_ORCH=3002  ) else ( set P_ORCH=%ORCHESTRATOR_PORT% )
if "%SETTLEMENT_PORT%"==""    ( set P_SETTLE=3003 ) else ( set P_SETTLE=%SETTLEMENT_PORT% )

:: Parse flags
:parse_args
if "%~1"=="" goto after_args
if /i "%~1"=="--world"        ( set P_WORLD=%~2  & shift & shift & goto parse_args )
if /i "%~1"=="-w"             ( set P_WORLD=%~2  & shift & shift & goto parse_args )
if /i "%~1"=="--orchestrator" ( set P_ORCH=%~2   & shift & shift & goto parse_args )
if /i "%~1"=="-o"             ( set P_ORCH=%~2   & shift & shift & goto parse_args )
if /i "%~1"=="--settlement"   ( set P_SETTLE=%~2 & shift & shift & goto parse_args )
if /i "%~1"=="-s"             ( set P_SETTLE=%~2 & shift & shift & goto parse_args )
if /i "%~1"=="--help"         goto show_help
if /i "%~1"=="-h"             goto show_help
echo [ERROR] Unknown option: %~1
pause & exit /b 1
:show_help
echo Usage: start.bat [options]
echo   -w, --world         PORT   World server port   (default 3001)
echo   -o, --orchestrator  PORT   Orchestrator port   (default 3002)
echo   -s, --settlement    PORT   Settlement port     (default 3003)
echo.
echo Or set env vars before calling: WORLD_SERVER_PORT, ORCHESTRATOR_PORT, SETTLEMENT_PORT
pause & exit /b 0
:after_args

set WORLD_SERVER_PORT=%P_WORLD%
set ORCHESTRATOR_PORT=%P_ORCH%
set SETTLEMENT_PORT=%P_SETTLE%

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
:: Install each package individually — avoids an npm 11 workspace bug
:: ("Exit handler never called!") that can occur on some platforms.
cd /d "%~dp0"

set NEED_INSTALL=0
if not exist "node_modules"                  set NEED_INSTALL=1
if not exist "world-server\node_modules"     set NEED_INSTALL=1
if not exist "agent-orchestrator\node_modules" set NEED_INSTALL=1
if not exist "circle-settlement\node_modules" set NEED_INSTALL=1

if "%NEED_INSTALL%"=="1" (
    echo.
    echo [INFO] Installing dependencies ^(first run only^)...

    for %%D in (. world-server agent-orchestrator circle-settlement) do (
        if not exist "%%D\node_modules" (
            echo   Installing %%D...
            pushd "%%D"
            call npm install --no-workspaces --registry https://registry.npmjs.org --no-fund --no-audit
            if errorlevel 1 (
                call npm install --no-workspaces --registry https://registry.npmjs.org --no-fund --no-audit --legacy-peer-deps
                if errorlevel 1 (
                    echo [ERROR] Failed to install %%D. See errors above.
                    popd & pause & exit /b 1
                )
            )
            popd
        )
    )
    echo [OK] All dependencies installed
) else (
    echo [OK] Dependencies already installed
)

:: ── Port availability check ────────────────────────────────
for %%P in (%P_WORLD% %P_ORCH% %P_SETTLE%) do (
    netstat -ano | findstr "0.0.0.0:%%P " >nul 2>&1
    if not errorlevel 1 (
        echo [ERROR] Port %%P is already in use. Stop that process or choose a different port.
        echo         Tip: start.bat --world 4001 --orchestrator 4002 --settlement 4003
        pause & exit /b 1
    )
)
echo [OK] Ports %P_WORLD% / %P_ORCH% / %P_SETTLE% are free

:: ── Launch ─────────────────────────────────────────────────
echo.
echo   Starting the simulation...
echo.
echo   World server  ^=^>  http://localhost:%P_WORLD%   ^<^-- open this in your browser
echo   Orchestrator  ^=^>  http://localhost:%P_ORCH%
echo   Settlement    ^=^>  http://localhost:%P_SETTLE%
echo.
echo   Press Ctrl+C to stop.
echo.

start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:%P_WORLD%"

call npm start
endlocal

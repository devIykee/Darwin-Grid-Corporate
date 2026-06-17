#!/usr/bin/env bash
set -e

RESET='\033[0m'
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'

echo ""
echo -e "${BOLD}${GREEN}  ╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}  ║   THE DARWIN GRID — CORPORATE EDITION   ║${RESET}"
echo -e "${BOLD}${GREEN}  ╚══════════════════════════════════════════╝${RESET}"
echo ""

# ── Node.js check ──────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "${RED}✗ Node.js is not installed.${RESET}"
  echo -e "  Install it from ${CYAN}https://nodejs.org${RESET} (v18 or later), then re-run this script."
  exit 1
fi

NODE_VER=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>/dev/null && echo ok || echo fail)
if [ "$NODE_VER" = "fail" ]; then
  echo -e "${RED}✗ Node.js v18 or later is required (you have $(node --version)).${RESET}"
  echo -e "  Download the latest LTS from ${CYAN}https://nodejs.org${RESET}"
  exit 1
fi
echo -e "${GREEN}✓ Node.js $(node --version)${RESET}"

# ── npm check ──────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  echo -e "${RED}✗ npm is not installed (it normally ships with Node.js).${RESET}"
  exit 1
fi
echo -e "${GREEN}✓ npm $(npm --version)${RESET}"

# ── GROQ_API_KEY check ────────────────────────────────────
if [ -z "$GROQ_API_KEY" ]; then
  echo ""
  echo -e "${YELLOW}⚠  GROQ_API_KEY is not set.${RESET}"
  echo -e "   Get a free key at ${CYAN}https://console.groq.com${RESET}"
  printf "   Paste your key now (or press Enter to run without AI): "
  read -r GROQ_INPUT
  if [ -n "$GROQ_INPUT" ]; then
    export GROQ_API_KEY="$GROQ_INPUT"
    echo -e "${GREEN}✓ Key accepted (not saved to disk).${RESET}"
  else
    echo -e "${YELLOW}  Running without key — agents will fall back to WAIT each tick.${RESET}"
  fi
else
  echo -e "${GREEN}✓ GROQ_API_KEY is set${RESET}"
fi

# ── Install dependencies ───────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
  echo ""
  echo -e "${CYAN}⟳  Installing dependencies (first run only)...${RESET}"
  npm install --silent
  echo -e "${GREEN}✓ Dependencies installed${RESET}"
else
  echo -e "${GREEN}✓ Dependencies already installed${RESET}"
fi

# ── Port availability check ────────────────────────────────
check_port() {
  if lsof -i ":$1" -t &>/dev/null 2>&1 || ss -tlnp "sport = :$1" 2>/dev/null | grep -q LISTEN; then
    echo -e "${RED}✗ Port $1 is already in use. Stop the process using it and try again.${RESET}"
    exit 1
  fi
}
for PORT in 3001 3002 3003; do check_port $PORT; done
echo -e "${GREEN}✓ Ports 3001 / 3002 / 3003 are free${RESET}"

# ── Launch ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ▶ Starting the simulation...${RESET}"
echo -e "${CYAN}  World server  → http://localhost:3001${RESET}  ← open this in your browser"
echo -e "${CYAN}  Orchestrator  → http://localhost:3002${RESET}"
echo -e "${CYAN}  Settlement    → http://localhost:3003${RESET}"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop."
echo ""

# Try to open browser automatically
if command -v open &>/dev/null; then
  (sleep 2 && open "http://localhost:3001") &
elif command -v xdg-open &>/dev/null; then
  (sleep 2 && xdg-open "http://localhost:3001") &
fi

npm start

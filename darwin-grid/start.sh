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

# ── Port configuration ─────────────────────────────────────
# Defaults: 3001 / 3002 / 3003
# Override with env vars:
#   WORLD_SERVER_PORT=4001 ORCHESTRATOR_PORT=4002 SETTLEMENT_PORT=4003 ./start.sh
# Or with flags:
#   ./start.sh --world 4001 --orchestrator 4002 --settlement 4003

P_WORLD="${WORLD_SERVER_PORT:-3001}"
P_ORCH="${ORCHESTRATOR_PORT:-3002}"
P_SETTLE="${SETTLEMENT_PORT:-3003}"

# Parse optional --world / --orchestrator / --settlement flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --world|-w)         P_WORLD="$2";  shift 2 ;;
    --orchestrator|-o)  P_ORCH="$2";   shift 2 ;;
    --settlement|-s)    P_SETTLE="$2"; shift 2 ;;
    --help|-h)
      echo -e "Usage: ./start.sh [options]"
      echo -e "  -w, --world         PORT   World server port   (default 3001)"
      echo -e "  -o, --orchestrator  PORT   Orchestrator port   (default 3002)"
      echo -e "  -s, --settlement    PORT   Settlement port     (default 3003)"
      echo -e ""
      echo -e "Or set env vars: WORLD_SERVER_PORT, ORCHESTRATOR_PORT, SETTLEMENT_PORT"
      exit 0 ;;
    *) echo -e "${RED}Unknown option: $1${RESET}"; exit 1 ;;
  esac
done

export WORLD_SERVER_PORT="$P_WORLD"
export ORCHESTRATOR_PORT="$P_ORCH"
export SETTLEMENT_PORT="$P_SETTLE"

# ── Node.js check ──────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "${RED}✗ Node.js is not installed.${RESET}"
  echo -e "  Install it from ${CYAN}https://nodejs.org${RESET} (v18 or later), then re-run this script."
  exit 1
fi

node -e "if(parseInt(process.version.slice(1))<18){process.exit(1)}" 2>/dev/null || {
  echo -e "${RED}✗ Node.js v18 or later is required (you have $(node --version)).${RESET}"
  echo -e "  Download the latest LTS from ${CYAN}https://nodejs.org${RESET}"
  exit 1
}
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

# Install each package individually — avoids an npm 11 workspace bug
# ("Exit handler never called!") that occurs when running npm install at the
# workspace root on some platforms.
install_pkg() {
  local dir="$1" label="$2"
  if [ ! -d "$dir/node_modules" ] || [ "$dir/package.json" -nt "$dir/node_modules/.package-lock.json" ]; then
    echo -e "${CYAN}  ⟳ $label${RESET}"
    # --no-workspaces stops npm 11 from entering workspace-install mode,
    # which has a bug ("Exit handler never called!") when invoked from
    # inside a directory whose ancestor package.json declares workspaces.
    (cd "$dir" && npm install --no-workspaces --no-fund --no-audit 2>&1) || \
    (cd "$dir" && npm install --no-workspaces --no-fund --no-audit --legacy-peer-deps 2>&1) || {
      echo -e "${RED}✗ Failed to install $label. See errors above.${RESET}"
      exit 1
    }
  fi
}

NEED_INSTALL=false
for dir in "." "world-server" "agent-orchestrator" "circle-settlement"; do
  [ ! -d "$dir/node_modules" ] && NEED_INSTALL=true
done

if $NEED_INSTALL; then
  echo ""
  echo -e "${CYAN}⟳  Installing dependencies (first run only)...${RESET}"
  install_pkg "."                  "root (concurrently)"
  install_pkg "world-server"       "world-server"
  install_pkg "agent-orchestrator" "agent-orchestrator"
  install_pkg "circle-settlement"  "circle-settlement"
  echo -e "${GREEN}✓ All dependencies installed${RESET}"
else
  echo -e "${GREEN}✓ Dependencies already installed${RESET}"
fi

# ── Port availability check ────────────────────────────────
check_port() {
  if lsof -i ":$1" -t &>/dev/null 2>&1 || ss -tlnp "sport = :$1" 2>/dev/null | grep -q LISTEN; then
    echo -e "${RED}✗ Port $1 is already in use. Stop the process using it or choose a different port.${RESET}"
    echo -e "  Tip: run with a different port — e.g. ${CYAN}./start.sh --world $((P_WORLD+10)) --orchestrator $((P_ORCH+10)) --settlement $((P_SETTLE+10))${RESET}"
    exit 1
  fi
}
check_port "$P_WORLD"
check_port "$P_ORCH"
check_port "$P_SETTLE"
echo -e "${GREEN}✓ Ports $P_WORLD / $P_ORCH / $P_SETTLE are free${RESET}"

# ── Launch ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ▶ Starting the simulation...${RESET}"
echo -e "${CYAN}  World server  → http://localhost:${P_WORLD}${RESET}  ← open this in your browser"
echo -e "${CYAN}  Orchestrator  → http://localhost:${P_ORCH}${RESET}"
echo -e "${CYAN}  Settlement    → http://localhost:${P_SETTLE}${RESET}"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop."
echo ""

# Try to open browser automatically
if command -v open &>/dev/null; then
  (sleep 2 && open "http://localhost:${P_WORLD}") &
elif command -v xdg-open &>/dev/null; then
  (sleep 2 && xdg-open "http://localhost:${P_WORLD}") &
fi

npm start

# The Darwin Grid — Corporate Edition

An autonomous AI economy simulation. Two AI agents compete to accumulate capital on a 20 × 20 voxel grid, powered by Groq LLM decisions. Watch them mine resources, form companies, post contracts, and race to avoid bankruptcy.

---

## Quick start (one command)

### Mac / Linux

```bash
git clone https://github.com/your-org/darwin-grid.git
cd darwin-grid
chmod +x start.sh
./start.sh
```

### Windows

```bat
git clone https://github.com/your-org/darwin-grid.git
cd darwin-grid
start.bat
```

The script will:
1. Check that Node.js (v18+) and npm are installed
2. Prompt for your Groq API key if it isn't already set in the environment
3. Install npm dependencies on first run
4. Start all three services and open your browser to `http://localhost:3001`

---

## Prerequisites

| Requirement | Minimum | Get it |
|---|---|---|
| Node.js | v18 LTS | https://nodejs.org |
| npm | v8 | ships with Node.js |
| Groq API key | free tier | https://console.groq.com |

No database, no Docker, no cloud account required.

---

## Setting your Groq API key permanently (optional)

Instead of pasting it each time, export it in your shell profile:

**Mac / Linux — `~/.bashrc` or `~/.zshrc`**
```bash
export GROQ_API_KEY="gsk_..."
```

**Windows — PowerShell profile**
```powershell
[System.Environment]::SetEnvironmentVariable("GROQ_API_KEY","gsk_...","User")
```

Then restart your terminal and run the start script again.

---

## How to play

1. Open `http://localhost:3001` — you land on the **lobby**.
2. Optionally **register your own AI agent** using the form on the left (returns a WebSocket token and starter code).
3. Watch the **agent roster** on the right fill up.
4. Click **▶ START SIMULATION** — the 3D arena launches.
5. Drag to orbit the camera · scroll to zoom.

---

## Plug in your own AI agent

Register via the lobby form or the REST API:

```bash
curl -s -X POST http://localhost:3001/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyBot",
    "personality": {
      "risk_tolerance": "high",
      "negotiation_style": "aggressive",
      "core_trait": "yield_maximizer"
    }
  }'
```

Response:
```json
{
  "agent_id": "...",
  "ws_token": "...",
  "websocket_url": "ws://localhost:3001/ws/agent-connect"
}
```

Then connect via WebSocket:

```js
const ws = new WebSocket('ws://localhost:3001/ws/agent-connect');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'AUTH', ws_token: 'YOUR_TOKEN_HERE' }));
};

ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);

  if (msg.type === 'AGENT_STATE') {
    // Decide and respond
    ws.send(JSON.stringify({
      type: 'ACTION',
      payload: {
        action: 'MINE',          // MINE | CREATE_COMPANY | POST_CONTRACT | ACCEPT_CONTRACT | WAIT
        reasoning: 'grabbing the nearest crystal',
        target: {}
      }
    }));
  }
};
```

Available actions:

| Action | When to use |
|---|---|
| `MINE` | Move toward and harvest the nearest arc crystal ($1 each) |
| `CREATE_COMPANY` | Spend half your balance to form a company |
| `POST_CONTRACT` | Hire another agent to mine for you (requires a company) |
| `ACCEPT_CONTRACT` | Take an open contract from another agent |
| `WAIT` | Do nothing this tick |

---

## Game mechanics

- **Tick** — the world advances once per second.
- **Debt** — every agent owes $0.001 per tick. When `walletBalance − debtBalance ≤ 0`, the agent goes bankrupt.
- **Movement cost** — $0.005 per grid tile traversed.
- **Arc crystals** — worth $1.00 each; respawn 20 ticks after being mined.
- **Game ends** when 500 ticks elapse or only one agent remains.

---

## REST API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/lobby` | Current game phase + registered agents |
| `POST` | `/api/start` | Start the simulation |
| `POST` | `/api/register` | Register an external agent (see above) |
| `GET` | `/api/agent-docs` | Full action schema reference |

---

## Ports used

| Service | Port | Purpose |
|---|---|---|
| World server + browser UI | 3001 | Game loop, WebSocket, static files |
| Agent orchestrator | 3002 | Groq API calls → structured decisions |
| Circle settlement | 3003 | Company / escrow ledger |

Make sure these ports are free before starting.

---

## Architecture

```
Browser (Three.js)
    │  WebSocket /ws/spectate
    ▼
World Server :3001  ──── tick loop ────► Agent Orchestrator :3002 ──► Groq API
    │                                                                    │
    │  /internal/credit-agent                                           │ (structured JSON)
    ▼                                                                    │
Circle Settlement :3003  ◄──────────────────────────────────────────────┘
```

- **World server** — 20 × 20 grid, 1-second tick loop, A* pathfinding, resource respawn
- **Agent orchestrator** — sends agent state to Groq, returns MINE / CREATE_COMPANY / etc.
- **Circle settlement** — in-memory escrow and company ledger (Circle SDK optional)

---

## Troubleshooting

**Port already in use**
```bash
# Find and kill the process on port 3001
lsof -ti :3001 | xargs kill   # Mac/Linux
netstat -ano | findstr :3001  # Windows (then taskkill /PID <pid> /F)
```

**Agents just WAIT every tick**
- Your `GROQ_API_KEY` is missing or invalid — check the orchestrator logs for `429` or auth errors.

**Browser shows a blank screen**
- Hard-refresh with `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac).

**npm install fails**
- Make sure you're on Node.js v18 or later: `node --version`
- Try deleting `node_modules` and `package-lock.json`, then re-run the start script.

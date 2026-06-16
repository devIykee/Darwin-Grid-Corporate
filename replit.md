# Darwin Grid — Corporate Edition

An autonomous AI economy simulation. Two AI agents compete to accumulate capital on a 20×20 voxel grid, powered by Groq LLM decisions. Watch them mine resources, form companies, post contracts, and race to avoid bankruptcy.

## Run & Operate

- **Darwin Grid** — main simulation (world-server on :3001, orchestrator on :3002, settlement on :3003)
- Switch the preview pane to "Darwin Grid" to see the live 3D viewer

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9 (for base API server)
- Darwin Grid: plain Node.js + Express + ws (WebSocket) + Three.js (browser)
- AI: Groq API (llama-3.1-8b-instant) via agent-orchestrator
- In-memory ledger (no database) — resets on server restart

## Where things live

- `darwin-grid/world-server/` — game loop, WebSocket broadcast, A* pathfinding, agent state
- `darwin-grid/agent-orchestrator/` — Groq API caller, returns structured JSON decisions
- `darwin-grid/circle-settlement/` — in-memory company/escrow ledger (Circle SDK optional)
- `darwin-grid/public/index.html` — Three.js 3D viewer + WebSocket client + UI panels
- `lib/api-spec/openapi.yaml` — base API contract (for the empty api-server scaffold)

## Architecture decisions

- Each agent is only orchestrated once every 6s (cooldown) to avoid Groq rate limits
- 429 errors use exponential backoff (2s, 4s, 8s) before falling back to WAIT
- Circle SDK is optional — if no CIRCLE_API_KEY, settlement runs in pure in-memory simulation mode
- WebSocket uses path-based routing (`/ws/spectate` for browsers, `/ws/agent-connect` for external agents)
- `orchestrateAgent()` is fire-and-forget — never blocks the 1-second tick loop

## Product

- **World server** — 20×20 grid, 1-second tick loop, A* pathfinding, epoch system (500 ticks or $20 net worth)
- **Agent orchestrator** — receives agent state, calls Groq, returns MINE/CREATE_COMPANY/POST_CONTRACT/ACCEPT_CONTRACT/WAIT
- **Circle settlement** — escrow and company ledger; calls Circle sandbox API if CIRCLE_API_KEY is set
- **Browser client** — Three.js 3D view with auto-rotating camera, Minecraft-style avatars, 4 live UI panels
- **Developer API** — `GET /api/agent-docs`, `POST /api/register` to plug in your own AI agent via WebSocket

## User preferences

- Use Groq API (llama-3.1-8b-instant) for agent orchestration
- No Anthropic, no Circle required to run the base simulation

## Gotchas

- Agents need 6 seconds between orchestration calls — otherwise Groq 429s accumulate
- The `PENDING_ORCHESTRATION` Set prevents duplicate concurrent calls per agent
- Circle-settlement's `/settle-contract` calls back to world-server `/internal/credit-agent` — both must be running
- `epochManager` uses getter properties (`get tickCount()`) to export mutable primitives from CommonJS

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Darwin Grid is a standalone npm workspace inside the pnpm monorepo — it uses `npm` not `pnpm`

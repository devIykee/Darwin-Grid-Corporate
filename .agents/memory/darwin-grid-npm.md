---
name: Darwin Grid npm isolation
description: Darwin Grid uses npm workspaces inside a pnpm monorepo — they must not mix
---

**Rule:** Darwin Grid lives at `darwin-grid/` and uses npm workspaces internally. Do NOT add it to `pnpm-workspace.yaml`. Run `npm install` from `darwin-grid/`, not pnpm commands.

**Why:** Mixing npm and pnpm workspaces at the same level breaks lockfile resolution. Keeping darwin-grid/ as a self-contained npm workspace isolates its dependencies cleanly.

**How to apply:**
- Workflow command: `cd /home/runner/workspace/darwin-grid && npm install && npm start`
- Each sub-service (world-server, agent-orchestrator, circle-settlement) is an npm workspace package
- dotenv paths pointing to `../../../.env` will silently fail (fine — Replit secrets are already in process.env)

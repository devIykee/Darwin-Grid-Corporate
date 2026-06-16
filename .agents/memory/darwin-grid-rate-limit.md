---
name: Darwin Grid rate limiting
description: Groq rate limit handling for the agent-orchestrator in Darwin Grid
---

**Rule:** Each agent must have a per-agent cooldown (6000ms) between orchestration calls. Without it, both agents hit the orchestrator every tick (1s), causing constant 429s from Groq.

**Why:** Groq's free tier rate limits are per-minute. At 1 agent call/sec × 2 agents = 120 calls/min which exceeds limits.

**How to apply:**
- In world-server: track `lastOrchestrationTime` Map per agent_id, skip if < 6s elapsed
- In agent-orchestrator: wrap Groq call in retry loop with exponential backoff (2s, 4s, 8s) on 429
- `PENDING_ORCHESTRATION` Set prevents duplicate concurrent calls for the same agent

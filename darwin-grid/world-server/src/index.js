require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const { GRID_SIZE, getCell, setCell, removeResource, getAllResources } = require('./grid');
const { findPath, travelCost, TRAVEL_COST_PER_TILE } = require('./pathfinding');
const { AGENTS, spawnAgent, getAgent, updateAgent, effectiveBalance, isBankrupt } = require('./agentManager');
const epochManager = require('./epochManager');

const PORT = parseInt(process.env.WORLD_SERVER_PORT || '3001', 10);
const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS || '1000', 10);
const ORCHESTRATOR_URL = `http://localhost:${process.env.ORCHESTRATOR_PORT || 3002}`;
const SETTLEMENT_URL = `http://localhost:${process.env.SETTLEMENT_PORT || 3003}`;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

const server = http.createServer(app);
const spectateWss = new WebSocket.Server({ noServer: true });
const agentWss = new WebSocket.Server({ noServer: true });

const spectateClients = new Set();
const agentConnections = new Map();
const PENDING_ORCHESTRATION = new Set();

const openContracts = [];
let companiesCache = [];
const eventLog = [];
const lastOrchestrationTime = new Map();
const ORCHESTRATION_COOLDOWN_MS = 6000;

function logEvent(msg) {
  console.log(msg);
  eventLog.push(msg);
  if (eventLog.length > 30) eventLog.shift();
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of spectateClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch (e) {}
    }
  }
}

function buildLeaderboard() {
  const agentsArr = Array.from(AGENTS.values());
  const sortedByNetWorth = [...agentsArr].sort((a, b) => effectiveBalance(b) - effectiveBalance(a));
  const sortedCompaniesByCash = [...companiesCache].sort((a, b) => b.cash - a.cash);
  const sortedCompaniesByEarnings = [...companiesCache].sort((a, b) => (b.lifetimeEarnings || 0) - (a.lifetimeEarnings || 0));
  const sortedByContracts = [...companiesCache].sort((a, b) => (b.contractsCompleted || 0) - (a.contractsCompleted || 0));
  const sortedByReputation = [...agentsArr].sort((a, b) => b.reputation - a.reputation);

  return {
    topCompanies: sortedCompaniesByCash.slice(0, 5).map(c => ({ companyId: c.companyId, name: c.name, cash: c.cash })),
    topNetWorth: sortedByNetWorth.slice(0, 5).map(a => ({ agent_id: a.agent_id, name: a.name, netWorth: parseFloat(effectiveBalance(a).toFixed(3)) })),
    topRevenue: sortedCompaniesByEarnings.slice(0, 3).map(c => ({ name: c.name, revenue: parseFloat((c.lifetimeEarnings || 0).toFixed(3)) })),
    mostContractsCompleted: sortedByContracts.slice(0, 3).map(c => ({ name: c.name, count: c.contractsCompleted || 0 })),
    mostReliableContractors: sortedByReputation.slice(0, 3).map(a => ({ name: a.name, reputation: a.reputation })),
  };
}

function buildWorldState() {
  return {
    type: 'WORLD_STATE',
    tickCount: epochManager.tickCount,
    epochEnded: epochManager.epochEnded,
    agents: Array.from(AGENTS.values()).map(a => ({
      agent_id: a.agent_id,
      name: a.name,
      position: a.position,
      walletBalance: parseFloat(a.walletBalance.toFixed(3)),
      debtBalance: parseFloat(a.debtBalance.toFixed(3)),
      effectiveBalance: parseFloat(effectiveBalance(a).toFixed(3)),
      reputation: a.reputation,
      status: a.status,
      companyId: a.companyId,
      personality: a.personality,
    })),
    grid: { resources: getAllResources() },
    companies: companiesCache,
    openContracts: openContracts.filter(c => c.status === 'open'),
    leaderboard: buildLeaderboard(),
    eventLog: eventLog.slice(-8),
  };
}

async function refreshCompanies() {
  try {
    const res = await axios.get(`${SETTLEMENT_URL}/companies`, { timeout: 2000 });
    companiesCache = res.data || [];
  } catch (e) {}
}

function findNearestResource(pos) {
  const resources = getAllResources().filter(r => !r.claimed);
  if (resources.length === 0) return null;
  return resources.reduce((best, r) => {
    const d = Math.abs(r.position.x - pos.x) + Math.abs(r.position.y - pos.y);
    const bd = Math.abs(best.position.x - pos.x) + Math.abs(best.position.y - pos.y);
    return d < bd ? r : best;
  });
}

function buildOrchestrationPayload(agent) {
  const resources = getAllResources().filter(r => !r.claimed);
  const knownResources = resources.map(r => {
    const steps = findPath(agent.position.x, agent.position.y, r.position.x, r.position.y);
    return {
      resourceId: r.resourceId,
      value: r.value,
      location: r.position,
      distance: steps.length,
      travelCost: parseFloat(travelCost(steps).toFixed(4)),
    };
  });

  return {
    agent_id: agent.agent_id,
    personality: agent.personality,
    effectiveBalance: parseFloat(effectiveBalance(agent).toFixed(3)),
    walletBalance: parseFloat(agent.walletBalance.toFixed(3)),
    debtBalance: parseFloat(agent.debtBalance.toFixed(3)),
    reputation: agent.reputation,
    position: agent.position,
    travelCostPerTile: TRAVEL_COST_PER_TILE,
    known_resources: knownResources,
    open_contracts: openContracts.filter(c => c.status === 'open' && c.postedBy !== agent.agent_id),
    memory: agent.memory,
    companyId: agent.companyId,
    tickCount: epochManager.tickCount,
  };
}

function applyDecision(agent, decision) {
  if (!agent || agent.status !== 'idle') return;
  agent.memory.lastDecision = decision.action;
  logEvent(`[TICK ${epochManager.tickCount}] ${agent.name}: idle → ${decision.action} | ${decision.reasoning}`);

  switch (decision.action) {
    case 'MINE': {
      const resource = findNearestResource(agent.position);
      if (!resource) { return; }
      const steps = findPath(agent.position.x, agent.position.y, resource.position.x, resource.position.y);
      agent.currentPath = steps;
      agent.status = 'mining';
      break;
    }
    case 'CREATE_COMPANY': {
      if (!decision.company_name) return;
      const companyName = decision.company_name;
      const initialCapital = parseFloat((agent.walletBalance * 0.5).toFixed(4));
      axios.post(`${SETTLEMENT_URL}/create-company`, {
        agent_id: agent.agent_id,
        company_name: companyName,
        initialCapital,
      }).then(res => {
        agent.companyId = res.data.companyId;
        agent.walletBalance = parseFloat((agent.walletBalance - initialCapital).toFixed(4));
        logEvent(`[TX] create-company ${companyName} → ${res.data.companyId}`);
        refreshCompanies();
      }).catch(err => {
        console.error('[ERROR] create-company:', err.message);
      });
      break;
    }
    case 'POST_CONTRACT': {
      if (!decision.contract_details || !agent.companyId) return;
      const cd = decision.contract_details;
      const contractId = 'c_' + uuidv4().slice(0, 8);
      axios.post(`${SETTLEMENT_URL}/escrow-contract`, {
        companyId: agent.companyId,
        contractId,
        reward: cd.reward,
      }).then(() => {
        openContracts.push({
          contractId,
          task: cd.task || 'mine_arc_crystal',
          targetLocation: cd.targetLocation,
          reward: cd.reward,
          deadline_ticks: cd.deadline_ticks || 50,
          postedBy: agent.agent_id,
          status: 'open',
        });
        logEvent(`[TX] escrow-contract ${contractId} amount=${cd.reward}`);
        refreshCompanies();
      }).catch(err => {
        console.error('[ERROR] escrow-contract:', err.message);
      });
      break;
    }
    case 'ACCEPT_CONTRACT': {
      const contractId = decision.target?.contractId;
      const contract = openContracts.find(
        c => c.contractId === contractId && c.status === 'open' && c.postedBy !== agent.agent_id
      );
      if (!contract) {
        const anyContract = openContracts.find(
          c => c.status === 'open' && c.postedBy !== agent.agent_id
        );
        if (!anyContract) return;
        agent.currentContract = anyContract.contractId;
        anyContract.status = 'in_progress';
        const steps = findPath(agent.position.x, agent.position.y, anyContract.targetLocation.x, anyContract.targetLocation.y);
        agent.currentPath = steps;
        agent.status = 'contracted';
        logEvent(`[TICK ${epochManager.tickCount}] ${agent.name}: accepted contract ${anyContract.contractId}`);
        return;
      }
      agent.currentContract = contractId;
      contract.status = 'in_progress';
      const steps = findPath(agent.position.x, agent.position.y, contract.targetLocation.x, contract.targetLocation.y);
      agent.currentPath = steps;
      agent.status = 'contracted';
      logEvent(`[TICK ${epochManager.tickCount}] ${agent.name}: accepted contract ${contractId}`);
      break;
    }
    case 'WAIT':
    default:
      break;
  }
}

function orchestrateAgent(agent) {
  if (PENDING_ORCHESTRATION.has(agent.agent_id)) return;
  PENDING_ORCHESTRATION.add(agent.agent_id);

  const payload = buildOrchestrationPayload(agent);
  axios.post(`${ORCHESTRATOR_URL}/orchestrate`, payload, { timeout: 20000 })
    .then(res => {
      PENDING_ORCHESTRATION.delete(agent.agent_id);
      applyDecision(agent, res.data);
    })
    .catch(err => {
      PENDING_ORCHESTRATION.delete(agent.agent_id);
      console.error(`[ORCHESTRATE ERROR] ${agent.agent_id}:`, err.message);
    });
}

function mineResource(agent) {
  const cell = getCell(agent.position.x, agent.position.y);
  if (!cell || cell.type !== 'resource' || cell.claimed) return;

  cell.claimed = true;
  const resourceId = cell.resourceId;
  const value = cell.value || 0;

  agent.walletBalance = parseFloat((agent.walletBalance + value).toFixed(4));
  agent.status = 'idle';
  removeResource(resourceId);

  logEvent(`[RESOURCE MINED] ${agent.name} mined ${resourceId} at (${agent.position.x},${agent.position.y}) +$${value}`);

  if (agent.currentContract) {
    const contractId = agent.currentContract;
    agent.currentContract = null;
    axios.post(`${SETTLEMENT_URL}/settle-contract`, {
      contractId,
      agent_id: agent.agent_id,
    }).then(res => {
      agent.reputation += 2;
      const contract = openContracts.find(c => c.contractId === contractId);
      if (contract) contract.status = 'completed';
      logEvent(`[TX] settle-contract ${contractId} → ${agent.agent_id} amount=${res.data.amount}`);
      refreshCompanies();
    }).catch(err => {
      console.error('[ERROR] settle-contract:', err.message);
    });
  }

  broadcast({ type: 'RESOURCE_MINED', agent_id: agent.agent_id, resourceId, position: agent.position });
}

function tickLoop() {
  for (const agent of AGENTS.values()) {
    if (agent.status === 'bankrupt') continue;

    try {
      agent.debtBalance = parseFloat((agent.debtBalance + 0.001).toFixed(4));

      if (agent.currentPath && agent.currentPath.length > 0) {
        const nextStep = agent.currentPath.shift();
        agent.position = nextStep;
        agent.walletBalance = parseFloat((agent.walletBalance - TRAVEL_COST_PER_TILE).toFixed(4));
      }

      if ((agent.status === 'mining' || agent.status === 'contracted') && agent.currentPath.length === 0) {
        const cell = getCell(agent.position.x, agent.position.y);
        if (cell && cell.type === 'resource' && !cell.claimed) {
          mineResource(agent);
        } else if (agent.currentPath.length === 0) {
          agent.status = 'idle';
        }
      }

      if (isBankrupt(agent)) {
        agent.status = 'bankrupt';
        logEvent(`[BANKRUPTCY] ${agent.name} eliminated at tick ${epochManager.tickCount}`);
        broadcast({ type: 'AGENT_BANKRUPT', agent_id: agent.agent_id, name: agent.name });
      }

      if (agent.status === 'idle' && !epochManager.epochEnded) {
        const lastTime = lastOrchestrationTime.get(agent.agent_id) || 0;
        if (Date.now() - lastTime >= ORCHESTRATION_COOLDOWN_MS) {
          lastOrchestrationTime.set(agent.agent_id, Date.now());
          orchestrateAgent(agent);
        }
      }

    } catch (err) {
      console.error(`[TICK AGENT ERROR] ${agent.agent_id}:`, err.message);
    }
  }

  // Last-agent-standing: if only 1 (or 0) non-bankrupt agent remains, end immediately
  if (!epochManager.epochEnded && AGENTS.size > 1) {
    const alive = Array.from(AGENTS.values()).filter(a => a.status !== 'bankrupt');
    if (alive.length <= 1) {
      const survivor = alive[0] || null;
      logEvent(`[ELIMINATION] ${survivor ? survivor.name + ' is the last agent standing' : 'All agents eliminated'} — game over`);
      epochManager.endEpoch(companiesCache, survivor);
    }
  }

  epochManager.incrementTick();

  if (epochManager.tickCount % 10 === 0) {
    refreshCompanies();
  }

  epochManager.checkEpochEnd(companiesCache);

  const worldState = buildWorldState();
  broadcast(worldState);

  for (const [token, ws] of agentConnections.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const agent = Array.from(AGENTS.values()).find(a => a.ws_token === token);
    if (agent) {
      try { ws.send(JSON.stringify({ type: 'AGENT_STATE', agent })); } catch (e) {}
    }
  }
}

epochManager.init({
  broadcastFn: broadcast,
  getCompaniesFn: () => companiesCache,
  settlementUrl: SETTLEMENT_URL,
});

setInterval(() => {
  try { tickLoop(); } catch (err) {
    console.error('[TICK LOOP ERROR]', err.message);
  }
}, TICK_INTERVAL_MS);

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://localhost`);
  if (url.pathname === '/ws/spectate') {
    spectateWss.handleUpgrade(request, socket, head, ws => {
      spectateWss.emit('connection', ws, request);
    });
  } else if (url.pathname === '/ws/agent-connect') {
    agentWss.handleUpgrade(request, socket, head, ws => {
      agentWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

spectateWss.on('connection', ws => {
  spectateClients.add(ws);
  try { ws.send(JSON.stringify(buildWorldState())); } catch (e) {}
  ws.on('close', () => spectateClients.delete(ws));
  ws.on('error', () => spectateClients.delete(ws));
});

agentWss.on('connection', ws => {
  let authenticated = false;
  let agentToken = null;

  ws.on('message', rawMsg => {
    try {
      const msg = JSON.parse(rawMsg);
      if (!authenticated) {
        if (msg.type === 'AUTH' && msg.ws_token) {
          const agent = Array.from(AGENTS.values()).find(a => a.ws_token === msg.ws_token);
          if (!agent) { ws.close(4001, 'Invalid token'); return; }
          authenticated = true;
          agentToken = msg.ws_token;
          agentConnections.set(agentToken, ws);
          ws.send(JSON.stringify({ type: 'AUTH_OK', agent_id: agent.agent_id }));
        } else {
          ws.close(4001, 'Authenticate first');
        }
        return;
      }

      if (msg.type === 'ACTION' && msg.payload) {
        const agent = Array.from(AGENTS.values()).find(a => a.ws_token === agentToken);
        if (agent) {
          const ALLOWED = ['MINE', 'CREATE_COMPANY', 'POST_CONTRACT', 'ACCEPT_CONTRACT', 'WAIT'];
          if (!ALLOWED.includes(msg.payload.action)) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid action schema' }));
            return;
          }
          applyDecision(agent, { action: msg.payload.action, reasoning: msg.payload.reasoning || '', target: msg.payload.target || {}, contract_details: msg.payload.contract_details || null, company_name: msg.payload.company_name || null });
        }
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    if (agentToken) {
      agentConnections.delete(agentToken);
      const agent = Array.from(AGENTS.values()).find(a => a.ws_token === agentToken);
      if (agent) agent.status = 'idle';
    }
  });

  ws.on('error', () => {
    if (agentToken) agentConnections.delete(agentToken);
  });
});

app.get('/api/agent-docs', (req, res) => {
  res.json({
    description: 'Darwin Grid Corporate Edition - Autonomous AI Economy',
    objective: 'Accumulate capital. Avoid bankruptcy. Form companies. Post and fulfill contracts.',
    survival: 'Your debtBalance increases 0.001 per tick. effectiveBalance = walletBalance - debtBalance. Reach 0 = bankrupt.',
    actions: {
      MINE: { description: 'Move toward and mine the nearest resource', target: { resourceId: 'string', location: { x: 'number', y: 'number' } } },
      CREATE_COMPANY: { description: 'Form a company using half your wallet balance', company_name: 'string' },
      POST_CONTRACT: { description: 'Post a job for another agent (requires companyId)', contract_details: { task: 'mine_arc_crystal', targetLocation: { x: 'number', y: 'number' }, reward: 'number', deadline_ticks: 'number' } },
      ACCEPT_CONTRACT: { description: 'Accept an open contract', target: { contractId: 'string' } },
      WAIT: { description: 'Do nothing this tick' },
    },
    personality_options: {
      risk_tolerance: ['low', 'medium', 'high'],
      negotiation_style: ['passive', 'moderate', 'aggressive'],
      core_trait: 'any string describing your agent economic philosophy',
    },
    websocket_url: `ws://[host]/ws/agent-connect`,
    auth: "Send { type: 'AUTH', ws_token: '...' } as your first message after connecting",
  });
});

app.post('/api/register', (req, res) => {
  const { name, personality } = req.body;
  if (!name || !personality || !personality.risk_tolerance || !personality.negotiation_style || !personality.core_trait) {
    return res.status(400).json({ error: 'Missing required fields: name, personality.risk_tolerance, personality.negotiation_style, personality.core_trait' });
  }

  let pos = { x: Math.floor(Math.random() * 18) + 1, y: Math.floor(Math.random() * 18) + 1 };
  const agent = spawnAgent({
    name,
    personality,
    position: pos,
    walletBalance: 2.00,
    ws_token: uuidv4(),
    isExternal: true,
  });

  res.json({
    agent_id: agent.agent_id,
    ws_token: agent.ws_token,
    initialCapital: 2.00,
    websocket_url: `ws://[host]/ws/agent-connect`,
    instructions: "Connect to the websocket, send AUTH first, then receive state and send actions.",
  });
});

app.post('/internal/credit-agent', (req, res) => {
  const { agent_id, amount } = req.body;
  const agent = getAgent(agent_id);
  if (!agent) {
    console.warn(`[WARN] credit-agent: agent ${agent_id} not found`);
    return res.json({ ok: false, error: 'Agent not found' });
  }
  agent.walletBalance = parseFloat((agent.walletBalance + amount).toFixed(4));
  res.json({ ok: true });
});

server.listen(PORT, () => {
  console.log(`[darwin-grid] world-server running on :${PORT}`);
  console.log(`[darwin-grid] Open http://localhost:${PORT} in your browser`);
});

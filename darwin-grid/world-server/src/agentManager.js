const { v4: uuidv4 } = require('uuid');

const AGENTS = new Map();

function createDefaultAgent(config) {
  return {
    agent_id: config.agent_id || uuidv4(),
    name: config.name || 'Unknown',
    personality: config.personality || {
      risk_tolerance: 'medium',
      negotiation_style: 'moderate',
      core_trait: 'opportunist',
    },
    position: config.position || { x: 0, y: 0 },
    walletBalance: config.walletBalance || 2.00,
    debtBalance: 0,
    reputation: 0,
    status: 'idle',
    currentPath: [],
    currentContract: null,
    memory: {
      lastSeenResources: [],
      lastCompletedContracts: [],
      lastDecision: null,
    },
    companyId: null,
    ws_token: config.ws_token || uuidv4(),
    isExternal: config.isExternal || false,
  };
}

function spawnAgent(config) {
  const agent = createDefaultAgent(config);
  AGENTS.set(agent.agent_id, agent);
  return agent;
}

function getAgent(id) {
  return AGENTS.get(id);
}

function updateAgent(id, partial) {
  const agent = AGENTS.get(id);
  if (!agent) return null;
  Object.assign(agent, partial);
  return agent;
}

function removeAgent(id) {
  AGENTS.delete(id);
}

function effectiveBalance(agent) {
  return agent.walletBalance - agent.debtBalance;
}

function isBankrupt(agent) {
  return effectiveBalance(agent) <= 0;
}

spawnAgent({
  agent_id: 'agent_A',
  name: 'Apex',
  position: { x: 1, y: 1 },
  walletBalance: 10.00,
  personality: {
    risk_tolerance: 'low',
    negotiation_style: 'passive',
    core_trait: 'calculated_capitalist',
  },
  ws_token: uuidv4(),
  isExternal: false,
});

spawnAgent({
  agent_id: 'agent_B',
  name: 'Scrappy',
  position: { x: 17, y: 17 },
  walletBalance: 0.50,
  personality: {
    risk_tolerance: 'high',
    negotiation_style: 'aggressive',
    core_trait: 'scrappy_survivor',
  },
  ws_token: uuidv4(),
  isExternal: false,
});

module.exports = {
  AGENTS,
  spawnAgent,
  getAgent,
  updateAgent,
  removeAgent,
  effectiveBalance,
  isBankrupt,
};

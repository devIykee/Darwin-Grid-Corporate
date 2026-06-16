require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const express = require('express');
const axios = require('axios');
const {
  createCompany,
  getCompany,
  updateCompany,
  createEscrow,
  findEscrowByContractId,
  releaseEscrow,
  getAllCompanies,
} = require('./ledger');

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.SETTLEMENT_PORT || '3003', 10);
const WORLD_SERVER_URL = `http://localhost:${process.env.WORLD_SERVER_PORT || 3001}`;

let circleClient = null;
try {
  if (process.env.CIRCLE_API_KEY) {
    const { CircleClient } = require('@circle-fin/circle-sdk');
    circleClient = new CircleClient({
      apiKey: process.env.CIRCLE_API_KEY,
      baseUrl: process.env.CIRCLE_BASE_URL || 'https://api-sandbox.circle.com',
    });
    console.log('[CIRCLE] SDK initialized in sandbox mode');
  } else {
    console.log('[CIRCLE] No API key — running in simulation mode');
  }
} catch (e) {
  console.log('[CIRCLE] SDK unavailable — running in simulation mode:', e.message);
}

async function createCircleWallet(companyName) {
  if (!circleClient) return null;
  try {
    const res = await circleClient.wallets.createWallet({
      idempotencyKey: require('crypto').randomUUID(),
      description: `Darwin Grid: ${companyName}`,
    });
    return res.data?.data?.walletId || null;
  } catch (e) {
    console.error('[CIRCLE] createWallet error:', e.message);
    return null;
  }
}

app.post('/create-company', async (req, res) => {
  try {
    const { agent_id, company_name, initialCapital } = req.body;
    if (!agent_id || !company_name) {
      return res.status(400).json({ error: 'Missing agent_id or company_name' });
    }

    let walletId = null;
    try {
      walletId = await createCircleWallet(company_name);
    } catch (e) {
      console.error('[CIRCLE] Wallet creation failed:', e.message);
    }

    const company = createCompany({ agent_id, company_name, initialCapital: initialCapital || 0, walletId });
    console.log(`[CIRCLE] Created company wallet ${company.walletId} for ${company_name}`);
    res.json({ companyId: company.companyId, walletId: company.walletId, name: company.name, cash: initialCapital || 0 });
  } catch (err) {
    console.error('[SETTLEMENT] /create-company error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/escrow-contract', async (req, res) => {
  try {
    const { companyId, contractId, reward } = req.body;
    const company = getCompany(companyId);
    if (!company) return res.status(400).json({ error: 'Company not found' });
    if (company.cash < reward) return res.status(400).json({ error: 'Insufficient company funds' });

    company.cash -= reward;
    const escrow = createEscrow({ contractId, companyId, amount: reward });
    console.log(`[TX] escrow-contract ${contractId} amount=${reward}`);
    res.json({ escrowId: escrow.escrowId, contractId, amount: reward, status: 'held' });
  } catch (err) {
    console.error('[SETTLEMENT] /escrow-contract error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/settle-contract', async (req, res) => {
  try {
    const { contractId, agent_id } = req.body;
    const escrow = findEscrowByContractId(contractId);
    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
    if (escrow.status !== 'held') return res.status(400).json({ error: 'Escrow not in held state' });

    releaseEscrow(escrow.escrowId);

    try {
      await axios.post(`${WORLD_SERVER_URL}/internal/credit-agent`, {
        agent_id,
        amount: escrow.amount,
      });
    } catch (e) {
      console.error('[SETTLEMENT] credit-agent error:', e.message);
    }

    const company = getCompany(escrow.companyId);
    if (company) {
      company.contractsCompleted = (company.contractsCompleted || 0) + 1;
      company.lifetimeEarnings = (company.lifetimeEarnings || 0) + escrow.amount;
      if (!company.employees.includes(agent_id)) {
        company.employees.push(agent_id);
      }
    }

    console.log(`[TX] settle-contract ${contractId} → ${agent_id} amount=${escrow.amount}`);
    res.json({ settled: true, agent_id, amount: escrow.amount });
  } catch (err) {
    console.error('[SETTLEMENT] /settle-contract error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/final-settlement', async (req, res) => {
  try {
    const companies = getAllCompanies();
    const ranked = companies
      .map(c => ({
        companyId: c.companyId,
        name: c.name,
        cash: c.cash,
        contractsCompleted: c.contractsCompleted || 0,
        capitalEfficiency: c.lifetimeEarnings > 0
          ? parseFloat((c.cash / c.lifetimeEarnings).toFixed(4))
          : 0,
      }))
      .sort((a, b) => b.cash - a.cash);

    console.log('[EPOCH] Final settlement complete');
    res.json(ranked);
  } catch (err) {
    console.error('[SETTLEMENT] /final-settlement error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/companies', (req, res) => {
  res.json(getAllCompanies());
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[darwin-grid] circle-settlement running on :${PORT}`);
});

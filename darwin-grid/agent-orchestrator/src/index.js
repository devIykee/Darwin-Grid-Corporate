require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const express = require('express');
const axios = require('axios');
const { buildSystemPrompt, ALLOWED_ACTIONS } = require('./prompts');

const app = express();
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const MODEL = 'llama-3.1-8b-instant';
const PORT = parseInt(process.env.ORCHESTRATOR_PORT || '3002', 10);

const FALLBACK_DECISION = {
  action: 'WAIT',
  reasoning: 'API error fallback — waiting this tick.',
  target: { resourceId: null, location: null, contractId: null },
  contract_details: null,
  company_name: null,
};

async function callGroq(systemPrompt, userContent, retries = 3) {
  if (!GROQ_API_KEY) {
    console.error('[ORCHESTRATOR] No GROQ_API_KEY set');
    return null;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        `${GROQ_BASE_URL}/chat/completions`,
        {
          model: MODEL,
          max_tokens: 512,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: typeof userContent === 'string' ? userContent : JSON.stringify(userContent) },
          ],
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );
      return response.data.choices[0].message.content.trim();
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 && attempt < retries) {
        const delay = Math.pow(2, attempt) * 2000;
        console.warn(`[ORCHESTRATOR] 429 rate limit — retry ${attempt + 1}/${retries} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  return null;
}

function parseDecision(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!ALLOWED_ACTIONS.includes(parsed.action)) {
      console.warn('[ORCHESTRATOR] Invalid action:', parsed.action);
      return { ...FALLBACK_DECISION, reasoning: `Invalid action: ${parsed.action}` };
    }
    return {
      action: parsed.action,
      reasoning: parsed.reasoning || '',
      target: parsed.target || { resourceId: null, location: null, contractId: null },
      contract_details: parsed.contract_details || null,
      company_name: parsed.company_name || null,
    };
  } catch (e) {
    console.warn('[ORCHESTRATOR] JSON parse error:', e.message, '| Raw:', text?.slice(0, 200));
    return { ...FALLBACK_DECISION, reasoning: 'JSON parse error fallback' };
  }
}

app.post('/orchestrate', async (req, res) => {
  const agentState = req.body;
  try {
    const systemPrompt = buildSystemPrompt(agentState.personality || {});
    const rawText = await callGroq(systemPrompt, agentState);
    const decision = parseDecision(rawText);
    console.log(`[ORCHESTRATOR] agent=${agentState.agent_id} action=${decision.action} | ${decision.reasoning}`);
    res.json(decision);
  } catch (err) {
    console.error('[ORCHESTRATOR] Error:', err.message);
    res.json(FALLBACK_DECISION);
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[darwin-grid] agent-orchestrator running on :${PORT}`);
});

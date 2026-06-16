require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const EPOCH_TICK_LIMIT = parseInt(process.env.EPOCH_TICK_LIMIT || '500', 10);
const EPOCH_NETWORTH_LIMIT = parseFloat(process.env.EPOCH_NETWORTH_LIMIT || '20.00');

let tickCount = 0;
let epochEnded = false;
let _broadcastFn = null;
let _getCompaniesFn = null;
let _settlementUrl = null;

function init({ broadcastFn, getCompaniesFn, settlementUrl }) {
  _broadcastFn = broadcastFn;
  _getCompaniesFn = getCompaniesFn;
  _settlementUrl = settlementUrl;
}

function incrementTick() {
  tickCount++;
}

function checkEpochEnd(companies) {
  if (epochEnded) return false;

  const tickLimitReached = tickCount >= EPOCH_TICK_LIMIT;
  const richCompany = companies && companies.find(c => (c.cash + 0) >= EPOCH_NETWORTH_LIMIT);

  if (tickLimitReached || richCompany) {
    endEpoch(companies);
    return true;
  }
  return false;
}

async function endEpoch(companies) {
  if (epochEnded) return;
  epochEnded = true;
  console.log(`[EPOCH] Epoch ended at tick ${tickCount}`);

  let finalStats = [];
  try {
    const axios = require('axios');
    const res = await axios.post(_settlementUrl + '/final-settlement', {});
    finalStats = res.data || [];
  } catch (err) {
    console.error('[EPOCH] Final settlement error:', err.message);
    finalStats = (companies || []).map(c => ({
      companyId: c.companyId,
      name: c.name,
      cash: c.cash,
      contractsCompleted: c.contractsCompleted || 0,
      capitalEfficiency: c.lifetimeEarnings > 0
        ? (c.cash / c.lifetimeEarnings).toFixed(2)
        : '0.00',
    }));
  }

  const winner = finalStats[0] || null;
  if (_broadcastFn) {
    _broadcastFn({
      type: 'EPOCH_END',
      tickCount,
      winner: winner
        ? {
            companyId: winner.companyId,
            name: winner.name,
            capitalEfficiency: winner.capitalEfficiency,
          }
        : null,
      leaderboard: finalStats,
    });
  }
}

function startEpoch() {
  tickCount = 0;
  epochEnded = false;
}

module.exports = {
  get tickCount() { return tickCount; },
  get epochEnded() { return epochEnded; },
  init,
  incrementTick,
  checkEpochEnd,
  startEpoch,
  endEpoch,
};

const { v4: uuidv4 } = require('uuid');

const COMPANIES = new Map();
const ESCROWS = new Map();

function createCompany({ agent_id, company_name, initialCapital, walletId }) {
  const companyId = 'cw_' + uuidv4().slice(0, 8);
  const company = {
    companyId,
    name: company_name,
    ownerId: agent_id,
    walletId: walletId || ('sim_wallet_' + uuidv4().slice(0, 8)),
    cash: initialCapital || 0,
    assets: [],
    contractsCompleted: 0,
    lifetimeEarnings: initialCapital || 0,
    employees: [],
  };
  COMPANIES.set(companyId, company);
  return company;
}

function getCompany(companyId) {
  return COMPANIES.get(companyId);
}

function updateCompany(companyId, partial) {
  const company = COMPANIES.get(companyId);
  if (!company) return null;
  Object.assign(company, partial);
  return company;
}

function createEscrow({ contractId, companyId, amount }) {
  const escrowId = 'escrow_' + uuidv4().slice(0, 8);
  const escrow = {
    escrowId,
    contractId,
    companyId,
    amount,
    status: 'held',
  };
  ESCROWS.set(escrowId, escrow);
  return escrow;
}

function findEscrowByContractId(contractId) {
  for (const escrow of ESCROWS.values()) {
    if (escrow.contractId === contractId) return escrow;
  }
  return null;
}

function releaseEscrow(escrowId) {
  const escrow = ESCROWS.get(escrowId);
  if (!escrow) return null;
  escrow.status = 'released';
  return escrow;
}

function getAllCompanies() {
  return Array.from(COMPANIES.values());
}

module.exports = {
  COMPANIES,
  ESCROWS,
  createCompany,
  getCompany,
  updateCompany,
  createEscrow,
  findEscrowByContractId,
  releaseEscrow,
  getAllCompanies,
};

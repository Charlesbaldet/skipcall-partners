// Public-API input validation helpers. The whitelists below mirror the
// values the rest of the app accepts (post-v27 normalisation: French
// engagement keys with English aliases tolerated, status values
// bilingual). The DB itself doesn't enforce CHECK constraints on these
// any more, so the API is the gate.

const VALID_REFERRAL_STATUSES = [
  // current French keys
  'new', 'contacted', 'qualified', 'meeting', 'proposal', 'won', 'lost',
  // legacy / French aliases the rest of the app tolerates
  'nouveau', 'contacte', 'contacté', 'qualifie', 'qualifié',
  'gagne', 'gagné', 'perdu',
  'duplicate',
];

const VALID_COMMISSION_STATUSES = [
  'pending_approval', 'awaiting_invoice', 'pending_validation', 'paid',
  'pending', 'approved', 'invoiced',
];

const VALID_ENGAGEMENT_TYPES = [
  'forfait', 'mensuel', 'trimestriel', 'annuel',
  // legacy English keys still accepted at the column level
  'monthly', 'quarterly', 'yearly',
];

const VALID_TEMPERATURES = ['hot', 'warm', 'cold'];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Whitelist of public-API field names a client is allowed to write on
// referrals. The handler maps these to actual DB columns (see
// publicApi.js's REFERRAL_API_TO_DB). NEVER includes tenant_id, id,
// created_at, deleted_at — those are server-controlled.
const REFERRAL_WRITABLE = [
  'prospect_name', 'company_name', 'contact_email', 'contact_phone',
  'status', 'deal_mrr', 'engagement_type', 'engagement_periods',
  'lead_temperature', 'notes', 'external_id', 'partner_id',
];

const PARTNER_WRITABLE = [
  'name', 'contact_name', 'email', 'phone', 'company_website',
  'commission_rate', 'category_id', 'external_id',
];

function sanitizeBody(body, allowedFields) {
  if (!body || typeof body !== 'object') return {};
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => allowedFields.includes(key))
  );
}

function validateStatus(status, validList) {
  if (status == null) return true;
  return typeof status === 'string' && validList.includes(status.toLowerCase());
}

function validateDate(dateStr) {
  if (!dateStr) return true;
  return typeof dateStr === 'string' && DATE_REGEX.test(dateStr);
}

function validateEngagementType(type) {
  if (!type) return true;
  return typeof type === 'string' && VALID_ENGAGEMENT_TYPES.includes(type.toLowerCase());
}

function validateTemperature(temp) {
  if (!temp) return true;
  return typeof temp === 'string' && VALID_TEMPERATURES.includes(temp.toLowerCase());
}

module.exports = {
  VALID_REFERRAL_STATUSES,
  VALID_COMMISSION_STATUSES,
  VALID_ENGAGEMENT_TYPES,
  VALID_TEMPERATURES,
  REFERRAL_WRITABLE,
  PARTNER_WRITABLE,
  sanitizeBody,
  validateStatus,
  validateDate,
  validateEngagementType,
  validateTemperature,
};

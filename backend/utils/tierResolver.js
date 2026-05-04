// Compute a partner's current tier (level) given the tenant's
// tenant_levels rows + the partner's qualifying value. Mirrors the
// JS logic in routes/leaderboard.js so a partner's tier on the deal
// modal matches what the leaderboard shows.
//
// Centralised here so referrals.js, commissions.js, etc. can ask
// for a tier without duplicating the loop / threshold-type rule.

const { query } = require('../db');

const DEFAULT_LEVELS = [
  { name: 'Bronze',   min_threshold: 0,  commission_rate: 10, color: '#cd7f32', icon: '', position: 0 },
  { name: 'Silver',   min_threshold: 5,  commission_rate: 12, color: '#94a3b8', icon: '', position: 1 },
  { name: 'Gold',     min_threshold: 15, commission_rate: 15, color: '#f59e0b', icon: '', position: 2 },
  { name: 'Platinum', min_threshold: 30, commission_rate: 20, color: '#6366f1', icon: '', position: 3 },
];

// Cache levels per tenant for a few seconds so a referrals-list call
// computing tiers across N partners doesn't hit the levels table N
// times. TTL is short — admin-edits in /programme should reflect on
// the next refresh, not on a 5-minute lag.
const LEVELS_TTL_MS = 10 * 1000;
const _levelsCache = new Map();
const _typeCache = new Map();

async function getLevels(tenantId) {
  if (!tenantId) return DEFAULT_LEVELS;
  const cached = _levelsCache.get(tenantId);
  if (cached && Date.now() - cached.at < LEVELS_TTL_MS) return cached.levels;
  const { rows } = await query(
    'SELECT name, min_threshold, commission_rate, color, icon, position FROM tenant_levels WHERE tenant_id = $1 ORDER BY position ASC, min_threshold ASC',
    [tenantId]
  );
  const levels = rows.length ? rows : DEFAULT_LEVELS;
  _levelsCache.set(tenantId, { at: Date.now(), levels });
  return levels;
}

async function getThresholdType(tenantId) {
  if (!tenantId) return 'deals';
  const cached = _typeCache.get(tenantId);
  if (cached && Date.now() - cached.at < LEVELS_TTL_MS) return cached.type;
  try {
    const { rows } = await query('SELECT level_threshold_type FROM tenants WHERE id = $1', [tenantId]);
    const type = (rows[0] && rows[0].level_threshold_type) || 'deals';
    _typeCache.set(tenantId, { at: Date.now(), type });
    return type;
  } catch {
    return 'deals';
  }
}

// Given a value (won-deal count or total volume) + the levels list,
// pick the highest level whose threshold the value still meets.
// Same algorithm as routes/leaderboard.js getLevel().
function pickLevel(value, levels) {
  let level = levels[0];
  for (const l of levels) {
    if (parseFloat(value) >= parseFloat(l.min_threshold)) level = l;
  }
  return level;
}

// resolveTierForPartner({ tenantId, partnerId, wonDeals, totalRevenue })
// → { name, commission_rate, color, icon, position }
async function resolveTierForPartner({ tenantId, partnerId, wonDeals, totalRevenue }) {
  const levels = await getLevels(tenantId);
  const thresholdType = await getThresholdType(tenantId);
  // Caller may have already computed the partner stats. If not, we
  // could query here, but the call sites in referrals.js do bulk
  // joins so they pre-compute. Keeping this branch simple — the
  // direct caller controls the inputs.
  const value = thresholdType === 'volume'
    ? (parseFloat(totalRevenue) || 0)
    : (parseInt(wonDeals, 10) || 0);
  const level = pickLevel(value, levels);
  return {
    name: level.name,
    commission_rate: parseFloat(level.commission_rate),
    color: level.color || null,
    icon: level.icon || null,
    position: level.position,
    threshold_type: thresholdType,
  };
}

// Compute partner tier for a SET of partners in a single bulk query.
// Used by the referrals list endpoint to avoid an N+1 on the
// partner-stats subquery. Returns Map<partnerId, tier>.
async function bulkResolveTiers(tenantId, partnerIds) {
  if (!Array.isArray(partnerIds) || partnerIds.length === 0) return new Map();
  const ids = [...new Set(partnerIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const levels = await getLevels(tenantId);
  const thresholdType = await getThresholdType(tenantId);
  const { rows } = await query(
    `SELECT partner_id,
            COUNT(*) FILTER (WHERE status = 'won')                  AS won_deals,
            COALESCE(SUM(deal_value) FILTER (WHERE status = 'won'), 0) AS total_revenue
       FROM referrals
      WHERE partner_id = ANY($1::uuid[])
        AND deleted_at IS NULL
      GROUP BY partner_id`,
    [ids]
  );
  const stats = new Map(rows.map(r => [r.partner_id, r]));
  const out = new Map();
  for (const id of ids) {
    const s = stats.get(id) || { won_deals: 0, total_revenue: 0 };
    const value = thresholdType === 'volume'
      ? (parseFloat(s.total_revenue) || 0)
      : (parseInt(s.won_deals, 10) || 0);
    const level = pickLevel(value, levels);
    out.set(id, {
      name: level.name,
      commission_rate: parseFloat(level.commission_rate),
      color: level.color || null,
      icon: level.icon || null,
      position: level.position,
      threshold_type: thresholdType,
    });
  }
  return out;
}

// Effective commission rate for a referral row. Override wins;
// otherwise the tier rate flows through. Caller passes the tier
// it already resolved (from bulkResolveTiers or resolveTierForPartner)
// so we don't re-resolve here.
function effectiveRate(referralRow, tier) {
  if (referralRow.commission_overridden && referralRow.commission_rate_override != null) {
    return parseFloat(referralRow.commission_rate_override);
  }
  if (tier && tier.commission_rate != null) return parseFloat(tier.commission_rate);
  // Last fallback: the partner's stored commission_rate. Pre-tier
  // partners (and any data that pre-dates this codepath) still get
  // a sensible number.
  return parseFloat(referralRow.commission_rate) || 0;
}

function invalidateCache(tenantId) {
  if (tenantId) {
    _levelsCache.delete(tenantId);
    _typeCache.delete(tenantId);
  } else {
    _levelsCache.clear();
    _typeCache.clear();
  }
}

module.exports = {
  resolveTierForPartner,
  bulkResolveTiers,
  effectiveRate,
  invalidateCache,
  DEFAULT_LEVELS,
};

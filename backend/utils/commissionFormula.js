// Single source of truth for the commission-amount formula. Used by
// the referrals route when a deal moves to "won" AND mirrored in
// frontend/src/lib/commissionFormula.js for the live forecast on the
// deal card. Any change here MUST be reflected in the FE copy or the
// commissions pipeline will diverge from the forecast users saw on
// the deal card — that's a trust-breaking bug.
//
// Engagement keys are the French ones the UI now writes
// (forfait/mensuel/trimestriel/annuel). Legacy English values
// (monthly/quarterly/yearly) are normalised in the migration but
// also accepted here as a defensive fallback.

const PERIOD_MULTIPLIERS = {
  forfait:     1,   // one-time flat fee
  mensuel:     1,   // ×1 per month
  trimestriel: 3,   // 3 months per quarter
  annuel:      12,  // 12 months per year
  // legacy English aliases, kept until the migration drains them
  monthly:     1,
  quarterly:   3,
  yearly:      12,
};

// Normalise the engagement value so callers don't have to care about
// case / spaces / aliases. Returns null for anything we don't know.
function normalizeEngagement(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return PERIOD_MULTIPLIERS[v] != null ? v : null;
}

// Pure calculator. Returns a number rounded to 2 decimals.
//
// engagementType: 'forfait' | 'mensuel' | 'trimestriel' | 'annuel'
//                 (or legacy monthly/quarterly/yearly)
// periods:        positive integer; coerced to 1 when forfait or
//                 when the input is missing / <= 0.
// dealValue:      MRR/ARR/CA depending on tenant.revenue_model — the
//                 caller passed the right base to start with.
// rate:           commission rate as a percentage (10 means 10%, NOT
//                 0.10).
function calculateCommissionAmount({ engagementType, periods, dealValue, rate }) {
  const value = parseFloat(dealValue) || 0;
  const pct = parseFloat(rate) || 0;
  const norm = normalizeEngagement(engagementType);
  const monthsPerPeriod = norm ? PERIOD_MULTIPLIERS[norm] : 1;
  const safePeriods = norm === 'forfait' ? 1 : Math.max(1, parseInt(periods, 10) || 1);
  const raw = (pct / 100) * value * monthsPerPeriod * safePeriods;
  return Math.round(raw * 100) / 100;
}

module.exports = { calculateCommissionAmount, normalizeEngagement, PERIOD_MULTIPLIERS };

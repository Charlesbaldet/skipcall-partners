// Mirror of backend/utils/commissionFormula.js. Both files MUST stay
// in sync — the deal-card forecast and the commission-pipeline
// amount the admin actually sees in /commissions need to match to
// the cent. If the formulas drift, the admin loses trust in the
// forecast.

export const PERIOD_MULTIPLIERS = {
  forfait:     1,
  mensuel:     1,
  trimestriel: 3,
  annuel:      12,
  // legacy English aliases — the v27 migration normalises stored
  // values, but a freshly-loaded row may still arrive with one of
  // these in transit.
  monthly:     1,
  quarterly:   3,
  yearly:      12,
};

export function normalizeEngagement(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return PERIOD_MULTIPLIERS[v] != null ? v : null;
}

// Returns { amount, multiplier } so the deal card can render both
// the cent value and the "10% × 1500€ × 6 (6 mois)" breakdown
// without recomputing the multiplier in the JSX.
export function calculateCommissionAmount({ engagementType, periods, dealValue, rate }) {
  const value = parseFloat(dealValue) || 0;
  const pct = parseFloat(rate) || 0;
  const norm = normalizeEngagement(engagementType);
  const monthsPerPeriod = norm ? PERIOD_MULTIPLIERS[norm] : 1;
  const safePeriods = norm === 'forfait' ? 1 : Math.max(1, parseInt(periods, 10) || 1);
  const multiplier = monthsPerPeriod * safePeriods;
  const raw = (pct / 100) * value * multiplier;
  return {
    amount: Math.round(raw * 100) / 100,
    multiplier,
    monthsPerPeriod,
    safePeriods,
  };
}

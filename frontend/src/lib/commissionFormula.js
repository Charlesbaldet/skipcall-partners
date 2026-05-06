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

// Mirror of backend/utils/commissionFormula.js::decomposeAmountWithTax.
// Used on the deal-card forecast so the live HT/TVA/TTC preview
// matches the snapshot the payout pipeline writes to the cent.
// taxRate is a percentage (20 means 20 %, NOT 0.20). 0 / null /
// undefined → no VAT, ttc == ht and tax = 0.
export function decomposeAmountWithTax(amountHt, taxRate) {
  const ht = Math.round((parseFloat(amountHt) || 0) * 100) / 100;
  const rate = parseFloat(taxRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { amount_ht: ht, tax_rate: 0, amount_tax: 0, amount_ttc: ht };
  }
  const tax = Math.round(ht * (rate / 100) * 100) / 100;
  const ttc = Math.round((ht + tax) * 100) / 100;
  return { amount_ht: ht, tax_rate: rate, amount_tax: tax, amount_ttc: ttc };
}

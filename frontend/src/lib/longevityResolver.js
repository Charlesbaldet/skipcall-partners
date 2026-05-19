// Mirror of backend/utils/longevityResolver.js. Kept lock-step
// because the FE renders the pill on the Kanban / fiche and the BE
// uses the same function in the E5 billing worker. Any change here
// MUST land in the BE copy in the same commit (same precedent as
// commissionFormula.js).
//
// Pure function — no React, no I/O. Importable from any view.

export function resolveCommissionLongevity(commission, currentTier, now) {
  const c = commission || {};
  if (!c.is_recurring) {
    return { is_perpetual: false, engagement_until: null, status: 'not_recurring' };
  }

  const mode = currentTier && currentTier.longevity_mode === 'lifetime' ? 'lifetime' : 'limited';
  if (mode === 'lifetime') {
    return { is_perpetual: true, engagement_until: null, status: 'lifetime' };
  }

  const wonIso = c.won_date || c.closed_at || c.created_at;
  if (!wonIso) {
    return { is_perpetual: false, engagement_until: null, status: 'expired' };
  }
  const months = currentTier && Number.isFinite(parseInt(currentTier.longevity_months, 10))
    ? parseInt(currentTier.longevity_months, 10)
    : 12;
  const end = new Date(wonIso);
  end.setMonth(end.getMonth() + months);
  const endIso = end.toISOString().slice(0, 10);

  const today = now ? new Date(now) : new Date();
  const expired = end.getTime() < new Date(today.toISOString().slice(0, 10)).getTime();
  return {
    is_perpetual: false,
    engagement_until: endIso,
    status: expired ? 'expired' : 'active',
  };
}

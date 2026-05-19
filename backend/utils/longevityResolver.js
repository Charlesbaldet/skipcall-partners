// Pure resolver for a recurring commission's effective longevity at
// "now", given the partner's CURRENT tier. The decision is strictly
// dynamic in both directions: a tier promotion lifts a previously
// bounded commission to lifetime; a tier demotion pulls a previously
// lifetime commission back to a bounded date (re-anchored on the
// commission's won_date, not on the demotion date). No anti-rollback
// ratchet — that's an explicit product decision.
//
// All inputs are plain values; no I/O. Mirrored in
// frontend/src/lib/longevityResolver.js for the Kanban / fiche
// rendering, and reused by the future E5 billing worker.
//
// Inputs:
//   commission   { won_date|closed_at|created_at, is_recurring }
//   currentTier  { longevity_mode: 'limited'|'lifetime',
//                  longevity_months: int|null }
//
// Output:
//   {
//     is_perpetual:    boolean,
//     engagement_until: 'YYYY-MM-DD' | null,
//     status:          'lifetime' | 'active' | 'expired' | 'not_recurring',
//   }
//
// Notes
//   - Non-recurring commissions short-circuit to status='not_recurring';
//     the caller should NOT render a longevity pill for those.
//   - When mode='limited' and the bounded date is in the past, status
//     is 'expired' — useful for the badge (red "Échu") and for the
//     E5 worker to skip billing.
//   - When tier data is missing/garbled (e.g. a partner with zero
//     won deals before any tier exists), we degrade gracefully:
//     treat as ('limited', 12) — same safe default as the v55
//     backfill.

function resolveCommissionLongevity(commission, currentTier, now) {
  const c = commission || {};
  if (!c.is_recurring) {
    return { is_perpetual: false, engagement_until: null, status: 'not_recurring' };
  }

  const mode = currentTier && currentTier.longevity_mode === 'lifetime' ? 'lifetime' : 'limited';
  if (mode === 'lifetime') {
    return { is_perpetual: true, engagement_until: null, status: 'lifetime' };
  }

  // 'limited' branch — re-anchor on the commission's won date so the
  // bounded window is always (won + N months), regardless of any
  // subsequent tier flip-flop.
  const wonIso = c.won_date || c.closed_at || c.created_at;
  if (!wonIso) {
    // No anchor → treat as expired; the worker shouldn't bill a row
    // with no won timestamp anyway.
    return { is_perpetual: false, engagement_until: null, status: 'expired' };
  }
  const months = currentTier && Number.isFinite(parseInt(currentTier.longevity_months, 10))
    ? parseInt(currentTier.longevity_months, 10)
    : 12;
  const end = new Date(wonIso);
  end.setMonth(end.getMonth() + months);
  const endIso = end.toISOString().slice(0, 10);

  const today = now ? new Date(now) : new Date();
  // Strict comparison on the calendar day. A commission whose end
  // date is "yesterday" is expired; one whose end date is "today" is
  // still active (the partner gets that last cycle).
  const expired = end.getTime() < new Date(today.toISOString().slice(0, 10)).getTime();
  return {
    is_perpetual: false,
    engagement_until: endIso,
    status: expired ? 'expired' : 'active',
  };
}

module.exports = { resolveCommissionLongevity };

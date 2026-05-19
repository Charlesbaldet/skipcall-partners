// Pure derivation of a commission's longevity AT THE WON TRANSITION.
// Called exactly once, when a deal moves to `won` and the commission
// row is created (or re-snapshotted while still `pending_approval`).
// The values returned here are written to the commission row and
// then NEVER recalculated — a later tier promotion or demotion has
// no effect on commissions already engaged. This is the explicit
// product decision behind E2-bis (snapshot-at-won, not dynamic).
//
// No I/O. Sole inputs: the partner's tier resolved at the won moment
// (see utils/tierResolver.resolveTierForPartner), and the won date.
//
//   tier:        { name, longevity_mode: 'limited'|'lifetime',
//                  longevity_months: int|null, ... }
//   wonDateIso:  ISO 8601 string (e.g. closed_at). Falsy → use now.
//
//   → { is_perpetual: bool, engagement_until: 'YYYY-MM-DD'|null,
//       tier_at_won:   string|null }
//
// Defensive: a null/garbled tier falls back to (limited, 12), the
// same safe default as the v55 backfill. A missing month input also
// uses 12 — keeps the function total, no exceptions thrown.

function computeLongevitySnapshotAtWon(tier, wonDateIso) {
  const tierName = tier && tier.name ? tier.name : null;
  // Lifetime branch — only reachable when the caller explicitly
  // passed a tier configured 'lifetime'. A null/garbled tier never
  // falls into this branch.
  if (tier && tier.longevity_mode === 'lifetime') {
    return { is_perpetual: true, engagement_until: null, tier_at_won: tierName };
  }
  // 'limited' branch (and the safe-fallback for null/garbled tier):
  // anchor on the won date + tier.longevity_months months, with 12
  // as the safe-default — same value as the v55 backfill.
  const months = tier && Number.isFinite(parseInt(tier.longevity_months, 10))
    ? parseInt(tier.longevity_months, 10)
    : 12;
  const base = new Date(wonDateIso || new Date());
  base.setMonth(base.getMonth() + months);
  return {
    is_perpetual: false,
    engagement_until: base.toISOString().slice(0, 10),
    tier_at_won: tierName,
  };
}

module.exports = { computeLongevitySnapshotAtWon };

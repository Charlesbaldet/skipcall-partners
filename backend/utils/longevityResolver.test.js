// Run with: node --test backend/utils/longevityResolver.test.js
// (Node 20+ has the built-in test runner; no extra dependency.)

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCommissionLongevity } = require('./longevityResolver');

const TIER_LIFETIME = { longevity_mode: 'lifetime', longevity_months: null };
const TIER_LIMITED_12 = { longevity_mode: 'limited',  longevity_months: 12 };
const TIER_LIMITED_24 = { longevity_mode: 'limited',  longevity_months: 24 };

const NOW = '2026-06-01T12:00:00.000Z';
const WON_2025_06_01 = { is_recurring: true, won_date: '2025-06-01T10:00:00.000Z' };
const WON_2024_01_01 = { is_recurring: true, won_date: '2024-01-01T10:00:00.000Z' };

test('non-recurring commission short-circuits to not_recurring', () => {
  const out = resolveCommissionLongevity(
    { is_recurring: false, won_date: '2025-01-01' },
    TIER_LIFETIME,
    NOW,
  );
  assert.equal(out.status, 'not_recurring');
  assert.equal(out.is_perpetual, false);
  assert.equal(out.engagement_until, null);
});

test('tier promotion Silver→Gold (limited→lifetime) lifts to perpetual', () => {
  const out = resolveCommissionLongevity(WON_2025_06_01, TIER_LIFETIME, NOW);
  assert.equal(out.status, 'lifetime');
  assert.equal(out.is_perpetual, true);
  assert.equal(out.engagement_until, null);
});

test('tier demotion Gold→Silver (lifetime→limited) re-anchors on won_date and stays active when within window', () => {
  // Won 2025-06-01, demoted to limited 12 → ends 2026-06-01. NOW is
  // 2026-06-01 → still active (end >= today).
  const out = resolveCommissionLongevity(WON_2025_06_01, TIER_LIMITED_12, NOW);
  assert.equal(out.status, 'active');
  assert.equal(out.is_perpetual, false);
  assert.equal(out.engagement_until, '2026-06-01');
});

test('tier demotion with end date in the past flips to expired', () => {
  // Won 2024-01-01, limited 12 → ended 2025-01-01. NOW is 2026-06-01.
  const out = resolveCommissionLongevity(WON_2024_01_01, TIER_LIMITED_12, NOW);
  assert.equal(out.status, 'expired');
  assert.equal(out.is_perpetual, false);
  assert.equal(out.engagement_until, '2025-01-01');
});

test('tier change limited→limited with longer window extends end date', () => {
  // Same won, 24-month window → 2026-01-01 → now is 2026-06-01 → expired.
  const out = resolveCommissionLongevity(WON_2024_01_01, TIER_LIMITED_24, NOW);
  assert.equal(out.engagement_until, '2026-01-01');
  assert.equal(out.status, 'expired');
});

test('tier unchanged limited→limited returns same window deterministically', () => {
  const first  = resolveCommissionLongevity(WON_2025_06_01, TIER_LIMITED_12, NOW);
  const second = resolveCommissionLongevity(WON_2025_06_01, TIER_LIMITED_12, NOW);
  assert.deepEqual(first, second);
});

test('missing won anchor on a recurring commission → expired (defensive)', () => {
  const out = resolveCommissionLongevity({ is_recurring: true }, TIER_LIMITED_12, NOW);
  assert.equal(out.status, 'expired');
  assert.equal(out.engagement_until, null);
});

test('garbled tier (null fields) falls back to limited 12', () => {
  const out = resolveCommissionLongevity(WON_2025_06_01, {}, NOW);
  assert.equal(out.is_perpetual, false);
  assert.equal(out.engagement_until, '2026-06-01');
});

test('falsy currentTier degrades to limited 12 anchored on won', () => {
  const out = resolveCommissionLongevity(WON_2025_06_01, null, NOW);
  assert.equal(out.engagement_until, '2026-06-01');
});

test('boundary: end date == today is still active (partner gets the last cycle)', () => {
  // Won 2025-06-01, limited 12 → end 2026-06-01. NOW pinned to 2026-06-01.
  const out = resolveCommissionLongevity(WON_2025_06_01, TIER_LIMITED_12, '2026-06-01T08:00:00.000Z');
  assert.equal(out.status, 'active');
});

test('boundary: end date == yesterday is expired', () => {
  // Won 2025-06-01, limited 12 → end 2026-06-01. NOW pinned to 2026-06-02.
  const out = resolveCommissionLongevity(WON_2025_06_01, TIER_LIMITED_12, '2026-06-02T08:00:00.000Z');
  assert.equal(out.status, 'expired');
});

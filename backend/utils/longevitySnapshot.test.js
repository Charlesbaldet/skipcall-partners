// Run with: node --test backend/utils/longevitySnapshot.test.js
//
// Tests the WON-time derivation (E2-bis snapshot model). The whole
// point of the SNAPSHOT semantic is that nothing recalculates after
// the call returns — so the tests below also assert that two
// independent calls (e.g. a later partner-tier change) don't
// retroactively mutate the first snapshot's output.

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLongevitySnapshotAtWon } = require('./longevitySnapshot');

const TIER_BRONZE  = { name: 'Bronze',   longevity_mode: 'limited',  longevity_months: 12 };
const TIER_SILVER  = { name: 'Silver',   longevity_mode: 'limited',  longevity_months: 24 };
const TIER_GOLD    = { name: 'Gold',     longevity_mode: 'lifetime', longevity_months: null };

const WON_2025_06_01 = '2025-06-01T10:00:00.000Z';

test('lifetime tier → perpetual snapshot, no end date', () => {
  const snap = computeLongevitySnapshotAtWon(TIER_GOLD, WON_2025_06_01);
  assert.equal(snap.is_perpetual, true);
  assert.equal(snap.engagement_until, null);
  assert.equal(snap.tier_at_won, 'Gold');
});

test('limited 12 → engagement_until = won + 12 months', () => {
  const snap = computeLongevitySnapshotAtWon(TIER_BRONZE, WON_2025_06_01);
  assert.equal(snap.is_perpetual, false);
  assert.equal(snap.engagement_until, '2026-06-01');
  assert.equal(snap.tier_at_won, 'Bronze');
});

test('limited 24 → engagement_until = won + 24 months', () => {
  const snap = computeLongevitySnapshotAtWon(TIER_SILVER, WON_2025_06_01);
  assert.equal(snap.engagement_until, '2027-06-01');
  assert.equal(snap.tier_at_won, 'Silver');
});

test('null tier → safe default (limited, 12) with no tier name', () => {
  const snap = computeLongevitySnapshotAtWon(null, WON_2025_06_01);
  assert.equal(snap.is_perpetual, false);
  assert.equal(snap.engagement_until, '2026-06-01');
  assert.equal(snap.tier_at_won, null);
});

test('tier with null longevity_months falls back to 12', () => {
  const snap = computeLongevitySnapshotAtWon(
    { name: 'X', longevity_mode: 'limited', longevity_months: null },
    WON_2025_06_01,
  );
  assert.equal(snap.engagement_until, '2026-06-01');
});

test('missing wonDateIso → uses "now" deterministically', () => {
  // Just assert the shape — date drift over a test run is fine.
  const snap = computeLongevitySnapshotAtWon(TIER_BRONZE, null);
  assert.equal(snap.is_perpetual, false);
  assert.match(snap.engagement_until, /^\d{4}-\d{2}-\d{2}$/);
});

test('SNAPSHOT IMMUTABILITY — calling again with a different tier does NOT mutate the first result', () => {
  // E2-bis central guarantee: a partner promoted Bronze→Gold AFTER
  // the won transition must NOT retroactively turn their existing
  // bounded commission into a lifetime one. The function is pure,
  // so we model this by snapshotting the first output and proving
  // the second call leaves it unchanged. (The persisted commission
  // row is updated by the caller exactly once; this test asserts
  // the property at the function level.)
  const firstSnap = computeLongevitySnapshotAtWon(TIER_BRONZE, WON_2025_06_01);
  const frozenCopy = { ...firstSnap };
  // Simulate a much later "what if" call with a different tier.
  // The first snapshot is plain JSON, but assert deep equality
  // explicitly so a future shared-reference regression is caught.
  computeLongevitySnapshotAtWon(TIER_GOLD, WON_2025_06_01);
  computeLongevitySnapshotAtWon(TIER_SILVER, WON_2025_06_01);
  assert.deepEqual(firstSnap, frozenCopy);
  assert.equal(firstSnap.engagement_until, '2026-06-01');
  assert.equal(firstSnap.is_perpetual, false);
});

test('SNAPSHOT IMMUTABILITY — the returned object does not share state with the tier input', () => {
  // If the function ever returned a reference into the tier object,
  // a later mutation of the tier (e.g. admin edits the level in
  // /programme) could silently change the snapshot. Assert
  // structurally that the output is independent.
  const tier = { ...TIER_BRONZE };
  const snap = computeLongevitySnapshotAtWon(tier, WON_2025_06_01);
  tier.longevity_months = 999;   // simulate post-won admin edit
  tier.name = 'Bronze-renamed';
  assert.equal(snap.engagement_until, '2026-06-01');
  assert.equal(snap.tier_at_won, 'Bronze');
});

test('garbled longevity_months ("abc") falls back to 12', () => {
  const snap = computeLongevitySnapshotAtWon(
    { name: 'X', longevity_mode: 'limited', longevity_months: 'abc' },
    WON_2025_06_01,
  );
  assert.equal(snap.engagement_until, '2026-06-01');
});

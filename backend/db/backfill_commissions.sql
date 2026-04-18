-- One-time backfill for commissions missed by the referrals.js bug
-- where `deal_value > 0` on req.body gated the INSERT, so a status
-- flip to 'won' without a simultaneous deal_value edit never created
-- the commission row.
--
-- Safe to run multiple times — the partial unique index on
-- commissions(referral_id) + the NOT EXISTS guard make it idempotent.
INSERT INTO commissions (referral_id, partner_id, amount, rate, deal_value, tenant_id, status)
SELECT
  r.id,
  r.partner_id,
  (r.deal_value::numeric * p.commission_rate::numeric) / 100 AS amount,
  p.commission_rate,
  r.deal_value,
  r.tenant_id,
  'pending'
FROM referrals r
JOIN partners p ON p.id = r.partner_id
WHERE r.status = 'won'
  AND r.deal_value IS NOT NULL
  AND r.deal_value > 0
  AND NOT EXISTS (SELECT 1 FROM commissions c WHERE c.referral_id = r.id);

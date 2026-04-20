-- Lead ownership + commission approval flow.
-- Idempotent: safe to re-run.

-- Who's driving the lead? 'partner_managed' = the partner handles the
-- sales conversation and is allowed to move the card through the
-- pipeline; 'client_prospect' = the tenant's sales team takes over,
-- partner is read-only for the card.
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS lead_handling VARCHAR(20) DEFAULT 'partner_managed';

-- Commission approval lifecycle, separate from the payment lifecycle
-- in commissions.status. Existing rows default to 'pending' and are
-- treated as pre-approval-flow (effectively approved for payment).
-- New commissions created from the won-stage transition will instead
-- get 'pending_approval' and require an admin click-through before
-- becoming payable.
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_commissions_approval ON commissions(approval_status);

-- Backfill safety: existing referrals stay on partner_managed (the
-- least disruptive default), existing commissions stay on their
-- current status unchanged.
UPDATE referrals SET lead_handling = 'partner_managed' WHERE lead_handling IS NULL;
UPDATE commissions SET approval_status = 'pending' WHERE approval_status IS NULL;

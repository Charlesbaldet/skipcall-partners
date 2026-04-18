-- Billing / Stripe subscription columns on tenants.
-- Idempotent: safe to run multiple times.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'starter';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(200);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(200);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_partner_limit INTEGER DEFAULT 3;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'active';

-- Backfill NULLs on existing rows so every tenant has a known plan.
UPDATE tenants SET plan = 'starter' WHERE plan IS NULL;
UPDATE tenants SET plan_partner_limit = 3 WHERE plan_partner_limit IS NULL;
UPDATE tenants SET payment_status = 'active' WHERE payment_status IS NULL;

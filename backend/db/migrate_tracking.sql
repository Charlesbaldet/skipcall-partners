-- Feature toggles on tenants. All default OFF — each admin opts in.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS feature_referral_links BOOLEAN DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS feature_promo_codes BOOLEAN DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS feature_tracking_script BOOLEAN DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tracking_redirect_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tracking_cookie_days INTEGER DEFAULT 30;

-- Partner-owned unique referral code.
ALTER TABLE partners ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;

-- Promo codes (admin- or partner-managed, unique per tenant).
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  discount_type VARCHAR(20) DEFAULT 'percentage',
  discount_value DECIMAL(10,2) DEFAULT 0,
  description TEXT,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_promo_codes_tenant ON promo_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_partner ON promo_codes(partner_id);

-- Click log for referral links (public, lightweight).
CREATE TABLE IF NOT EXISTS referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  referral_code VARCHAR(20),
  promo_code VARCHAR(50),
  ip_address VARCHAR(45),
  user_agent TEXT,
  referrer_url TEXT,
  landing_page TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_partner ON referral_clicks(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_tenant ON referral_clicks(tenant_id, created_at DESC);

-- Referrals can now trace back to the channel that produced them.
-- `source` already exists in the schema (character varying with default
-- 'manual'); `promo_code_id` and `referral_code_used` are new.
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referral_code_used VARCHAR(20);

-- Backfill referral codes for every existing partner.
UPDATE partners
   SET referral_code = UPPER(CONCAT('REF-', SUBSTRING(MD5(RANDOM()::TEXT || id::TEXT) FROM 1 FOR 6)))
 WHERE referral_code IS NULL;

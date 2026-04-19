-- CRM integrations (HubSpot / Salesforce / generic webhook).
-- Idempotent: safe to re-run.
--
-- NOTE: tenants.id and referrals.id are UUID in this schema, not
-- INTEGER. Using uuid_generate_v4() to match the existing convention.
CREATE TABLE IF NOT EXISTS crm_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,           -- 'hubspot' | 'salesforce' | 'webhook'
  is_active BOOLEAN DEFAULT FALSE,
  access_token TEXT,
  refresh_token TEXT,
  instance_url TEXT,
  webhook_url TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS crm_field_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES crm_integrations(id) ON DELETE CASCADE,
  refboost_field VARCHAR(50) NOT NULL,
  crm_field VARCHAR(100) NOT NULL,
  direction VARCHAR(10) DEFAULT 'push'     -- 'push' | 'pull' | 'both'
);

CREATE TABLE IF NOT EXISTS crm_stage_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES crm_integrations(id) ON DELETE CASCADE,
  refboost_status VARCHAR(30) NOT NULL,
  crm_stage VARCHAR(100) NOT NULL,
  crm_pipeline_id VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS crm_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES crm_integrations(id) ON DELETE CASCADE,
  referral_id UUID,
  action VARCHAR(20) NOT NULL,             -- 'push' | 'pull' | 'error'
  status VARCHAR(20) DEFAULT 'success',
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_integration ON crm_sync_log(integration_id, created_at DESC);

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS crm_deal_id VARCHAR(200);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS crm_synced_at TIMESTAMPTZ;

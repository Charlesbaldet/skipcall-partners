-- ═══════════════════════════════════════════════════════════════════════
-- Notification preferences — per-tenant toggles for in-app + email
-- ═══════════════════════════════════════════════════════════════════════
-- UUID-adapted from spec (existing schema uses UUID, not SERIAL).
-- Run manually: psql "$DATABASE_URL" -f backend/db/migrate_notification_prefs.sql
-- Idempotent: safe to re-run; INSERT … ON CONFLICT DO NOTHING handles the
-- default seeds.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  in_app BOOLEAN NOT NULL DEFAULT TRUE,
  email  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(tenant_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_tenant
  ON notification_preferences(tenant_id);

-- Default preferences for every tenant × known event type. The "news"
-- event defaults to email=false (partners can get a lot of news).
INSERT INTO notification_preferences (tenant_id, event_type, in_app, email)
SELECT t.id, ev.event_type, TRUE, ev.email_default
  FROM tenants t
  CROSS JOIN (VALUES
    ('new_referral',     TRUE),
    ('new_application',  TRUE),
    ('referral_update',  TRUE),
    ('commission',       TRUE),
    ('news',             FALSE),
    ('deal_won',         TRUE),
    ('access_revoked',   TRUE)
  ) AS ev(event_type, email_default)
ON CONFLICT (tenant_id, event_type) DO NOTHING;

COMMIT;

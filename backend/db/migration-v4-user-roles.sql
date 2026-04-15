-- ============================================
-- Skipcall Partners v4 Migration
-- Feature: Multi-role user (1 user can be admin in tenant A AND partner in tenant B)
--
-- Strategy:
--   1. Create user_roles table (many-to-many user <-> role per tenant)
--   2. Backfill from existing users.role / users.tenant_id / users.partner_id
--      (only for valid roles; non-standard ones are skipped to avoid CHECK violations)
--   3. Keep legacy columns on users (deprecated, read-only) for backward compat
--      Will be dropped in a future migration once all code paths are migrated.
--
-- Idempotent: safe to run multiple times.
-- ============================================

-- 1. user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'commercial', 'partner')),
  partner_id UUID REFERENCES partners(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role, tenant_id)
);

-- 2. Indexes for hot-path lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON user_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_tenant ON user_roles(user_id, tenant_id);

-- 3. Backfill from existing users
-- Only valid roles are backfilled. Users with non-standard roles
-- (legacy 'customer', NULL, etc.) are skipped to keep the CHECK constraint clean.
-- The runner will log how many were skipped.
INSERT INTO user_roles (user_id, tenant_id, role, partner_id, is_active)
SELECT id, tenant_id, role, partner_id, COALESCE(is_active, true)
FROM users
WHERE tenant_id IS NOT NULL
  AND role IN ('admin', 'commercial', 'partner')
ON CONFLICT (user_id, role, tenant_id) DO NOTHING;

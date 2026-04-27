-- ═══════════════════════════════════════════════════════════════════════
-- One-off remediation: Augustin BADUEL (augustinbaduel@gmail.com) at
-- tenant Mooniz could not switch back to Mooniz from the space-switcher
-- after a Google SSO login. Root cause: /auth/signup-google never wrote
-- a user_roles row for the tenant it created, so /me/spaces never
-- surfaced Mooniz once he switched away from it.
--
-- Code fix: backend/routes/auth.js now self-heals via ensureUserRoleEntry
-- on every login + signup. This script repairs the existing data.
--
-- Run: psql "$DATABASE_URL" -f backend/db/fix_augustin_mooniz.sql
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Inspect: confirm the user + tenant exist (read-only, just for log).
\echo '── User record ──'
SELECT id, email, full_name, tenant_id, role, is_active
  FROM users
 WHERE LOWER(email) = LOWER('augustinbaduel@gmail.com');

\echo '── Mooniz tenant ──'
SELECT id, name, slug
  FROM tenants
 WHERE LOWER(name) = LOWER('Mooniz');

\echo '── Existing user_roles for this user ──'
SELECT ur.id, ur.tenant_id, t.name AS tenant_name, ur.role, ur.partner_id, ur.is_active
  FROM user_roles ur
  LEFT JOIN tenants t ON t.id = ur.tenant_id
 WHERE ur.user_id = (SELECT id FROM users WHERE LOWER(email) = LOWER('augustinbaduel@gmail.com'))
 ORDER BY ur.created_at;

-- 2. Repair: ensure an active admin user_roles row exists for
--    (Augustin, Mooniz). If a row already exists in any state, flip it
--    back to active. Bails out gracefully if either record is missing.
WITH u AS (
  SELECT id FROM users WHERE LOWER(email) = LOWER('augustinbaduel@gmail.com')
), t AS (
  SELECT id FROM tenants WHERE LOWER(name) = LOWER('Mooniz')
)
INSERT INTO user_roles (user_id, tenant_id, role, partner_id, is_active)
SELECT u.id, t.id, 'admin', NULL, TRUE
  FROM u, t
ON CONFLICT (user_id, role, tenant_id)
DO UPDATE SET is_active = TRUE;

-- 3. Verify post-fix state.
\echo '── user_roles after repair ──'
SELECT ur.id, ur.tenant_id, t.name AS tenant_name, ur.role, ur.partner_id, ur.is_active
  FROM user_roles ur
  LEFT JOIN tenants t ON t.id = ur.tenant_id
 WHERE ur.user_id = (SELECT id FROM users WHERE LOWER(email) = LOWER('augustinbaduel@gmail.com'))
 ORDER BY ur.created_at;

COMMIT;

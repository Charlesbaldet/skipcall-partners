-- The email uniqueness rules RefBoost needs:
--
--   users                  → email is a login credential; stays globally UNIQUE.
--   partners               → same person can partner with multiple tenants,
--                            so unique on (email, tenant_id).
--   partner_applications   → same person can apply to multiple programs,
--                            so unique on (email, tenant_id).
--
-- Before this migration both partners and partner_applications had a
-- UNIQUE (email) constraint, which rejected a second program's
-- application with the same address as the first one's.

BEGIN;

ALTER TABLE partner_applications DROP CONSTRAINT IF EXISTS partner_applications_email_key;
ALTER TABLE partner_applications
  ADD CONSTRAINT partner_applications_email_tenant_unique UNIQUE (email, tenant_id);

ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_email_key;
ALTER TABLE partners
  ADD CONSTRAINT partners_email_tenant_unique UNIQUE (email, tenant_id);

-- users.email intentionally left alone — login keys must stay globally unique.

COMMIT;

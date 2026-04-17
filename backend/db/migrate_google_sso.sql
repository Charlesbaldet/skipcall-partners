-- ═══════════════════════════════════════════════════════════════════════
-- Google SSO column — store the avatar URL from the Google ID token so
-- we can show it in the UI. Existing password flow unchanged.
--
-- Run manually: psql "$DATABASE_URL" -f backend/db/migrate_google_sso.sql
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMIT;

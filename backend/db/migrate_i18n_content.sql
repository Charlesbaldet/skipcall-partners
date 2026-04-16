-- ═══════════════════════════════════════════════════════════════════════
-- i18n content migration
-- ═══════════════════════════════════════════════════════════════════════
-- Adds per-language columns so marketplace descriptions and blog articles
-- can be served localized. The original/French content stays in the base
-- column (short_description, title, content, meta_description) and is
-- used as a fallback whenever a target-language column is NULL/empty.
--
-- Idempotent: safe to re-run. Run against Railway Postgres with e.g.:
--   psql "$DATABASE_URL" -f backend/db/migrate_i18n_content.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── tenants.short_description — marketplace listings ─────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS short_description_en TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS short_description_es TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS short_description_de TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS short_description_it TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS short_description_nl TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS short_description_pt TEXT;

-- ─── partners.description — requested by spec for future use ──────────
-- The partners table has no base `description` column today; add it so
-- localized overrides have something to fall back to.
ALTER TABLE partners ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS description_en TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS description_es TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS description_de TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS description_it TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS description_nl TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS description_pt TEXT;

-- ─── blog_posts — title / content / meta_description ──────────────────
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS title_en TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS title_es TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS title_de TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS title_it TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS title_nl TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS title_pt TEXT;

ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS content_en TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS content_es TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS content_de TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS content_it TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS content_nl TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS content_pt TEXT;

ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_description_en TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_description_es TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_description_de TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_description_it TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_description_nl TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS meta_description_pt TEXT;

COMMIT;

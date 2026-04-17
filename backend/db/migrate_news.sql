-- ═══════════════════════════════════════════════════════════════════════
-- News & Updates migration
-- ═══════════════════════════════════════════════════════════════════════
-- Adapted from the original spec to use UUID primary keys & foreign keys
-- because the rest of the schema (tenants, users, partners, …) uses UUID.
-- Run manually:
--   psql "$DATABASE_URL" -f backend/db/migrate_news.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Social links on the partner record ──────────────────────────────
ALTER TABLE partners ADD COLUMN IF NOT EXISTS social_linkedin  VARCHAR(500);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS social_twitter   VARCHAR(500);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS social_facebook  VARCHAR(500);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS social_instagram VARCHAR(500);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS social_youtube   VARCHAR(500);
ALTER TABLE partners ADD COLUMN IF NOT EXISTS social_website   VARCHAR(500);

-- ─── news_posts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(300) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'update',
  image_url VARCHAR(1000),
  video_url VARCHAR(1000),
  link_url VARCHAR(1000),
  link_label VARCHAR(200),
  is_pinned BOOLEAN DEFAULT false,
  promo_code VARCHAR(100),
  promo_expires_at TIMESTAMPTZ,
  promo_discount VARCHAR(200),
  published_at TIMESTAMPTZ DEFAULT NOW(),
  is_draft BOOLEAN DEFAULT false,
  is_kit BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_posts_tenant    ON news_posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_news_posts_published ON news_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_posts_category  ON news_posts(category);

-- ─── news_attachments ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  news_post_id UUID NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
  filename   VARCHAR(500)  NOT NULL,
  file_url   VARCHAR(1000) NOT NULL,
  file_type  VARCHAR(100),
  file_size  INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_attachments_post ON news_attachments(news_post_id);

-- ─── news_reads (one row per partner user × post) ────────────────────
CREATE TABLE IF NOT EXISTS news_reads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  news_post_id UUID NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(news_post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_news_reads_post ON news_reads(news_post_id);
CREATE INDEX IF NOT EXISTS idx_news_reads_user ON news_reads(user_id);

-- ─── notifications (per user) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'news',
  title VARCHAR(300) NOT NULL,
  message TEXT,
  link VARCHAR(500),
  is_read BOOLEAN DEFAULT false,
  news_post_id UUID REFERENCES news_posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

COMMIT;

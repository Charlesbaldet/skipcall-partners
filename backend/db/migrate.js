const { query } = require('../db');
const crypto = require('crypto');

async function runMigrations() {
  try {
    // v3 tables
    await query(`CREATE TABLE IF NOT EXISTS partner_applications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      company_name VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(50),
      company_website VARCHAR(500),
      company_size VARCHAR(50),
      motivation TEXT,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_by UUID REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await query(`CREATE TABLE IF NOT EXISTS user_invitations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'commercial')),
      token VARCHAR(255) UNIQUE NOT NULL,
      invited_by UUID NOT NULL REFERENCES users(id),
      accepted_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // v4: API Keys table
    await query(`CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      key_hash VARCHAR(64) UNIQUE NOT NULL,
      key_prefix VARCHAR(20) NOT NULL,
      partner_id UUID REFERENCES partners(id),
      created_by UUID NOT NULL REFERENCES users(id),
      is_active BOOLEAN DEFAULT true,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // v5: Add referral_code to partners
    await query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partners' AND column_name = 'referral_code') THEN
        ALTER TABLE partners ADD COLUMN referral_code VARCHAR(20) UNIQUE;
      END IF;
    END $$`);

    // v5: Add source to referrals
    await query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referrals' AND column_name = 'source') THEN
        ALTER TABLE referrals ADD COLUMN source VARCHAR(50) DEFAULT 'manual';
      END IF;
    END $$`);

    // Generate referral codes for partners that don't have one
    const { rows: partners } = await query('SELECT id, name FROM partners WHERE referral_code IS NULL');
    for (const p of partners) {
      const code = p.name.replace(/[^A-Za-z]/g, '').substring(0, 4).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
      try {
        await query('UPDATE partners SET referral_code = $1 WHERE id = $2', [code, p.id]);
      } catch (e) { /* skip if duplicate */ }
    }

    // Indexes
    await query('CREATE INDEX IF NOT EXISTS idx_applications_status ON partner_applications(status)');
    await query('CREATE INDEX IF NOT EXISTS idx_applications_email ON partner_applications(email)');
    await query('CREATE INDEX IF NOT EXISTS idx_invitations_token ON user_invitations(token)');
    await query('CREATE INDEX IF NOT EXISTS idx_invitations_email ON user_invitations(email)');
    await query('CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)');
    await query('CREATE INDEX IF NOT EXISTS idx_partners_referral_code ON partners(referral_code)');

    // UNIQUE constraints
    await query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commissions_referral_id_unique') THEN
        ALTER TABLE commissions ADD CONSTRAINT commissions_referral_id_unique UNIQUE (referral_id);
      END IF;
    END $$`);

    await query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_invitations_email_unique') THEN
        ALTER TABLE user_invitations ADD CONSTRAINT user_invitations_email_unique UNIQUE (email);
      END IF;
    END $$`);

    // v6: Tenant appearance columns (white-label)
    await query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'accent_color') THEN ALTER TABLE tenants ADD COLUMN accent_color VARCHAR(20); END IF; END $$`);
    await query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'logo_url') THEN ALTER TABLE tenants ADD COLUMN logo_url TEXT; END IF; END $$`);
    await query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'settings') THEN ALTER TABLE tenants ADD COLUMN settings JSONB; END IF; END $$`);

    // v7: Programme — tenant_levels + level_threshold_type
    await query(`CREATE TABLE IF NOT EXISTS tenant_levels (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(50) NOT NULL,
      min_threshold NUMERIC(15, 2) NOT NULL DEFAULT 0,
      commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 10,
      color VARCHAR(20),
      icon VARCHAR(10),
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'level_threshold_type') THEN ALTER TABLE tenants ADD COLUMN level_threshold_type VARCHAR(20) DEFAULT 'deals'; END IF; END $$`);
    await query('CREATE INDEX IF NOT EXISTS idx_tenant_levels_tenant ON tenant_levels(tenant_id, position)');

    // v8: Bump old #059669 (emerald-600) to #047857 (emerald-700) for WCAG AA accessibility
    // Only affects tenants still on the old default, not custom colors.
    await query(`UPDATE tenants SET primary_color = '#047857' WHERE primary_color = '#059669' OR primary_color IS NULL`);
    await query(`UPDATE tenants SET accent_color = NULL WHERE accent_color = '#f97316'`);

    // v9: Revert to landing green — user prefers brand consistency
    await query(`UPDATE tenants SET primary_color = '#059669' WHERE primary_color = '#047857' OR primary_color IS NULL`);

    // v10: Force landing green on ALL tenants (user explicit request)
    // Clears any residual custom colors (lime #1ace0d, purple #8b5cf6, etc.)
    await query(`UPDATE tenants SET primary_color = '#059669', secondary_color = '#10b981', accent_color = NULL`);

    
    // ─── v14: apply endpoint rate limit (distributed, multi-worker safe) ───
    await query(`
      CREATE TABLE IF NOT EXISTS apply_rate_limits (
        ip VARCHAR(45) PRIMARY KEY,
        attempt_count INTEGER NOT NULL DEFAULT 1,
        reset_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_apply_rate_limits_reset ON apply_rate_limits (reset_at)`);
    
    // ─── v15: tenant revenue model (MRR / ARR / CA / Other) ───
    await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS revenue_model VARCHAR(20) DEFAULT 'CA'`);
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'revenue_model_check') THEN
          ALTER TABLE tenants ADD CONSTRAINT revenue_model_check CHECK (revenue_model IN ('MRR', 'ARR', 'CA', 'Other'));
        END IF;
      END $$;
    `);

    
  // ─── v16: Password reset tokens ───
  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(128) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token)');
  await query('CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id)');

  // ─── v16: must_change_password column (backup if admin.js migration removed) ───
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false');

  // ─── Seed: auto-populate empty DB (staging / fresh installs) ───
  // Only runs if no tenant exists — safe to keep in production (noop when data exists)
  try {
    const { rows: tenants } = await query('SELECT id FROM tenants LIMIT 1');
    if (tenants.length === 0) {
      console.log(' Empty DB detected — running seed...');
      const bcrypt = require('bcryptjs');
      const { rows: [tenant] } = await query(
        `INSERT INTO tenants (name, slug, primary_color, secondary_color, accent_color, revenue_model)
         VALUES ('Skipcall', 'skipcall', '#059669', '#10b981', NULL, 'CA')
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`
      );
      const hash = await bcrypt.hash('RefBoost2026!', 12);
      await query(
        `INSERT INTO users (email, password_hash, full_name, role, tenant_id, must_change_password)
         VALUES ('admin@skipcall.com', $1, 'Admin Skipcall', 'admin', $2, true)
         ON CONFLICT (email) DO NOTHING`,
        [hash, tenant.id]
      );
      console.log(' Seed complete — admin@skipcall.com / RefBoost2026! (must change on first login)');
    }
  } catch (seedErr) {
    console.warn('[seed] Skipped:', seedErr.message);
  }

  
  // ─── v17: Blog posts table ───
  await query(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      slug VARCHAR(255) UNIQUE NOT NULL,
      title VARCHAR(500) NOT NULL,
      excerpt TEXT,
      content TEXT NOT NULL DEFAULT '',
      author VARCHAR(255) DEFAULT 'RefBoost',
      category VARCHAR(100),
      tags TEXT[] DEFAULT '{}',
      cover_image_url TEXT,
      published BOOLEAN DEFAULT false,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      meta_title VARCHAR(70),
      meta_description VARCHAR(160),
      reading_time_minutes INTEGER DEFAULT 5
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug)');
  await query('CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published, published_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category)');

  
  // ─── v18: Marketplace columns on tenants ───
  await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sector VARCHAR(100)`);
  await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website VARCHAR(255)`);
  await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS icp TEXT`);
  await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS short_description TEXT`);
  await query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS marketplace_visible BOOLEAN DEFAULT false`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tenants_marketplace ON tenants(marketplace_visible) WHERE marketplace_visible = true`);
  console.log('[marketplace] v18 columns added to tenants');

  console.log(' Migrations completed');

  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

module.exports = { runMigrations };

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

    console.log('✅ Migrations completed');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

module.exports = { runMigrations };

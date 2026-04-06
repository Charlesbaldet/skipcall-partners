const { query } = require('../db');

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

    // Indexes
    await query('CREATE INDEX IF NOT EXISTS idx_applications_status ON partner_applications(status)');
    await query('CREATE INDEX IF NOT EXISTS idx_applications_email ON partner_applications(email)');
    await query('CREATE INDEX IF NOT EXISTS idx_invitations_token ON user_invitations(token)');
    await query('CREATE INDEX IF NOT EXISTS idx_invitations_email ON user_invitations(email)');
    await query('CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)');

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

    console.log('✅ Migrations completed');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

module.exports = { runMigrations };

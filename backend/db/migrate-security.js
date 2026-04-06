const { query } = require('../db');

async function runSecurityMigrations() {
  console.log('🔒 Running security & multi-tenant migrations...');

  // ═══ TENANTS TABLE (White-label) ═══
  await query(`CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    domain VARCHAR(255),
    logo_url TEXT,
    primary_color VARCHAR(7) DEFAULT '#6366f1',
    secondary_color VARCHAR(7) DEFAULT '#8b5cf6',
    accent_color VARCHAR(7) DEFAULT '#f59e0b',
    email_from VARCHAR(255),
    email_reply_to VARCHAR(255),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ═══ DEFAULT TENANT ═══
  await query(`INSERT INTO tenants (name, slug, domain, primary_color)
    VALUES ('Skipcall', 'skipcall', 'skipcall-partners.vercel.app', '#6366f1')
    ON CONFLICT (slug) DO NOTHING`);

  // ═══ ADD tenant_id TO ALL TABLES ═══
  const tables = ['users', 'partners', 'referrals', 'commissions', 'conversations', 'api_keys'];
  for (const table of tables) {
    try {
      await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)`);
      // Set default tenant for existing data
      await query(`UPDATE ${table} SET tenant_id = (SELECT id FROM tenants WHERE slug = 'skipcall') WHERE tenant_id IS NULL`);
    } catch (err) {
      if (!err.message.includes('already exists')) console.log(`  ⚠ ${table}: ${err.message}`);
    }
  }

  // ═══ AUDIT LOGS TABLE (ISO 27001 - A.12.4) ═══
  await query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    user_id UUID,
    user_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);

  // ═══ LOGIN ATTEMPTS TABLE (ISO 27001 - A.9.4) ═══
  await query(`CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    ip_address INET,
    success BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, created_at)`);

  // ═══ SESSIONS TABLE (ISO 27001 - A.9.4) ═══
  await query(`CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id),
    token_hash VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)`);

  // ═══ PASSWORD HISTORY (ISO 27001 - A.9.4) ═══
  await query(`CREATE TABLE IF NOT EXISTS password_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ═══ DATA ENCRYPTION FIELDS (ISO 27001 - A.10.1) ═══
  try {
    await query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS iban_encrypted TEXT`);
    await query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS bic_encrypted TEXT`);
  } catch (err) {}

  // ═══ TENANT INDEXES FOR DATA ISOLATION ═══
  for (const table of tables) {
    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`);
    } catch (err) {}
  }

  // ═══ ADD password_changed_at TO USERS ═══
  try {
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NOW()`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`);
  } catch (err) {}

  console.log('✅ Security & multi-tenant migrations complete');
}

module.exports = { runSecurityMigrations };

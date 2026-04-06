/**
 * Migration: Ensure tenant_id is properly set on ALL existing rows.
 * 
 * Run this BEFORE deploying the tenant isolation filters.
 * 
 * What it does:
 * 1. Ensures the default 'skipcall' tenant exists
 * 2. Backfills tenant_id on ALL tables where it's NULL
 * 3. Verifies no orphaned rows remain
 * 
 * Safe to run multiple times (idempotent).
 */

const { query } = require('../db');

async function migrateTenantBackfill() {
  console.log('ð Running tenant_id backfill migration...');

  try {
    // 1. Ensure default tenant exists
    await query(`
      INSERT INTO tenants (name, slug, domain, primary_color)
      VALUES ('Skipcall', 'skipcall', 'skipcall-partners.vercel.app', '#6366f1')
      ON CONFLICT (slug) DO NOTHING
    `);

    // 2. Get default tenant ID
    const { rows: [defaultTenant] } = await query(
      `SELECT id FROM tenants WHERE slug = 'skipcall'`
    );

    if (!defaultTenant) {
      console.error('â Default tenant "skipcall" not found!');
      return;
    }

    const tenantId = defaultTenant.id;
    console.log(`  Default tenant ID: ${tenantId}`);

    // 3. Backfill tenant_id on all tables
    const tables = ['users', 'partners', 'referrals', 'commissions', 'conversations', 'api_keys'];

    for (const table of tables) {
      try {
        // First check if column exists
        const { rows: colCheck } = await query(`
          SELECT 1 FROM information_schema.columns
          WHERE table_name = $1 AND column_name = 'tenant_id'
        `, [table]);

        if (colCheck.length === 0) {
          // Add column if it doesn't exist
          await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)`);
          console.log(`  â Added tenant_id column to ${table}`);
        }

        // Backfill NULL values
        const { rowCount } = await query(
          `UPDATE ${table} SET tenant_id = $1 WHERE tenant_id IS NULL`,
          [tenantId]
        );

        if (rowCount > 0) {
          console.log(`  â ${table}: backfilled ${rowCount} rows`);
        } else {
          console.log(`  â ${table}: all rows already have tenant_id`);
        }
      } catch (err) {
        // Table might not exist yet (e.g., api_keys, conversations)
        if (err.message.includes('does not exist')) {
          console.log(`  â  ${table}: table does not exist, skipping`);
        } else {
          console.error(`  â ${table}: ${err.message}`);
        }
      }
    }

    // 4. Verify â count remaining NULLs
    console.log('\n  Verification:');
    for (const table of tables) {
      try {
        const { rows: [{ count }] } = await query(
          `SELECT COUNT(*) FROM ${table} WHERE tenant_id IS NULL`
        );
        if (parseInt(count) > 0) {
          console.warn(`  â  ${table}: ${count} rows still have NULL tenant_id`);
        } else {
          console.log(`  â ${table}: 0 NULL tenant_id rows`);
        }
      } catch (err) {
        // skip
      }
    }

    // 5. Create indexes if they don't exist
    for (const table of tables) {
      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`);
      } catch (err) {}
    }

    console.log('\nâ Tenant backfill migration complete');
  } catch (err) {
    console.error('â Tenant backfill migration failed:', err);
  }
}

module.exports = { migrateTenantBackfill };

// Allow direct execution: node db/migrate-tenant-backfill.js
if (require.main === module) {
  migrateTenantBackfill().then(() => process.exit(0));
}

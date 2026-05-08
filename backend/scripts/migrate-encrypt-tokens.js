// Run once after deploying TOKEN_ENCRYPTION_KEY env var.
//
// Walks every row that stores an upstream API token (Pennylane API
// key on tenants, Qonto OAuth tokens on payment_integrations,
// HubSpot/Salesforce OAuth tokens on crm_integrations) and re-writes
// the value in encrypted form. The encrypt() helper is a no-op for
// already-encrypted values (they contain a ':' separator the legacy
// fallback in decrypt() recognizes), so re-runs are safe.
//
// Usage:
//   TOKEN_ENCRYPTION_KEY=<hex> node backend/scripts/migrate-encrypt-tokens.js
//
// Generate a key with `openssl rand -hex 32`. Store it in Railway env
// vars before running this script — encrypt() throws if the env var
// isn't set.

require('dotenv').config();
const { query, pool } = require('../db');
const { encrypt } = require('../utils/crypto');

function looksEncrypted(value) {
  if (!value) return true;
  if (typeof value !== 'string') return true;
  if (!value.includes(':')) return false;
  // First segment of an encrypted value is a 32-char hex IV.
  const [iv] = value.split(':');
  return /^[0-9a-fA-F]{32}$/.test(iv);
}

async function migrateTenantsPennylane() {
  const { rows } = await query(
    'SELECT id, pennylane_api_token FROM tenants WHERE pennylane_api_token IS NOT NULL'
  );
  let touched = 0;
  for (const t of rows) {
    if (looksEncrypted(t.pennylane_api_token)) continue;
    const enc = encrypt(t.pennylane_api_token);
    await query('UPDATE tenants SET pennylane_api_token = $1 WHERE id = $2', [enc, t.id]);
    touched++;
  }
  console.log(`[migrate-encrypt-tokens] tenants.pennylane_api_token: ${touched}/${rows.length} re-encrypted`);
}

async function migratePaymentIntegrations() {
  const { rows } = await query(
    `SELECT id, access_token, refresh_token
       FROM payment_integrations
      WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL`
  );
  let touched = 0;
  for (const r of rows) {
    const updates = [];
    const params = [];
    let i = 1;
    if (r.access_token && !looksEncrypted(r.access_token)) {
      updates.push(`access_token = $${i++}`);
      params.push(encrypt(r.access_token));
    }
    if (r.refresh_token && !looksEncrypted(r.refresh_token)) {
      updates.push(`refresh_token = $${i++}`);
      params.push(encrypt(r.refresh_token));
    }
    if (!updates.length) continue;
    params.push(r.id);
    await query(`UPDATE payment_integrations SET ${updates.join(', ')} WHERE id = $${i}`, params);
    touched++;
  }
  console.log(`[migrate-encrypt-tokens] payment_integrations: ${touched}/${rows.length} re-encrypted`);
}

async function migrateCrmIntegrations() {
  const { rows } = await query(
    `SELECT id, access_token, refresh_token
       FROM crm_integrations
      WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL`
  );
  let touched = 0;
  for (const r of rows) {
    const updates = [];
    const params = [];
    let i = 1;
    if (r.access_token && !looksEncrypted(r.access_token)) {
      updates.push(`access_token = $${i++}`);
      params.push(encrypt(r.access_token));
    }
    if (r.refresh_token && !looksEncrypted(r.refresh_token)) {
      updates.push(`refresh_token = $${i++}`);
      params.push(encrypt(r.refresh_token));
    }
    if (!updates.length) continue;
    params.push(r.id);
    await query(`UPDATE crm_integrations SET ${updates.join(', ')} WHERE id = $${i}`, params);
    touched++;
  }
  console.log(`[migrate-encrypt-tokens] crm_integrations: ${touched}/${rows.length} re-encrypted`);
}

(async () => {
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    console.error('TOKEN_ENCRYPTION_KEY not set. Generate with: openssl rand -hex 32');
    process.exit(1);
  }
  try {
    await migrateTenantsPennylane();
    await migratePaymentIntegrations();
    await migrateCrmIntegrations();
    console.log('[migrate-encrypt-tokens] done');
  } catch (err) {
    console.error('[migrate-encrypt-tokens] failed:', err);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
})();

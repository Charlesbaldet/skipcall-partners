// Lazy-creates the per-tenant 'system' user that owns form-originated
// referrals.
//
// Why this exists: referrals.submitted_by is NOT NULL FK → users(id).
// Form submissions are anonymous (filled by the prospect, no logged-in
// user), so there's no obvious user to put in submitted_by. Rather
// than relax the NOT NULL constraint — which would force an audit of
// every read path that assumes non-null — we keep the column tight
// and create a per-tenant synthetic user that acts as the recorded
// submitter for every form submission in that tenant.
//
// Properties of the system user:
//   - role = 'system'        (allowed by v47 CHECK constraint)
//   - is_active = FALSE      (so the super-admin "active users"
//                              aggregates already filter it out)
//   - email = 'system+forms@<slug>.refboost.local'
//                            (.local TLD never resolves; the address
//                              is never deliverable, so a leak via a
//                              "we received a form submission" email
//                              to this address is impossible)
//   - password_hash = bcrypt of crypto-random 32 bytes
//                            (length is the bcrypt cost; nobody knows
//                              the plaintext so the row can never be
//                              used to log in)
//   - tenant_id = the form's tenant
//
// Idempotency: SELECT-first, INSERT only if missing. The unique
// constraint on (tenant_id, email) — implied by the lowercased email
// containing the slug — prevents a race-condition double-INSERT from
// creating two system users; if two requests arrive concurrently,
// one wins, the other catches the 23505 and re-SELECTs.
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../db');

async function ensureSystemUser(tenantId) {
  if (!tenantId) throw new Error('ensureSystemUser: tenantId required');

  // Resolve the slug from the DB rather than trusting whatever the
  // caller knows. Slug is the authoritative tenant identifier and we
  // need a stable email, so we read it once.
  const { rows: tRows } = await query('SELECT slug FROM tenants WHERE id = $1', [tenantId]);
  if (!tRows.length) throw new Error('ensureSystemUser: tenant not found: ' + tenantId);
  const slug = tRows[0].slug;
  const email = `system+forms@${slug}.refboost.local`;

  // Fast path: already exists.
  {
    const { rows } = await query(
      `SELECT id FROM users WHERE tenant_id = $1 AND role = 'system' LIMIT 1`,
      [tenantId]
    );
    if (rows.length) return rows[0].id;
  }

  // Create. INSERT ... ON CONFLICT (email) DO NOTHING covers the
  // unlikely race where two callers create simultaneously.
  const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  // J2-FIX1 — email_verified_at = NOW() : user système interne, jamais
  // de login UI, mais cohérence schéma (et défense en profondeur si
  // le check login devait un jour fonctionner sur is_active=false).
  const { rows: insRows } = await query(
    `INSERT INTO users (email, password_hash, full_name, role, tenant_id, is_active, must_change_password, email_verified_at)
     VALUES ($1, $2, 'RefBoost Forms', 'system', $3, FALSE, FALSE, NOW())
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email, hash, tenantId]
  );
  if (insRows.length) return insRows[0].id;

  // Conflict path: someone else created it between our SELECT and
  // our INSERT. Re-fetch.
  const { rows } = await query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  if (!rows.length) throw new Error('ensureSystemUser: race recovery failed for ' + email);
  return rows[0].id;
}

module.exports = { ensureSystemUser };

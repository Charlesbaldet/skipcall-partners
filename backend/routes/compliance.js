// Compliance dashboard — superadmin-only summary of operational
// security evidence used during SOC 2 / ISO 27001 audits. The
// dashboard reads aggregates so the response is a single JSON
// payload regardless of audit_logs row count.
//
// GET /api/admin/compliance/dashboard
//   {
//     last_audit_date,
//     audit_entries_30d,
//     mfa_adoption_pct,    // null if mfa_enabled column is missing
//     failed_logins_24h,
//     npm_vulns: { high, critical, scanned_at } | null,
//     uptime_s,
//   }

const express = require('express');
const fs = require('fs');
const path = require('path');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Best-effort table create — the optional refresh-npm-audit.js script
// inserts rows here on each scan. Idempotent CREATE IF NOT EXISTS so
// it costs nothing on subsequent boots.
query(`CREATE TABLE IF NOT EXISTS compliance_npm_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  high INTEGER DEFAULT 0,
  critical INTEGER DEFAULT 0,
  raw JSONB
)`).catch(() => { /* table likely already exists or db not reachable yet */ });

router.use(authenticate);
router.use(authorize('superadmin'));

// Parse the most recent `## [Security]` heading from CHANGELOG.md.
// Returns an ISO date string or null. Best-effort — the file may
// not be deployed alongside the API in some environments.
function readLastSecurityAuditDate() {
  try {
    const candidates = [
      path.join(__dirname, '..', '..', 'CHANGELOG.md'),
      path.join(__dirname, '..', 'CHANGELOG.md'),
      path.join(process.cwd(), 'CHANGELOG.md'),
    ];
    let raw = null;
    for (const p of candidates) {
      try {
        raw = fs.readFileSync(p, 'utf8');
        break;
      } catch { /* try next */ }
    }
    if (!raw) return null;
    const m = raw.match(/##\s*\[Security\][^\n]*?(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

router.get('/dashboard', async (req, res) => {
  const out = {
    last_audit_date: null,
    audit_entries_30d: 0,
    mfa_adoption_pct: null,
    failed_logins_24h: 0,
    npm_vulns: null,
    uptime_s: Math.round(process.uptime()),
  };

  out.last_audit_date = readLastSecurityAuditDate();

  // Audit entries in the last 30 days. Wrap in a try/catch so a
  // missing audit_logs table on a stale schema doesn't 500 the
  // whole dashboard.
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS c FROM audit_logs WHERE created_at >= NOW() - INTERVAL '30 days'`
    );
    out.audit_entries_30d = rows[0]?.c || 0;
  } catch (err) {
    console.error('[compliance.audit_entries]', err.message);
  }

  // MFA adoption percentage among admin users. Defensive try/catch
  // around the mfa_enabled column reference because that column is
  // owned by the parallel v43 branch — this branch can ship
  // before/after that one without a 500.
  try {
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE role = 'admin') AS total,
         COUNT(*) FILTER (WHERE role = 'admin' AND mfa_enabled = true) AS with_mfa
       FROM users
       WHERE is_active = true`
    );
    const total = parseInt(rows[0]?.total || 0, 10);
    const withMfa = parseInt(rows[0]?.with_mfa || 0, 10);
    out.mfa_adoption_pct = total > 0 ? Math.round((withMfa * 100) / total) : 0;
  } catch (err) {
    // mfa_enabled column doesn't exist yet — surface as "n/a" rather
    // than 0% so the UI distinguishes "no admins have it" from "we
    // can't measure it". Gives the parallel MFA branch room to land
    // independently.
    out.mfa_adoption_pct = null;
  }

  // Failed logins in the last 24h.
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS c FROM audit_logs
        WHERE action = 'auth.login_failed'
          AND created_at >= NOW() - INTERVAL '24 hours'`
    );
    out.failed_logins_24h = rows[0]?.c || 0;
  } catch (err) {
    console.error('[compliance.failed_logins]', err.message);
  }

  // npm vulnerability snapshot — the latest row in compliance_npm_audit,
  // populated by scripts/refresh-npm-audit.js. Null if the table is
  // empty or doesn't exist yet.
  try {
    const { rows } = await query(
      `SELECT high, critical, scanned_at
         FROM compliance_npm_audit
        ORDER BY scanned_at DESC
        LIMIT 1`
    );
    if (rows.length) {
      out.npm_vulns = {
        high: rows[0].high || 0,
        critical: rows[0].critical || 0,
        scanned_at: rows[0].scanned_at,
      };
    }
  } catch (err) {
    // Table missing — leave npm_vulns null.
  }

  res.json(out);
});

module.exports = router;

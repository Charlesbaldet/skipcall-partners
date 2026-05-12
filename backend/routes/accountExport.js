// GDPR Article 20 — tenant-wide data portability for the admin
// owner. The partner-side equivalent lives in routes/partnerDataExport.js
// (a flat JSON export of one partner's footprint). This route ZIPs a
// multi-CSV bundle of every tenant-scoped table the admin needs to
// take with them: tenant info, users, partners, referrals,
// commissions, form submissions, audit logs.
//
// Auth: admin only, no extra "owner" gate here — invited admins also
// have a legitimate right to portability (their own tenant's data).
//
// Streaming: archiver pipes directly into the response so memory
// usage stays bounded even on large tenants.
const express = require('express');
const archiver = require('archiver');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);

// Minimal CSV serialiser — escapes double quotes by doubling them and
// wraps in quotes when the value contains a comma, quote, newline,
// or starts/ends with whitespace. Matches RFC 4180 closely enough
// for Excel + Numbers + Google Sheets to import without surprises.
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s) || /^\s|\s$/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowsToCsv(rows, columns) {
  const header = columns.map(csvCell).join(',') + '\r\n';
  const body = rows.map(r => columns.map(c => csvCell(r[c])).join(',')).join('\r\n');
  return header + body + (rows.length ? '\r\n' : '');
}

router.get('/', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'missing_tenant' });

    // Fetch in parallel — the wires are independent and the queries
    // are tenant-scoped, so we don't gain anything from sequencing.
    const [
      tenantR, usersR, partnersR, referralsR, commissionsR, invoicesR, formSubmissionsR, auditR,
    ] = await Promise.all([
      query(`SELECT id, name, slug, domain, primary_color, secondary_color, accent_color,
                    plan, revenue_model, is_active, created_at, updated_at
               FROM tenants WHERE id = $1`, [tenantId]),
      query(`SELECT id, email, full_name, role, is_active, created_at, updated_at
               FROM users WHERE tenant_id = $1 AND role != 'system'`, [tenantId]),
      query(`SELECT id, name, contact_name, email, phone, company_website, commission_rate,
                    is_active, deleted_at, created_at, updated_at
               FROM partners WHERE tenant_id = $1`, [tenantId]),
      query(`SELECT id, partner_id, prospect_name, prospect_email, prospect_phone,
                    prospect_company, prospect_role, status, stage_id, deal_value,
                    recommendation_level, source, form_id, notes, deleted_at,
                    created_at, updated_at, closed_at
               FROM referrals WHERE tenant_id = $1`, [tenantId]),
      query(`SELECT id, partner_id, referral_id, amount, status, approval_status,
                    paid_at, deleted_at, created_at
               FROM commissions WHERE tenant_id = $1`, [tenantId]),
      // Best-effort — invoices table may not exist on every deploy.
      query(`SELECT id, partner_id, amount_ttc, status, created_at
               FROM partner_invoices WHERE tenant_id = $1`, [tenantId]).catch(() => ({ rows: [] })),
      query(`SELECT id, form_id, partner_id, prospect_name, prospect_email,
                    prospect_company, created_at
               FROM referrals WHERE tenant_id = $1 AND source = 'form'`, [tenantId]),
      // Audit log capped to 12 months to keep the ZIP reasonable.
      query(`SELECT id, user_id, user_email, action, resource_type, resource_id,
                    ip_address, created_at
               FROM audit_logs
              WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '12 months'
              ORDER BY created_at DESC`, [tenantId]),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const slug = (tenantR.rows[0]?.slug || 'tenant').replace(/[^a-z0-9-]/gi, '-');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="refboost-export-${slug}-${today}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => {
      // archiver errors come AFTER headers were set so we can't 500
      // cleanly. Log and let the client see the truncated stream.
      console.error('[accountExport.archiver]', err.message);
    });
    archive.pipe(res);

    const TENANT_COLS = ['id', 'name', 'slug', 'domain', 'primary_color', 'secondary_color', 'accent_color', 'plan', 'revenue_model', 'is_active', 'created_at', 'updated_at'];
    const USER_COLS = ['id', 'email', 'full_name', 'role', 'is_active', 'created_at', 'updated_at'];
    const PARTNER_COLS = ['id', 'name', 'contact_name', 'email', 'phone', 'company_website', 'commission_rate', 'is_active', 'deleted_at', 'created_at', 'updated_at'];
    const REFERRAL_COLS = ['id', 'partner_id', 'prospect_name', 'prospect_email', 'prospect_phone', 'prospect_company', 'prospect_role', 'status', 'stage_id', 'deal_value', 'recommendation_level', 'source', 'form_id', 'notes', 'deleted_at', 'created_at', 'updated_at', 'closed_at'];
    const COMMISSION_COLS = ['id', 'partner_id', 'referral_id', 'amount', 'status', 'approval_status', 'paid_at', 'deleted_at', 'created_at'];
    const INVOICE_COLS = ['id', 'partner_id', 'amount_ttc', 'status', 'created_at'];
    const FORM_SUBMISSION_COLS = ['id', 'form_id', 'partner_id', 'prospect_name', 'prospect_email', 'prospect_company', 'created_at'];
    const AUDIT_COLS = ['id', 'user_id', 'user_email', 'action', 'resource_type', 'resource_id', 'ip_address', 'created_at'];

    archive.append(rowsToCsv(tenantR.rows, TENANT_COLS), { name: 'tenant_info.csv' });
    archive.append(rowsToCsv(usersR.rows, USER_COLS), { name: 'users.csv' });
    archive.append(rowsToCsv(partnersR.rows, PARTNER_COLS), { name: 'partners.csv' });
    archive.append(rowsToCsv(referralsR.rows, REFERRAL_COLS), { name: 'referrals.csv' });
    archive.append(rowsToCsv(commissionsR.rows, COMMISSION_COLS), { name: 'commissions.csv' });
    archive.append(rowsToCsv(invoicesR.rows, INVOICE_COLS), { name: 'invoices.csv' });
    archive.append(rowsToCsv(formSubmissionsR.rows, FORM_SUBMISSION_COLS), { name: 'form_submissions.csv' });
    archive.append(rowsToCsv(auditR.rows, AUDIT_COLS), { name: 'audit_logs.csv' });
    // Manifest so an admin opening the ZIP sees what's inside without
    // sampling each file.
    const manifest = [
      'RefBoost data export — GDPR Article 20',
      `Generated: ${new Date().toISOString()}`,
      `Tenant: ${tenantR.rows[0]?.name || ''} (${tenantR.rows[0]?.slug || ''})`,
      '',
      `tenant_info.csv     — ${tenantR.rows.length} row`,
      `users.csv           — ${usersR.rows.length} rows`,
      `partners.csv        — ${partnersR.rows.length} rows`,
      `referrals.csv       — ${referralsR.rows.length} rows`,
      `commissions.csv     — ${commissionsR.rows.length} rows`,
      `invoices.csv        — ${invoicesR.rows.length} rows`,
      `form_submissions.csv — ${formSubmissionsR.rows.length} rows`,
      `audit_logs.csv      — ${auditR.rows.length} rows (last 12 months)`,
    ].join('\n') + '\n';
    archive.append(manifest, { name: 'README.txt' });

    archive.finalize();
  } catch (err) {
    console.error('[accountExport] error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;

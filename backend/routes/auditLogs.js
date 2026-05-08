// GET /api/audit-logs — paginated, filterable feed of admin actions
// for the Settings → Historique tab. Tenant-scoped except for
// superadmin (skipTenantFilter); admin/superadmin only.

const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(tenantScope);
router.use(authorize('admin', 'superadmin'));

// Filter pill → list of action names / patterns. Mirrors the chips
// rendered in the Historique tab. `prefix` matches `action LIKE
// 'prefix%'`, `equals` matches an exact action.
const ACTION_TYPE_FILTERS = {
  partners:    { prefix: ['partner.'] },
  commissions: { prefix: ['commission.'] },
  settings:    { equals: ['settings.updated', 'billing.updated'] },
  security:    { equals: [
    'auth.login', 'auth.login_failed',
    'auth.mfa_enabled', 'auth.mfa_disabled', 'auth.mfa_failed',
    'session.invalidated',
  ] },
};

function applyActionTypeClause(actionType, where, params, i) {
  const cfg = ACTION_TYPE_FILTERS[actionType];
  if (!cfg) return i;
  const ors = [];
  for (const p of cfg.prefix || []) {
    ors.push(`al.action LIKE $${i++}`);
    params.push(p + '%');
  }
  if (cfg.equals && cfg.equals.length) {
    const placeholders = cfg.equals.map(() => `$${i++}`);
    ors.push(`al.action IN (${placeholders.join(', ')})`);
    params.push(...cfg.equals);
  }
  if (ors.length) where.push('(' + ors.join(' OR ') + ')');
  return i;
}

function buildFilters(req) {
  const where = [];
  const params = [];
  let i = 1;
  if (!req.skipTenantFilter) {
    if (!req.tenantId) return { error: 'tenant_missing' };
    where.push(`al.tenant_id = $${i++}`);
    params.push(req.tenantId);
  }
  if (req.query.from) {
    where.push(`al.created_at >= $${i++}`);
    params.push(req.query.from);
  }
  if (req.query.to) {
    where.push(`al.created_at <= $${i++}`);
    params.push(req.query.to);
  }
  if (req.query.action) {
    where.push(`al.action = $${i++}`);
    params.push(req.query.action);
  }
  if (req.query.userId) {
    where.push(`al.user_id = $${i++}`);
    params.push(req.query.userId);
  }
  if (req.query.action_type) {
    i = applyActionTypeClause(req.query.action_type, where, params, i);
  }
  return {
    whereClause: where.length ? 'WHERE ' + where.join(' AND ') : '',
    params,
    nextIndex: i,
  };
}

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
    const offset = (page - 1) * pageSize;

    const filt = buildFilters(req);
    if (filt.error) return res.status(400).json({ error: filt.error });
    const { whereClause, params } = filt;
    let i = filt.nextIndex;

    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM audit_logs al ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    const listParams = [...params, pageSize, offset];
    const { rows } = await query(
      `SELECT al.id,
              al.tenant_id,
              al.user_id,
              al.action,
              COALESCE(al.entity_type, al.resource_type) AS entity_type,
              COALESCE(al.entity_id, al.resource_id)     AS entity_id,
              al.details,
              al.ip_address,
              al.user_agent,
              al.created_at,
              COALESCE(u.full_name, al.user_email) AS user_name,
              COALESCE(u.email, al.user_email)     AS user_email
         FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
         ${whereClause}
     ORDER BY al.created_at DESC
        LIMIT $${i++} OFFSET $${i++}`,
      listParams
    );

    res.json({
      logs: rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error('[auditLogs.list]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// CSV export — same filters as GET /, no pagination, hard cap of
// 50 000 rows so a wide-open superadmin query can't blow heap.
// Streams via res.write so the response starts quickly even on
// the largest tenants.
const EXPORT_HARD_CAP = 50000;

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : (v instanceof Date ? v.toISOString() : JSON.stringify(v));
  // Quote if it contains a comma, quote, newline or carriage return.
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

router.get('/export', async (req, res) => {
  try {
    const filt = buildFilters(req);
    if (filt.error) return res.status(400).json({ error: filt.error });
    const { whereClause, params } = filt;

    const { rows } = await query(
      `SELECT al.created_at,
              COALESCE(u.email, al.user_email) AS user_email,
              COALESCE(u.full_name, al.user_email) AS user_name,
              al.action,
              COALESCE(al.entity_type, al.resource_type) AS entity_type,
              COALESCE(al.entity_id, al.resource_id)     AS entity_id,
              al.ip_address,
              al.details
         FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
         ${whereClause}
     ORDER BY al.created_at DESC
        LIMIT ${EXPORT_HARD_CAP}`,
      params
    );

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="refboost-audit-log-${stamp}.csv"`
    );

    res.write('date,user_email,user_name,action,entity_type,entity_id,ip_address,details_json\n');
    for (const r of rows) {
      res.write([
        csvEscape(r.created_at),
        csvEscape(r.user_email),
        csvEscape(r.user_name),
        csvEscape(r.action),
        csvEscape(r.entity_type),
        csvEscape(r.entity_id),
        csvEscape(r.ip_address),
        csvEscape(r.details),
      ].join(',') + '\n');
    }
    res.end();
  } catch (err) {
    console.error('[auditLogs.export]', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
    else res.end();
  }
});

module.exports = router;

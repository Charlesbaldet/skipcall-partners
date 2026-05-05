// ────────────────────────────────────────────────────────────────────
// Public REST API — mounted at /api/v1.
//
// Authenticated via API key (Authorization: Bearer sk_…). All routes
// are tenant-scoped through req.tenantId set by apiKeyAuth.
//
// Field-name mapping vs. DB columns:
//   API name           DB column
//   prospect_name      prospect_name
//   company_name       prospect_company
//   contact_email      prospect_email
//   contact_phone      prospect_phone
//   deal_mrr           deal_value
//   engagement_type    engagement
//   lead_temperature   recommendation_level
//   notes              notes
//   external_id        external_id (added v30)
//
// Legacy partner-scoped behaviour: API keys created with a
// `partner_id` (the old self-service path) keep returning ONLY that
// partner's data on read endpoints. New tenant-wide keys (partner_id
// NULL) see everything inside their tenant.
// ────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { apiKeyAuth, requirePermission } = require('../middleware/apiKeyAuth');
const {
  sanitizeBody, validateStatus, validateDate, validateEngagementType, validateTemperature,
  VALID_REFERRAL_STATUSES, VALID_COMMISSION_STATUSES,
  REFERRAL_WRITABLE, PARTNER_WRITABLE,
} = require('../middleware/apiValidation');
const { validateWebhookUrl } = require('../middleware/webhookValidation');
const { sendWebhookEvent, generateSecret } = require('../services/webhookService');

// ─── Express setup ──────────────────────────────────────────────────
router.use(express.json({ limit: '1mb' }));

// CORS — clients call from their own backends so we allow any origin.
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

router.use(apiKeyAuth);

// ─── DB column mapping (public-API name → DB column) ────────────────
const REFERRAL_API_TO_DB = {
  prospect_name: 'prospect_name',
  company_name: 'prospect_company',
  contact_email: 'prospect_email',
  contact_phone: 'prospect_phone',
  status: 'status',
  deal_mrr: 'deal_value',
  engagement_type: 'engagement',
  engagement_periods: 'engagement_periods',
  lead_temperature: 'recommendation_level',
  notes: 'notes',
  external_id: 'external_id',
  partner_id: 'partner_id',
};

// ─── Formatters ─────────────────────────────────────────────────────
function formatReferral(row) {
  return {
    id: row.id,
    prospect_name: row.prospect_name,
    company_name: row.prospect_company,
    contact_email: row.prospect_email,
    contact_phone: row.prospect_phone,
    status: row.status,
    deal_mrr: parseFloat(row.deal_value) || 0,
    engagement_type: row.engagement,
    engagement_periods: parseInt(row.engagement_periods) || 1,
    commission_rate: row.commission_rate_override != null
      ? parseFloat(row.commission_rate_override)
      : null,
    lead_temperature: row.recommendation_level,
    notes: row.notes,
    external_id: row.external_id,
    partner: row.partner_id ? {
      id: row.partner_id,
      name: row.partner_name || null,
      contact_name: row.partner_contact_name || null,
    } : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    closed_at: row.closed_at,
  };
}

function formatPartner(row) {
  return {
    id: row.id,
    name: row.name,
    contact_name: row.contact_name,
    email: row.email,
    phone: row.phone,
    company_website: row.company_website,
    commission_rate: parseFloat(row.commission_rate) || 0,
    category_id: row.category_id || null,
    is_active: row.is_active,
    referral_code: row.referral_code,
    external_id: row.external_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function formatCommission(row) {
  return {
    id: row.id,
    referral_id: row.referral_id,
    partner_id: row.partner_id,
    amount: parseFloat(row.amount) || 0,
    rate: parseFloat(row.rate) || 0,
    deal_value: parseFloat(row.deal_value) || 0,
    status: row.status,
    engagement_type: row.engagement_type,
    engagement_periods: parseInt(row.engagement_periods) || 1,
    has_invoice: !!row.invoice_url,
    invoice_filename: row.invoice_filename || null,
    paid_at: row.paid_at,
    approved_at: row.approved_at,
    created_at: row.created_at,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

// Page/per_page → LIMIT/OFFSET. per_page capped at 100.
function paginate(sql, params, page, perPage) {
  const p = Math.max(1, parseInt(page) || 1);
  const pp = Math.min(100, Math.max(1, parseInt(perPage) || 20));
  const offset = (p - 1) * pp;
  return {
    sql: `${sql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    params: [...params, pp, offset],
    page: p,
    perPage: pp,
  };
}

// Returns the count for a SELECT query by swapping the projection for
// COUNT(*). Works for our queries because we only ever build them with
// a leading `SELECT ... FROM`. ORDER BY / LIMIT haven't been appended
// yet at the call site.
async function countRows(sqlBeforeOrder, params) {
  const countSql = sqlBeforeOrder.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) AS total FROM');
  const { rows } = await query(countSql, params);
  return parseInt(rows[0]?.total || 0);
}

function buildDateFilters(sql, params, q, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  const fields = [
    ['created_after',  '>=', 'created_at', false],
    ['created_before', '<=', 'created_at', true],
    ['updated_after',  '>=', 'updated_at', false],
    ['updated_before', '<=', 'updated_at', true],
  ];
  for (const [key, op, col, endOfDay] of fields) {
    const v = q[key];
    if (!v) continue;
    if (!validateDate(v)) {
      const err = new Error('invalid_date_format');
      err.code = 'invalid_date_format';
      throw err;
    }
    params.push(endOfDay ? v + 'T23:59:59' : v);
    sql += ` AND ${prefix}${col} ${op} $${params.length}`;
  }
  return sql;
}

// Adds the partner-scope filter (legacy behaviour) on top of the
// already-tenant-scoped query.
function applyPartnerScope(sql, params, partnerCol, req) {
  if (req.partnerId) {
    params.push(req.partnerId);
    sql += ` AND ${partnerCol} = $${params.length}`;
  }
  return sql;
}

// ────────────────────────────────────────────────────────────────────
// READ ENDPOINTS
// ────────────────────────────────────────────────────────────────────

router.get('/referrals', requirePermission('read'), async (req, res) => {
  try {
    const params = [req.tenantId];
    let sql = `
      SELECT r.id, r.prospect_name, r.prospect_company, r.prospect_email, r.prospect_phone,
             r.status, r.deal_value, r.engagement, r.engagement_periods,
             r.commission_rate_override, r.recommendation_level, r.notes,
             r.external_id, r.partner_id, r.created_at, r.updated_at, r.closed_at,
             p.name AS partner_name, p.contact_name AS partner_contact_name
        FROM referrals r
        LEFT JOIN partners p ON p.id = r.partner_id
       WHERE r.tenant_id = $1 AND r.deleted_at IS NULL`;

    sql = applyPartnerScope(sql, params, 'r.partner_id', req);

    if (req.query.status) {
      if (!validateStatus(req.query.status, VALID_REFERRAL_STATUSES)) {
        return res.status(400).json({ error: 'invalid_status', message: 'Unknown status value.' });
      }
      params.push(req.query.status.toLowerCase());
      sql += ` AND LOWER(r.status) = $${params.length}`;
    }
    if (req.query.partner_id) {
      params.push(req.query.partner_id);
      sql += ` AND r.partner_id = $${params.length}`;
    }
    if (req.query.external_id) {
      params.push(req.query.external_id);
      sql += ` AND r.external_id = $${params.length}`;
    }
    try { sql = buildDateFilters(sql, params, req.query, 'r'); }
    catch (e) { return res.status(400).json({ error: 'invalid_date_format', message: 'Dates must be YYYY-MM-DD.' }); }

    const total = await countRows(sql, params);
    sql += ' ORDER BY r.created_at DESC';
    const pag = paginate(sql, params, req.query.page, req.query.per_page);
    const { rows } = await query(pag.sql, pag.params);

    res.json({
      data: rows.map(formatReferral),
      meta: { total, page: pag.page, per_page: pag.perPage, total_pages: Math.ceil(total / pag.perPage) },
    });
  } catch (err) {
    console.error('[api/v1] GET /referrals:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Internal server error.' });
  }
});

router.get('/referrals/:id', requirePermission('read'), async (req, res) => {
  try {
    const params = [req.params.id, req.tenantId];
    let sql = `
      SELECT r.*, p.name AS partner_name, p.contact_name AS partner_contact_name
        FROM referrals r
        LEFT JOIN partners p ON p.id = r.partner_id
       WHERE r.id = $1 AND r.tenant_id = $2 AND r.deleted_at IS NULL`;
    sql = applyPartnerScope(sql, params, 'r.partner_id', req);
    const { rows } = await query(sql, params);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ data: formatReferral(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/partners', requirePermission('read'), async (req, res) => {
  try {
    const params = [req.tenantId];
    let sql = `SELECT * FROM partners WHERE tenant_id = $1 AND deleted_at IS NULL`;
    // Partner-scoped keys can only see themselves on this endpoint.
    if (req.partnerId) {
      params.push(req.partnerId);
      sql += ` AND id = $${params.length}`;
    }
    if (req.query.category_id) {
      params.push(req.query.category_id);
      sql += ` AND category_id = $${params.length}`;
    }
    if (req.query.external_id) {
      params.push(req.query.external_id);
      sql += ` AND external_id = $${params.length}`;
    }
    try { sql = buildDateFilters(sql, params, req.query); }
    catch { return res.status(400).json({ error: 'invalid_date_format' }); }

    const total = await countRows(sql, params);
    sql += ' ORDER BY created_at DESC';
    const pag = paginate(sql, params, req.query.page, req.query.per_page);
    const { rows } = await query(pag.sql, pag.params);
    res.json({
      data: rows.map(formatPartner),
      meta: { total, page: pag.page, per_page: pag.perPage, total_pages: Math.ceil(total / pag.perPage) },
    });
  } catch (err) {
    console.error('[api/v1] GET /partners:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/partners/:id', requirePermission('read'), async (req, res) => {
  try {
    const params = [req.params.id, req.tenantId];
    let sql = `SELECT * FROM partners WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`;
    if (req.partnerId) {
      params.push(req.partnerId);
      sql += ` AND id = $${params.length}`;
    }
    const { rows } = await query(sql, params);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ data: formatPartner(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/commissions', requirePermission('read'), async (req, res) => {
  try {
    const params = [req.tenantId];
    let sql = `
      SELECT c.* FROM commissions c
       WHERE c.tenant_id = $1 AND c.deleted_at IS NULL`;
    sql = applyPartnerScope(sql, params, 'c.partner_id', req);

    if (req.query.status) {
      if (!validateStatus(req.query.status, VALID_COMMISSION_STATUSES)) {
        return res.status(400).json({ error: 'invalid_status' });
      }
      params.push(req.query.status.toLowerCase());
      sql += ` AND LOWER(c.status) = $${params.length}`;
    }
    if (req.query.partner_id) {
      params.push(req.query.partner_id);
      sql += ` AND c.partner_id = $${params.length}`;
    }
    if (req.query.referral_id) {
      params.push(req.query.referral_id);
      sql += ` AND c.referral_id = $${params.length}`;
    }
    try { sql = buildDateFilters(sql, params, req.query, 'c'); }
    catch { return res.status(400).json({ error: 'invalid_date_format' }); }

    const total = await countRows(sql, params);
    sql += ' ORDER BY c.created_at DESC';
    const pag = paginate(sql, params, req.query.page, req.query.per_page);
    const { rows } = await query(pag.sql, pag.params);
    res.json({
      data: rows.map(formatCommission),
      meta: { total, page: pag.page, per_page: pag.perPage, total_pages: Math.ceil(total / pag.perPage) },
    });
  } catch (err) {
    console.error('[api/v1] GET /commissions:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/commissions/:id', requirePermission('read'), async (req, res) => {
  try {
    const params = [req.params.id, req.tenantId];
    let sql = `SELECT * FROM commissions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`;
    if (req.partnerId) {
      params.push(req.partnerId);
      sql += ` AND partner_id = $${params.length}`;
    }
    const { rows } = await query(sql, params);
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ data: formatCommission(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

// ─── Program — tenant + tiers + pipeline stages ─────────────────────
router.get('/program', requirePermission('read'), async (req, res) => {
  try {
    const [{ rows: tenantRows }, { rows: tiers }, { rows: stages }] = await Promise.all([
      query('SELECT id, name, slug, revenue_model, level_threshold_type FROM tenants WHERE id = $1', [req.tenantId]),
      query('SELECT name, min_threshold, commission_rate, position FROM tenant_levels WHERE tenant_id = $1 ORDER BY position ASC, min_threshold ASC', [req.tenantId]),
      query('SELECT name, slug, position, is_won, is_lost FROM pipeline_stages WHERE tenant_id = $1 ORDER BY position ASC', [req.tenantId]),
    ]);
    if (!tenantRows.length) return res.status(404).json({ error: 'not_found' });
    const t = tenantRows[0];
    res.json({
      data: {
        company_name: t.name,
        slug: t.slug,
        revenue_model: t.revenue_model || 'MRR',
        threshold_type: t.level_threshold_type || 'deals',
        tiers: tiers.map(r => ({
          name: r.name,
          min_threshold: parseFloat(r.min_threshold) || 0,
          commission_rate: parseFloat(r.commission_rate) || 0,
          position: r.position,
        })),
        pipeline_stages: stages.map(s => ({ name: s.name, slug: s.slug, position: s.position, is_won: s.is_won, is_lost: s.is_lost })),
        engagement_types: ['forfait', 'mensuel', 'trimestriel', 'annuel'],
      },
    });
  } catch (err) {
    console.error('[api/v1] GET /program:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ─── Stats — tenant-wide aggregates ─────────────────────────────────
router.get('/stats', requirePermission('read'), async (req, res) => {
  try {
    const params = [req.tenantId];
    let dateClause = '';
    try {
      // Slot the date filters straight into the WHERE — no leading
      // " AND " stripping needed since buildDateFilters already builds
      // "AND col >= $N" fragments.
      const before = ' AND r.tenant_id = $1';
      const after = buildDateFilters(before, params, req.query, 'r');
      dateClause = after.slice(before.length); // just the appended bits
    } catch { return res.status(400).json({ error: 'invalid_date_format' }); }

    const partnerScope = req.partnerId ? ` AND r.partner_id = '${req.partnerId.replace(/'/g, "''")}'` : '';

    const { rows: [stats] } = await query(`
      SELECT
        COUNT(*)::int                                                                AS total_referrals,
        COUNT(*) FILTER (WHERE r.status IN ('new','nouveau'))::int                   AS new_referrals,
        COUNT(*) FILTER (WHERE r.status NOT IN ('won','gagne','gagné','lost','perdu'))::int AS active_pipeline,
        COUNT(*) FILTER (WHERE r.status IN ('won','gagne','gagné'))::int             AS won_deals,
        COALESCE(SUM(r.deal_value) FILTER (WHERE r.status IN ('won','gagne','gagné')), 0)::numeric AS total_mrr
      FROM referrals r
      WHERE r.tenant_id = $1 AND r.deleted_at IS NULL${dateClause}${partnerScope}
    `, params);

    const cParams = [req.tenantId];
    const cPartnerScope = req.partnerId ? ` AND c.partner_id = '${req.partnerId.replace(/'/g, "''")}'` : '';
    const { rows: [comm] } = await query(`
      SELECT
        COALESCE(SUM(c.amount), 0)::numeric                                         AS total_commissions,
        COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'paid'), 0)::numeric        AS commissions_paid,
        COALESCE(SUM(c.amount) FILTER (WHERE c.status <> 'paid'), 0)::numeric       AS commissions_pending
      FROM commissions c
      WHERE c.tenant_id = $1 AND c.deleted_at IS NULL${cPartnerScope}
    `, cParams);

    const { rows: [partners] } = await query(
      `SELECT COUNT(*)::int AS active_partners FROM partners WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active = true`,
      [req.tenantId]
    );

    const totalRef = parseInt(stats.total_referrals) || 0;
    const wonDeals = parseInt(stats.won_deals) || 0;
    res.json({
      data: {
        total_referrals: totalRef,
        new_referrals: parseInt(stats.new_referrals) || 0,
        active_pipeline: parseInt(stats.active_pipeline) || 0,
        won_deals: wonDeals,
        total_mrr: parseFloat(stats.total_mrr) || 0,
        total_commissions: parseFloat(comm.total_commissions) || 0,
        commissions_paid: parseFloat(comm.commissions_paid) || 0,
        commissions_pending: parseFloat(comm.commissions_pending) || 0,
        conversion_rate: totalRef > 0 ? Math.round((wonDeals / totalRef) * 1000) / 10 : 0,
        active_partners: parseInt(partners.active_partners) || 0,
      },
    });
  } catch (err) {
    console.error('[api/v1] GET /stats:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ────────────────────────────────────────────────────────────────────
// WRITE ENDPOINTS
// ────────────────────────────────────────────────────────────────────

router.post('/referrals', requirePermission('write'), async (req, res) => {
  try {
    const body = sanitizeBody(req.body, REFERRAL_WRITABLE);

    if (!body.prospect_name && !body.company_name) {
      return res.status(400).json({ error: 'missing_field', message: 'prospect_name or company_name is required.' });
    }
    if (body.status && !validateStatus(body.status, VALID_REFERRAL_STATUSES)) {
      return res.status(400).json({ error: 'invalid_status' });
    }
    if (body.engagement_type && !validateEngagementType(body.engagement_type)) {
      return res.status(400).json({ error: 'invalid_engagement_type' });
    }
    if (body.lead_temperature && !validateTemperature(body.lead_temperature)) {
      return res.status(400).json({ error: 'invalid_lead_temperature' });
    }

    // Partner-scoped keys can only create referrals for themselves —
    // ignore any partner_id in the body and substitute the bound one.
    if (req.partnerId) {
      body.partner_id = req.partnerId;
    } else if (body.partner_id) {
      const { rows: p } = await query(
        'SELECT id FROM partners WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [body.partner_id, req.tenantId]
      );
      if (!p.length) return res.status(400).json({ error: 'partner_not_found', message: 'Partner does not belong to this tenant.' });
    }

    if (body.external_id) {
      const { rows: dup } = await query(
        'SELECT id FROM referrals WHERE tenant_id = $1 AND external_id = $2 AND deleted_at IS NULL',
        [req.tenantId, body.external_id]
      );
      if (dup.length) {
        return res.status(409).json({ error: 'duplicate_external_id', existing_id: dup[0].id });
      }
    }

    const dealValue = parseFloat(body.deal_mrr) || 0;
    let periods = parseInt(body.engagement_periods) || 1;
    const engagement = (body.engagement_type || 'mensuel').toLowerCase();
    if (engagement === 'forfait') periods = 1;

    const { rows } = await query(
      `INSERT INTO referrals
         (tenant_id, partner_id, prospect_name, prospect_company, prospect_email, prospect_phone,
          status, deal_value, engagement, engagement_periods, recommendation_level, notes,
          external_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
       RETURNING *`,
      [
        req.tenantId,
        body.partner_id || null,
        body.prospect_name || body.company_name || '',
        body.company_name || '',
        body.contact_email || null,
        body.contact_phone || null,
        (body.status || 'new').toLowerCase(),
        dealValue,
        engagement,
        periods,
        (body.lead_temperature || 'warm').toLowerCase(),
        body.notes || null,
        body.external_id || null,
      ]
    );

    const referral = formatReferral(rows[0]);
    sendWebhookEvent(req.tenantId, 'referral.created', { referral }).catch(() => {});
    res.status(201).json({ data: referral });
  } catch (err) {
    console.error('[api/v1] POST /referrals:', err.message);
    if (err.code === '23505') return res.status(409).json({ error: 'duplicate', message: err.message });
    res.status(500).json({ error: 'server_error' });
  }
});

router.put('/referrals/:id', requirePermission('write'), async (req, res) => {
  try {
    const params0 = [req.params.id, req.tenantId];
    let lookup = `SELECT * FROM referrals WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`;
    if (req.partnerId) { params0.push(req.partnerId); lookup += ` AND partner_id = $${params0.length}`; }
    const { rows: existing } = await query(lookup, params0);
    if (!existing.length) return res.status(404).json({ error: 'not_found' });

    // Strip partner_id when the key is partner-scoped — it can't move
    // a deal away from itself.
    const writable = req.partnerId ? REFERRAL_WRITABLE.filter(f => f !== 'partner_id') : REFERRAL_WRITABLE;
    const body = sanitizeBody(req.body, writable);
    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'no_fields', message: 'No valid fields to update.' });
    }
    if (body.status && !validateStatus(body.status, VALID_REFERRAL_STATUSES)) {
      return res.status(400).json({ error: 'invalid_status' });
    }
    if (body.engagement_type && !validateEngagementType(body.engagement_type)) {
      return res.status(400).json({ error: 'invalid_engagement_type' });
    }
    if (body.lead_temperature && !validateTemperature(body.lead_temperature)) {
      return res.status(400).json({ error: 'invalid_lead_temperature' });
    }
    if (body.partner_id) {
      const { rows: p } = await query(
        'SELECT id FROM partners WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [body.partner_id, req.tenantId]
      );
      if (!p.length) return res.status(400).json({ error: 'partner_not_found' });
    }

    if (body.engagement_type === 'forfait') body.engagement_periods = 1;

    // Map API field names → DB columns and build the SET clause.
    const setClauses = [];
    const params = [req.tenantId, req.params.id];
    for (const [apiKey, value] of Object.entries(body)) {
      const dbCol = REFERRAL_API_TO_DB[apiKey];
      if (!dbCol) continue;
      params.push(value);
      setClauses.push(`${dbCol} = $${params.length}`);
    }
    setClauses.push('updated_at = NOW()');

    let updateSql = `UPDATE referrals SET ${setClauses.join(', ')} WHERE id = $2 AND tenant_id = $1 AND deleted_at IS NULL`;
    if (req.partnerId) { params.push(req.partnerId); updateSql += ` AND partner_id = $${params.length}`; }
    updateSql += ' RETURNING *';
    const { rows } = await query(updateSql, params);

    const oldStatus = existing[0].status;
    const newStatus = rows[0].status;
    const referral = formatReferral(rows[0]);

    if (oldStatus !== newStatus) {
      sendWebhookEvent(req.tenantId, 'referral.status_changed', {
        referral_id: rows[0].id,
        old_status: oldStatus,
        new_status: newStatus,
        deal_mrr: parseFloat(rows[0].deal_value) || 0,
      }).catch(() => {});
      if (['won', 'gagne', 'gagné'].includes((newStatus || '').toLowerCase())) {
        sendWebhookEvent(req.tenantId, 'referral.won', { referral }).catch(() => {});
      } else if (['lost', 'perdu'].includes((newStatus || '').toLowerCase())) {
        sendWebhookEvent(req.tenantId, 'referral.lost', { referral }).catch(() => {});
      }
    }
    sendWebhookEvent(req.tenantId, 'referral.updated', { referral }).catch(() => {});

    res.json({ data: referral });
  } catch (err) {
    console.error('[api/v1] PUT /referrals/:id:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// Convenience: PUT /referrals/:id/status — body { "status": "won" }.
router.put('/referrals/:id/status', requirePermission('write'), async (req, res, next) => {
  if (!req.body || typeof req.body.status !== 'string') {
    return res.status(400).json({ error: 'missing_field', message: 'status is required.' });
  }
  // Re-route through the main handler with only `status` in the body.
  req.body = { status: req.body.status };
  // Manually invoke the PUT handler logic above.
  req.url = `/referrals/${req.params.id}`;
  req.method = 'PUT';
  router.handle(req, res, next);
});

router.post('/partners', requirePermission('write'), async (req, res) => {
  if (req.partnerId) {
    return res.status(403).json({ error: 'forbidden', message: 'Partner-scoped keys cannot create partners.' });
  }
  try {
    const body = sanitizeBody(req.body, PARTNER_WRITABLE);
    if (!body.email) {
      return res.status(400).json({ error: 'missing_field', message: 'email is required.' });
    }
    if (body.external_id) {
      const { rows: dup } = await query(
        'SELECT id FROM partners WHERE tenant_id = $1 AND external_id = $2 AND deleted_at IS NULL',
        [req.tenantId, body.external_id]
      );
      if (dup.length) return res.status(409).json({ error: 'duplicate_external_id', existing_id: dup[0].id });
    }
    const { rows: emailDup } = await query(
      'SELECT id FROM partners WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) AND deleted_at IS NULL',
      [req.tenantId, body.email]
    );
    if (emailDup.length) {
      return res.status(409).json({ error: 'duplicate_email', existing_id: emailDup[0].id });
    }

    const { rows } = await query(
      `INSERT INTO partners
         (tenant_id, name, contact_name, email, phone, company_website, commission_rate, category_id, external_id, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW())
       RETURNING *`,
      [
        req.tenantId,
        body.name || body.contact_name || body.email,
        body.contact_name || null,
        body.email,
        body.phone || null,
        body.company_website || null,
        parseFloat(body.commission_rate) || 0,
        body.category_id || null,
        body.external_id || null,
      ]
    );

    const partner = formatPartner(rows[0]);
    sendWebhookEvent(req.tenantId, 'partner.created', { partner }).catch(() => {});
    res.status(201).json({ data: partner });
  } catch (err) {
    console.error('[api/v1] POST /partners:', err.message);
    if (err.code === '23505') return res.status(409).json({ error: 'duplicate', message: err.message });
    res.status(500).json({ error: 'server_error' });
  }
});

router.put('/partners/:id', requirePermission('write'), async (req, res) => {
  try {
    const params0 = [req.params.id, req.tenantId];
    let lookup = `SELECT * FROM partners WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`;
    if (req.partnerId) { params0.push(req.partnerId); lookup += ` AND id = $${params0.length}`; }
    const { rows: existing } = await query(lookup, params0);
    if (!existing.length) return res.status(404).json({ error: 'not_found' });

    const body = sanitizeBody(req.body, PARTNER_WRITABLE);
    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'no_fields' });
    }
    const setClauses = [];
    const params = [req.tenantId, req.params.id];
    for (const [key, value] of Object.entries(body)) {
      params.push(value);
      setClauses.push(`${key} = $${params.length}`);
    }
    setClauses.push('updated_at = NOW()');
    let sql = `UPDATE partners SET ${setClauses.join(', ')} WHERE id = $2 AND tenant_id = $1 AND deleted_at IS NULL`;
    if (req.partnerId) { params.push(req.partnerId); sql += ` AND id = $${params.length}`; }
    sql += ' RETURNING *';
    const { rows } = await query(sql, params);
    res.json({ data: formatPartner(rows[0]) });
  } catch (err) {
    console.error('[api/v1] PUT /partners/:id:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ────────────────────────────────────────────────────────────────────
// WEBHOOK MANAGEMENT (atop existing webhook_endpoints table)
// ────────────────────────────────────────────────────────────────────
const VALID_WEBHOOK_EVENTS = require('../services/webhookService').EVENT_TYPES || [
  'referral.created', 'referral.updated', 'referral.status_changed',
  'referral.won', 'referral.lost',
  'partner.registered', 'partner.approved', 'partner.created',
  'commission.created', 'commission.approved', 'commission.paid',
];
const MAX_WEBHOOKS_PER_TENANT = 10;

router.get('/webhooks', requirePermission('read'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, url, events, is_active, created_at, updated_at
         FROM webhook_endpoints WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.tenantId]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/webhooks', requirePermission('write'), async (req, res) => {
  try {
    const { url, events } = req.body || {};
    if (!url || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'missing_fields', message: 'url and events[] are required.' });
    }
    try { await validateWebhookUrl(url); }
    catch (e) { return res.status(400).json({ error: 'invalid_webhook_url', message: e.message }); }

    const invalid = events.filter(e => !VALID_WEBHOOK_EVENTS.includes(e));
    if (invalid.length) {
      return res.status(400).json({ error: 'invalid_events', invalid_events: invalid, valid_events: VALID_WEBHOOK_EVENTS });
    }

    const { rows: countRows } = await query(
      'SELECT COUNT(*)::int AS c FROM webhook_endpoints WHERE tenant_id = $1 AND is_active = true',
      [req.tenantId]
    );
    if ((countRows[0]?.c || 0) >= MAX_WEBHOOKS_PER_TENANT) {
      return res.status(400).json({ error: 'webhook_limit', message: `Maximum ${MAX_WEBHOOKS_PER_TENANT} active webhooks per account.` });
    }

    const secret = generateSecret();
    const { rows } = await query(
      `INSERT INTO webhook_endpoints (tenant_id, url, secret, events, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, url, events, is_active, created_at`,
      [req.tenantId, url, secret, events]
    );
    res.status(201).json({
      data: { ...rows[0], secret },
      message: 'Webhook created. Save the secret — it will not be shown again.',
    });
  } catch (err) {
    console.error('[api/v1] POST /webhooks:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

router.delete('/webhooks/:id', requirePermission('write'), async (req, res) => {
  try {
    const { rowCount } = await query(
      'UPDATE webhook_endpoints SET is_active = false WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;

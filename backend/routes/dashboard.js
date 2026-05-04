const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, partnerScope, tenantScope } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);
router.use(tenantScope);
router.use(partnerScope);

// Parse optional ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD. Returns null
// (no date filter) when missing or malformed — backwards compatible.
function parseDateRange(req) {
  const { start_date, end_date } = req.query;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (start_date && re.test(start_date) && end_date && re.test(end_date)) {
    return { startDate: start_date, endDate: end_date };
  }
  return null;
}

// Helper: build tenant + partner + optional date filter clauses.
// `opts.skipDate` skips date injection (e.g. for endpoints that already
// own their date logic, like /timeline).
function buildFilters(req, tableAlias = 'r', partnerCol = 'partner_id', opts = {}) {
  const where = [];
  const params = [];
  let i = 1;

  if (req.tenantId && !req.skipTenantFilter) {
    where.push(`${tableAlias}.tenant_id = $${i++}`);
    params.push(req.tenantId);
  }
  if (req.partnerScope) {
    where.push(`${tableAlias}.${partnerCol} = $${i++}`);
    params.push(req.partnerScope);
  }
  if (!opts.skipDate) {
    const range = parseDateRange(req);
    if (range) {
      const dateCol = opts.dateCol || 'created_at';
      where.push(`${tableAlias}.${dateCol} >= $${i++}::date`);
      params.push(range.startDate);
      where.push(`${tableAlias}.${dateCol} < ($${i++}::date + INTERVAL '1 day')`);
      params.push(range.endDate);
    }
  }
  return { where, params, i };
}

// ─── Main KPIs ───
router.get('/kpis', async (req, res) => {
  try {
    const { where, params } = buildFilters(req, 'r');
    const partnerFilter = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows: [kpis] } = await query(
      `SELECT
        COUNT(*) as total_referrals,
        COUNT(CASE WHEN r.status = 'new' THEN 1 END) as new_count,
        COUNT(CASE WHEN r.status NOT IN ('won', 'lost') THEN 1 END) as active_count,
        COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won_count,
        COUNT(CASE WHEN r.status = 'lost' THEN 1 END) as lost_count,
        COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN r.status NOT IN ('won', 'lost') THEN r.deal_value END), 0) as pipeline_value,
        CASE WHEN COUNT(CASE WHEN r.status IN ('won','lost') THEN 1 END) > 0
          THEN ROUND(COUNT(CASE WHEN r.status = 'won' THEN 1 END)::numeric / COUNT(CASE WHEN r.status IN ('won','lost') THEN 1 END) * 100, 1)
          ELSE 0 END as win_rate
       FROM referrals r
       ${partnerFilter}`,
      params
    );

    // Total commissions
    const { where: comWhere, params: comParams } = buildFilters(req, 'c');
    const comFilter = comWhere.length ? 'WHERE ' + comWhere.join(' AND ') : '';

    const { rows: [comKpis] } = await query(
      `SELECT
        COALESCE(SUM(amount), 0) as total_commission,
        COALESCE(SUM(CASE WHEN status IN ('pending_approval','awaiting_invoice','pending_validation') THEN amount END), 0) as pending_commission,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) as paid_commission
       FROM commissions c
       ${comFilter}`,
      comParams
    );

    res.json({ ...kpis, ...comKpis });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Referrals over time (for charts) ───
// When start_date/end_date are supplied, they win over `?months=`.
router.get('/timeline', async (req, res) => {
  try {
    const range = parseDateRange(req);
    const { months = 6 } = req.query;

    const where = [];
    const params = [];
    let i = 1;

    if (range) {
      where.push(`r.created_at >= $${i++}::date`);
      params.push(range.startDate);
      where.push(`r.created_at < ($${i++}::date + INTERVAL '1 day')`);
      params.push(range.endDate);
    } else {
      where.push(`r.created_at >= NOW() - ($${i++} || ' months')::interval`);
      params.push(months);
    }

    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`r.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }
    if (req.partnerScope) {
      where.push(`r.partner_id = $${i++}`);
      params.push(req.partnerScope);
    }

    const { rows } = await query(
      `SELECT TO_CHAR(DATE_TRUNC('month', r.created_at), 'YYYY-MM') as month,
              COUNT(*) as total,
              COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won,
              COUNT(CASE WHEN r.status = 'lost' THEN 1 END) as lost,
              COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value END), 0) as revenue
       FROM referrals r
       WHERE ${where.join(' AND ')}
       GROUP BY DATE_TRUNC('month', r.created_at)
       ORDER BY month`,
      params
    );
    res.json({ timeline: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Pipeline breakdown by status ───
router.get('/pipeline', async (req, res) => {
  try {
    const { where, params } = buildFilters(req, 'r');
    const partnerFilter = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT r.status, COUNT(*) as count,
              COALESCE(SUM(r.deal_value), 0) as value
       FROM referrals r
       ${partnerFilter}
       GROUP BY r.status
       ORDER BY CASE r.status
         WHEN 'new' THEN 1 WHEN 'contacted' THEN 2 WHEN 'meeting' THEN 3
         WHEN 'proposal' THEN 4 WHEN 'won' THEN 5 WHEN 'lost' THEN 6
       END`,
      params
    );
    res.json({ pipeline: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Top partners ranking ───
// Date range filters joined referrals (so the ranking reflects activity
// within the window), but partners with zero hits in that window still
// appear via LEFT JOIN with the date predicate in the ON clause.
router.get('/top-partners', authorize('admin', 'commercial'), async (req, res) => {
  try {
    const where = ['p.is_active = true'];
    const params = [];
    let i = 1;

    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`p.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    let joinDate = '';
    const range = parseDateRange(req);
    if (range) {
      joinDate = ` AND r.created_at >= $${i}::date AND r.created_at < ($${i + 1}::date + INTERVAL '1 day')`;
      params.push(range.startDate, range.endDate);
      i += 2;
    }

    const { rows } = await query(
      `SELECT p.id, p.name, p.commission_rate,
              COUNT(r.id) as total_referrals,
              COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won_deals,
              COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value END), 0) as revenue,
              CASE WHEN COUNT(CASE WHEN r.status IN ('won','lost') THEN 1 END) > 0
                THEN ROUND(COUNT(CASE WHEN r.status = 'won' THEN 1 END)::numeric / COUNT(CASE WHEN r.status IN ('won','lost') THEN 1 END) * 100, 1)
                ELSE 0 END as win_rate
       FROM partners p
       LEFT JOIN referrals r ON p.id = r.partner_id${joinDate}
       WHERE ${where.join(' AND ')}
       GROUP BY p.id
       ORDER BY revenue DESC LIMIT 10`,
      params
    );
    res.json({ topPartners: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Recommendation level distribution ───
router.get('/levels', async (req, res) => {
  try {
    const { where, params } = buildFilters(req, 'r');
    const partnerFilter = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT r.recommendation_level as level,
              COUNT(*) as count,
              COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won
       FROM referrals r
       ${partnerFilter}
       GROUP BY r.recommendation_level`,
      params
    );
    res.json({ levels: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

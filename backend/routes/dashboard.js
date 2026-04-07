const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, partnerScope, tenantScope } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);
router.use(tenantScope);
router.use(partnerScope);

// Helper: build tenant + partner filter clauses
function buildFilters(req, tableAlias = 'r', partnerCol = 'partner_id') {
  const where = [];
  const params = [];
  let i = 1;

  // Tenant isolation (via JOIN with partners)
  if (req.tenantId && !req.skipTenantFilter) {
    where.push(`${tableAlias}.tenant_id = $${i++}`);
    params.push(req.tenantId);
  }

  // Partner scope
  if (req.partnerScope) {
    where.push(`${tableAlias}.${partnerCol} = $${i++}`);
    params.push(req.partnerScope);
  }

  return { where, params, i };
}

// âââ Main KPIs âââ
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
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END), 0) as pending_commission,
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

// âââ Referrals over time (for charts) âââ
router.get('/timeline', async (req, res) => {
  try {
    const { months = 6 } = req.query;

    let where = [`r.created_at >= NOW() - ($1 || ' months')::interval`];
    let params = [months];
    let i = 2;

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

// âââ Pipeline breakdown by status âââ
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

// âââ Top partners ranking âââ
router.get('/top-partners', authorize('admin', 'commercial'), async (req, res) => {
  try {
    let where = ['p.is_active = true'];
    let params = [];
    let i = 1;

    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`p.tenant_id = $${i++}`);
      params.push(req.tenantId);
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
       LEFT JOIN referrals r ON p.id = r.partner_id
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

// âââ Recommendation level distribution âââ
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

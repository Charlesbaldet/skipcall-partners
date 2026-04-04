const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, partnerScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(partnerScope);

// ─── Main KPIs ───
router.get('/kpis', async (req, res) => {
  try {
    let partnerFilter = '';
    let params = [];

    if (req.partnerScope) {
      partnerFilter = 'WHERE r.partner_id = $1';
      params = [req.partnerScope];
    }

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
          THEN ROUND(COUNT(CASE WHEN r.status = 'won' THEN 1 END)::numeric / 
               COUNT(CASE WHEN r.status IN ('won','lost') THEN 1 END) * 100, 1)
          ELSE 0 END as win_rate
       FROM referrals r ${partnerFilter}`,
      params
    );

    // Total commissions
    let comFilter = req.partnerScope ? 'WHERE c.partner_id = $1' : '';
    const { rows: [comKpis] } = await query(
      `SELECT 
        COALESCE(SUM(amount), 0) as total_commission,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END), 0) as pending_commission,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) as paid_commission
       FROM commissions c ${comFilter}`,
      req.partnerScope ? [req.partnerScope] : []
    );

    res.json({ ...kpis, ...comKpis });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Referrals over time (for charts) ───
router.get('/timeline', async (req, res) => {
  try {
    const { months = 6 } = req.query;
    let partnerFilter = '';
    let params = [months];

    if (req.partnerScope) {
      partnerFilter = 'AND r.partner_id = $2';
      params.push(req.partnerScope);
    }

    const { rows } = await query(
      `SELECT 
        TO_CHAR(DATE_TRUNC('month', r.created_at), 'YYYY-MM') as month,
        COUNT(*) as total,
        COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won,
        COUNT(CASE WHEN r.status = 'lost' THEN 1 END) as lost,
        COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value END), 0) as revenue
       FROM referrals r
       WHERE r.created_at >= NOW() - ($1 || ' months')::interval ${partnerFilter}
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
    let partnerFilter = req.partnerScope ? 'WHERE r.partner_id = $1' : '';
    const { rows } = await query(
      `SELECT r.status, COUNT(*) as count, 
        COALESCE(SUM(r.deal_value), 0) as value
       FROM referrals r ${partnerFilter}
       GROUP BY r.status
       ORDER BY CASE r.status
         WHEN 'new' THEN 1
         WHEN 'contacted' THEN 2
         WHEN 'meeting' THEN 3
         WHEN 'proposal' THEN 4
         WHEN 'won' THEN 5
         WHEN 'lost' THEN 6
       END`,
      req.partnerScope ? [req.partnerScope] : []
    );
    res.json({ pipeline: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Top partners ranking ───
router.get('/top-partners', authorize('admin', 'commercial'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.name, p.commission_rate,
        COUNT(r.id) as total_referrals,
        COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won_deals,
        COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value END), 0) as revenue,
        CASE WHEN COUNT(CASE WHEN r.status IN ('won','lost') THEN 1 END) > 0
          THEN ROUND(COUNT(CASE WHEN r.status = 'won' THEN 1 END)::numeric / 
               COUNT(CASE WHEN r.status IN ('won','lost') THEN 1 END) * 100, 1)
          ELSE 0 END as win_rate
       FROM partners p
       LEFT JOIN referrals r ON p.id = r.partner_id
       WHERE p.is_active = true
       GROUP BY p.id
       ORDER BY revenue DESC
       LIMIT 10`
    );
    res.json({ topPartners: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Recommendation level distribution ───
router.get('/levels', async (req, res) => {
  try {
    let partnerFilter = req.partnerScope ? 'WHERE r.partner_id = $1' : '';
    const { rows } = await query(
      `SELECT r.recommendation_level as level, COUNT(*) as count,
        COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won
       FROM referrals r ${partnerFilter}
       GROUP BY r.recommendation_level`,
      req.partnerScope ? [req.partnerScope] : []
    );
    res.json({ levels: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

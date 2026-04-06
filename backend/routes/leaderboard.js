const express = require('express');
const { query } = require('../db');
const { authenticate, tenantScope } = require('../middleware/auth');
const router = express.Router();

// ─── Levels configuration ───
const LEVELS = [
  { name: 'Bronze', min: 0, color: '#cd7f32', rate: 10, icon: '🥉' },
  { name: 'Silver', min: 5, color: '#94a3b8', rate: 12, icon: '🥈' },
  { name: 'Gold', min: 15, color: '#f59e0b', rate: 15, icon: '🥇' },
  { name: 'Platinum', min: 30, color: '#6366f1', rate: 20, icon: '💎' },
];

function getLevel(wonDeals) {
  let level = LEVELS[0];
  for (const l of LEVELS) {
    if (wonDeals >= l.min) level = l;
  }
  return level;
}

function getNextLevel(wonDeals) {
  for (const l of LEVELS) {
    if (wonDeals < l.min) return l;
  }
  return null;
}

// ─── GET /api/leaderboard ───
router.get('/', authenticate, tenantScope, async (req, res) => {
  try {
    // Tenant isolation : filter partners by tenant_id
    let whereClauses = ['p.is_active = true'];
    let params = [];
    let i = 1;

    if (req.tenantId && !req.skipTenantFilter) {
      whereClauses.push(`p.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    const whereSql = 'WHERE ' + whereClauses.join(' AND ');

    const { rows } = await query(
      `SELECT
        p.id, p.name, p.contact_name, p.referral_code,
        COALESCE(r.won_deals, 0) as won_deals,
        COALESCE(r.total_referrals, 0) as total_referrals,
        COALESCE(r.total_revenue, 0) as total_revenue,
        COALESCE(c.total_commissions, 0) as total_commissions,
        COALESCE(c.paid_commissions, 0) as paid_commissions
      FROM partners p
      LEFT JOIN (
        SELECT
          partner_id,
          COUNT(*) FILTER (WHERE status = 'won') as won_deals,
          COUNT(*) as total_referrals,
          COALESCE(SUM(deal_value) FILTER (WHERE status = 'won'), 0) as total_revenue
        FROM referrals
        GROUP BY partner_id
      ) r ON p.id = r.partner_id
      LEFT JOIN (
        SELECT
          partner_id,
          COALESCE(SUM(amount), 0) as total_commissions,
          COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as paid_commissions
        FROM commissions
        GROUP BY partner_id
      ) c ON p.id = c.partner_id
      ${whereSql}
      ORDER BY COALESCE(r.won_deals, 0) DESC, COALESCE(r.total_revenue, 0) DESC`,
      params
    );

    const leaderboard = rows.map((p, i) => {
      const won = parseInt(p.won_deals) || 0;
      const level = getLevel(won);
      const next = getNextLevel(won);
      return {
        rank: i + 1,
        id: p.id,
        name: p.name,
        contact_name: p.contact_name,
        referral_code: p.referral_code,
        won_deals: won,
        total_referrals: parseInt(p.total_referrals) || 0,
        total_revenue: parseFloat(p.total_revenue) || 0,
        total_commissions: parseFloat(p.total_commissions) || 0,
        paid_commissions: parseFloat(p.paid_commissions) || 0,
        conversion_rate: p.total_referrals > 0 ? Math.round(won / parseInt(p.total_referrals) * 100) : 0,
        level: level.name,
        level_icon: level.icon,
        level_color: level.color,
        level_rate: level.rate,
        next_level: next ? { name: next.name, icon: next.icon, deals_needed: next.min - won } : null,
      };
    });

    res.json({ leaderboard, levels: LEVELS });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

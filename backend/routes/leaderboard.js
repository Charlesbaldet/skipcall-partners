const express = require('express');
const { query } = require('../db');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_LEVELS = [
  { name: 'Bronze',   min_threshold: 0,  commission_rate: 10, color: '#cd7f32', icon: '', position: 0 },
  { name: 'Silver',   min_threshold: 5,  commission_rate: 12, color: '#94a3b8', icon: '', position: 1 },
  { name: 'Gold',     min_threshold: 15, commission_rate: 15, color: '#f59e0b', icon: '', position: 2 },
  { name: 'Platinum', min_threshold: 30, commission_rate: 20, color: '#6366f1', icon: '', position: 3 },
];

async function getOrCreateLevels(tenantId) {
  if (!tenantId) return DEFAULT_LEVELS;
  let { rows } = await query(
    'SELECT name, min_threshold, commission_rate, color, icon, position FROM tenant_levels WHERE tenant_id = $1 ORDER BY position ASC, min_threshold ASC',
    [tenantId]
  );
  if (rows.length === 0) {
    for (const l of DEFAULT_LEVELS) {
      await query(
        'INSERT INTO tenant_levels (tenant_id, name, min_threshold, commission_rate, color, icon, position) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [tenantId, l.name, l.min_threshold, l.commission_rate, l.color, l.icon, l.position]
      );
    }
    ({ rows } = await query(
      'SELECT name, min_threshold, commission_rate, color, icon, position FROM tenant_levels WHERE tenant_id = $1 ORDER BY position ASC',
      [tenantId]
    ));
  }
  return rows;
}

function getLevel(value, levels) {
  let level = levels[0];
  for (const l of levels) {
    if (parseFloat(value) >= parseFloat(l.min_threshold)) level = l;
  }
  return level;
}

function getNextLevel(value, levels) {
  for (const l of levels) {
    if (parseFloat(value) < parseFloat(l.min_threshold)) return l;
  }
  return null;
}

router.get('/', authenticate, tenantScope, async (req, res) => {
  try {
    let thresholdType = 'deals';
    if (req.tenantId) {
      try {
        const { rows: tRows } = await query('SELECT level_threshold_type FROM tenants WHERE id = $1', [req.tenantId]);
        thresholdType = (tRows[0] && tRows[0].level_threshold_type) || 'deals';
      } catch (e) {}
    }

    const levels = await getOrCreateLevels(req.tenantId);

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
        SELECT partner_id,
          COUNT(*) FILTER (WHERE status = 'won') as won_deals,
          COUNT(*) as total_referrals,
          COALESCE(SUM(deal_value) FILTER (WHERE status = 'won'), 0) as total_revenue
        FROM referrals
        GROUP BY partner_id
      ) r ON p.id = r.partner_id
      LEFT JOIN (
        SELECT partner_id,
          COALESCE(SUM(amount), 0) as total_commissions,
          COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as paid_commissions
        FROM commissions
        GROUP BY partner_id
      ) c ON p.id = c.partner_id
      ${whereSql}
      ORDER BY COALESCE(r.won_deals, 0) DESC, COALESCE(r.total_revenue, 0) DESC`,
      params
    );

    const leaderboard = rows.map((p, idx) => {
      const won = parseInt(p.won_deals) || 0;
      const revenue = parseFloat(p.total_revenue) || 0;
      const value = thresholdType === 'volume' ? revenue : won;
      const level = getLevel(value, levels);
      const next = getNextLevel(value, levels);
      return {
        rank: idx + 1,
        id: p.id,
        name: p.name,
        contact_name: p.contact_name,
        referral_code: p.referral_code,
        won_deals: won,
        total_referrals: parseInt(p.total_referrals) || 0,
        total_revenue: revenue,
        total_commissions: parseFloat(p.total_commissions) || 0,
        paid_commissions: parseFloat(p.paid_commissions) || 0,
        conversion_rate: p.total_referrals > 0 ? Math.round(won / parseInt(p.total_referrals) * 100) : 0,
        level: level.name,
        level_icon: level.icon,
        level_color: level.color,
        level_rate: parseFloat(level.commission_rate),
        next_level: next ? {
          name: next.name,
          icon: next.icon,
          deals_needed: Math.max(0, parseFloat(next.min_threshold) - value),
        } : null,
      };
    });

    res.json({
      leaderboard,
      levels: levels.map(l => ({
        name: l.name,
        min: parseFloat(l.min_threshold),
        rate: parseFloat(l.commission_rate),
        icon: l.icon,
        color: l.color,
      })),
      threshold_type: thresholdType,
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

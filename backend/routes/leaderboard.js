const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

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
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.name, p.contact_name, p.referral_code,
              COUNT(r.id) FILTER (WHERE r.status = 'won') as won_deals,
              COUNT(r.id) as total_referrals,
              COALESCE(SUM(r.deal_value) FILTER (WHERE r.status = 'won'), 0) as total_revenue,
              COALESCE(SUM(c.amount), 0) as total_commissions,
              COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'paid'), 0) as paid_commissions
       FROM partners p
       LEFT JOIN referrals r ON p.id = r.partner_id
       LEFT JOIN commissions c ON p.id = c.partner_id
       WHERE p.is_active = true
       GROUP BY p.id
       ORDER BY won_deals DESC, total_revenue DESC`
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

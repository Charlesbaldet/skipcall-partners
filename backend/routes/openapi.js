const express = require('express');
const { query } = require('../db');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');

const router = express.Router();
router.use(apiKeyAuth);

// ─── POST /api/v1/referrals - Submit a referral ───
router.post('/referrals', async (req, res) => {
  try {
    const { prospect_name, prospect_email, prospect_phone, prospect_company, prospect_role, notes, deal_value, recommendation_level } = req.body;

    if (!prospect_name || !prospect_email) {
      return res.status(400).json({ error: 'prospect_name and prospect_email are required' });
    }

    const partnerId = req.partnerId || req.apiKey.partner_id;
    if (!partnerId) return res.status(400).json({ error: 'API key must be linked to a partner' });

    const { rows: [referral] } = await query(
      `INSERT INTO referrals (partner_id, submitted_by, prospect_name, prospect_email, prospect_phone, prospect_company, prospect_role, notes, deal_value, recommendation_level)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [partnerId, prospect_name, prospect_email, prospect_phone || null, prospect_company || null, prospect_role || null, notes || null, deal_value || 0, recommendation_level || 'warm']
    );

    res.status(201).json({ referral });
  } catch (err) {
    console.error('API create referral error:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Duplicate referral' });
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/v1/referrals - List referrals ───
router.get('/referrals', async (req, res) => {
  try {
    const partnerId = req.partnerId || req.apiKey.partner_id;
    const { status, limit = 50, offset = 0 } = req.query;

    let where = [];
    let params = [];
    let i = 1;

    if (partnerId) {
      where.push(`r.partner_id = $${i++}`);
      params.push(partnerId);
    }

    if (status) {
      where.push(`r.status = $${i++}`);
      params.push(status);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT r.id, r.prospect_name, r.prospect_email, r.prospect_company, r.status, r.deal_value, r.recommendation_level, r.created_at, r.updated_at
       FROM referrals r ${whereClause}
       ORDER BY r.created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({ referrals: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/v1/referrals/:id - Get referral details ───
router.get('/referrals/:id', async (req, res) => {
  try {
    const partnerId = req.partnerId || req.apiKey.partner_id;
    const { rows } = await query(
      `SELECT r.* FROM referrals r WHERE r.id = $1 ${partnerId ? 'AND r.partner_id = $2' : ''}`,
      partnerId ? [req.params.id, partnerId] : [req.params.id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Referral not found' });
    res.json({ referral: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/v1/commissions - List commissions ───
router.get('/commissions', async (req, res) => {
  try {
    const partnerId = req.partnerId || req.apiKey.partner_id;
    if (!partnerId) return res.status(400).json({ error: 'API key must be linked to a partner' });

    const { rows } = await query(
      `SELECT c.id, c.amount, c.rate, c.deal_value, c.status, c.created_at, c.approved_at, c.paid_at,
              r.prospect_name, r.prospect_company
       FROM commissions c JOIN referrals r ON c.referral_id = r.id
       WHERE c.partner_id = $1 ORDER BY c.created_at DESC`,
      [partnerId]
    );

    res.json({ commissions: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

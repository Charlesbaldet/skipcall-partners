const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');

const router = express.Router();

// ─── GET /api/track/:code - Get partner info by referral code ───
router.get('/:code', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, name, contact_name, referral_code FROM partners WHERE referral_code = $1 AND is_active = true',
      [req.params.code.toUpperCase()]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Code partenaire invalide' });
    res.json({ partner: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/track/:code - Submit referral via tracking link ───
router.post('/:code', async (req, res) => {
  try {
    const { prospect_name, prospect_email, prospect_phone, prospect_company, prospect_role, notes } = req.body;

    if (!prospect_name || !prospect_email) {
      return res.status(400).json({ error: 'Nom et email requis' });
    }

    // Find partner by referral code
    const { rows: partners } = await query(
      'SELECT id FROM partners WHERE referral_code = $1 AND is_active = true',
      [req.params.code.toUpperCase()]
    );
    if (partners.length === 0) return res.status(404).json({ error: 'Code partenaire invalide' });

    const partnerId = partners[0].id;

    // Find partner's user to set as submitted_by
    const { rows: users } = await query(
      'SELECT id FROM users WHERE partner_id = $1 LIMIT 1',
      [partnerId]
    );
    const submittedBy = users.length > 0 ? users[0].id : partnerId;

    // Create referral
    const { rows: [referral] } = await query(
      `INSERT INTO referrals (partner_id, submitted_by, prospect_name, prospect_email, prospect_phone, prospect_company, prospect_role, notes, recommendation_level, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'warm', 'tracking_link') RETURNING id`,
      [partnerId, submittedBy, prospect_name, prospect_email, prospect_phone || null, prospect_company || null, prospect_role || null, notes || null]
    );

    res.status(201).json({ message: 'Recommandation envoyée !', referralId: referral.id });
  } catch (err) {
    console.error('Tracking submit error:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Ce prospect a déjà été recommandé' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

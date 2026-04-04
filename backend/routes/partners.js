const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ─── List partners ───
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, 
        COUNT(r.id) as total_referrals,
        COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won_deals,
        COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value END), 0) as total_revenue
       FROM partners p
       LEFT JOIN referrals r ON p.id = r.partner_id
       WHERE p.is_active = true
       GROUP BY p.id
       ORDER BY p.name`
    );
    res.json({ partners: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Get single partner ───
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, 
        COUNT(r.id) as total_referrals,
        COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won_deals,
        COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value * p.commission_rate / 100 END), 0) as total_commission
       FROM partners p
       LEFT JOIN referrals r ON p.id = r.partner_id
       WHERE p.id = $1
       GROUP BY p.id`,
      [req.params.id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Create partner (admin only) ───
router.post('/', authorize('admin'), [
  body('name').trim().notEmpty(),
  body('contact_name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('commission_rate').isFloat({ min: 0, max: 50 }),
], async (req, res) => {
  const client = await getClient();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, contact_name, email, phone, company_website, commission_rate } = req.body;

    await client.query('BEGIN');

    const { rows: [partner] } = await client.query(
      `INSERT INTO partners (name, contact_name, email, phone, company_website, commission_rate)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, contact_name, email, phone, company_website, commission_rate]
    );

    // Auto-create user account for the partner
    const tempPassword = Math.random().toString(36).slice(2, 10) + '!A1';
    const hash = await bcrypt.hash(tempPassword, 12);
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, partner_id)
       VALUES ($1, $2, $3, 'partner', $4)`,
      [email, hash, contact_name, partner.id]
    );

    await client.query('COMMIT');

    res.status(201).json({ partner, tempPassword });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Un partenaire avec cet email existe déjà' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ─── Update partner (admin only) ───
router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { name, contact_name, email, phone, company_website, commission_rate, is_active } = req.body;
    const { rows: [partner] } = await query(
      `UPDATE partners SET 
        name = COALESCE($2, name),
        contact_name = COALESCE($3, contact_name),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        company_website = COALESCE($6, company_website),
        commission_rate = COALESCE($7, commission_rate),
        is_active = COALESCE($8, is_active)
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, contact_name, email, phone, company_website, commission_rate, is_active]
    );

    if (!partner) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

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
    const showAll = req.query.show === 'all';
    const activeFilter = showAll ? '' : 'WHERE p.is_active = true';

    const { rows } = await query(
      `SELECT p.*, 
        COUNT(r.id) as total_referrals,
        COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won_deals,
        COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value END), 0) as total_revenue
       FROM partners p
       LEFT JOIN referrals r ON p.id = r.partner_id
       ${activeFilter}
       GROUP BY p.id
       ORDER BY p.is_active DESC, p.name`
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
    const { name, contact_name, email, phone, company_website, commission_rate, is_active, iban, bic, account_holder } = req.body;
    const { rows: [partner] } = await query(
      `UPDATE partners SET 
        name = COALESCE($2, name),
        contact_name = COALESCE($3, contact_name),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        company_website = COALESCE($6, company_website),
        commission_rate = COALESCE($7, commission_rate),
        is_active = COALESCE($8, is_active),
        iban = COALESCE($9, iban),
        bic = COALESCE($10, bic),
        account_holder = COALESCE($11, account_holder)
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, contact_name, email, phone, company_website, commission_rate, is_active, iban, bic, account_holder]
    );

    if (!partner) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Partner updates own IBAN (feature #2) ───
router.put('/:id/iban', async (req, res) => {
  try {
    // Only the partner themselves can update their IBAN
    if (req.user.role === 'partner' && req.user.partnerId !== req.params.id) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    // Admins can also update any partner's IBAN
    if (req.user.role !== 'partner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    const { iban, bic, account_holder } = req.body;

    // Basic IBAN validation
    if (iban) {
      const cleanIban = iban.replace(/\s/g, '').toUpperCase();
      if (cleanIban.length < 15 || cleanIban.length > 34) {
        return res.status(400).json({ error: 'Format IBAN invalide' });
      }
    }

    const { rows: [partner] } = await query(
      `UPDATE partners SET 
        iban = $2, bic = $3, account_holder = $4
       WHERE id = $1 RETURNING id, iban, bic, account_holder`,
      [req.params.id, iban || null, bic || null, account_holder || null]
    );

    if (!partner) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Archive / Restore partner ───
router.put('/:id/archive', authorize('admin'), async (req, res) => {
  try {
    // Toggle is_active
    const { rows: [partner] } = await query(
      `UPDATE partners SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!partner) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Delete partner (admin only) ───
router.delete('/:id', authorize('admin'), async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Delete user account linked to partner
    await client.query('DELETE FROM users WHERE partner_id = $1', [req.params.id]);
    // Delete partner
    const { rowCount } = await client.query('DELETE FROM partners WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    if (rowCount === 0) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ message: 'Partenaire supprimé' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Impossible de supprimer : ce partenaire a des referrals. Archivez-le plutôt.' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ─── Get partner's own profile (for partner users) ───
router.get('/me/profile', async (req, res) => {
  try {
    if (!req.user.partnerId) {
      return res.status(400).json({ error: 'Pas un partenaire' });
    }
    const { rows } = await query(
      `SELECT id, name, contact_name, email, phone, company_website, commission_rate, iban, bic, account_holder
       FROM partners WHERE id = $1`,
      [req.user.partnerId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

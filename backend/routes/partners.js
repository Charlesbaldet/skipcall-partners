const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate);
router.use(tenantScope);

// ─── Update tenant social links (admin) ─────────────────────────────
// These links are displayed to partners next to each news feed program.
// Stored on the `partners` table per spec; we mirror the values across
// every active partner record in the tenant so any one can feed the
// GET /api/partner/program/:id/socials endpoint.
router.put('/social', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const {
      social_linkedin, social_twitter, social_facebook,
      social_instagram, social_youtube, social_website,
    } = req.body || {};
    await query(
      `UPDATE partners SET
         social_linkedin  = $1,
         social_twitter   = $2,
         social_facebook  = $3,
         social_instagram = $4,
         social_youtube   = $5,
         social_website   = $6
       WHERE tenant_id = $7`,
      [
        social_linkedin  ?? null,
        social_twitter   ?? null,
        social_facebook  ?? null,
        social_instagram ?? null,
        social_youtube   ?? null,
        social_website   ?? null,
        req.tenantId || null,
      ]
    );
    res.json({
      socials: {
        social_linkedin, social_twitter, social_facebook,
        social_instagram, social_youtube, social_website,
      },
    });
  } catch (err) {
    console.error('[partners PUT /social]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Get current socials for admin's tenant ─────────────────────────
router.get('/social', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT social_linkedin, social_twitter, social_facebook,
              social_instagram, social_youtube, social_website
         FROM partners
        WHERE tenant_id = $1 AND is_active = true
          AND (social_linkedin IS NOT NULL OR social_twitter IS NOT NULL
            OR social_facebook IS NOT NULL OR social_instagram IS NOT NULL
            OR social_youtube IS NOT NULL OR social_website IS NOT NULL)
        LIMIT 1`,
      [req.tenantId || null]
    );
    res.json({ socials: rows[0] || {} });
  } catch (err) {
    console.error('[partners GET /social]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ List partners âââ
router.get('/', async (req, res) => {
  try {
    const showAll = req.query.show === 'all';

    let where = [];
    let params = [];
    let i = 1;

    if (!showAll) {
      where.push('p.is_active = true');
    }

    // Tenant isolation
    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`p.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT p.*,
              COUNT(r.id) as total_referrals,
              COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won_deals,
              COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value END), 0) as total_revenue
       FROM partners p
       LEFT JOIN referrals r ON p.id = r.partner_id
       ${whereClause}
       GROUP BY p.id
       ORDER BY p.is_active DESC, p.name`,
      params
    );
    res.json({ partners: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Get single partner âââ
router.get('/:id', async (req, res) => {
  try {
    let where = ['p.id = $1'];
    let params = [req.params.id];
    let i = 2;

    // Tenant isolation
    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`p.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    const { rows } = await query(
      `SELECT p.*,
              COUNT(r.id) as total_referrals,
              COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won_deals,
              COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value END), 0) as total_revenue,
              COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value * p.commission_rate / 100 END), 0) as total_commission
       FROM partners p
       LEFT JOIN referrals r ON p.id = r.partner_id
       WHERE ${where.join(' AND ')}
       GROUP BY p.id`,
      params
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Create partner (admin only) âââ
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

    // INSERT partner with tenant_id
    const { rows: [partner] } = await client.query(
      `INSERT INTO partners (name, contact_name, email, phone, company_website, commission_rate, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, contact_name, email, phone, company_website, commission_rate, req.tenantId || null]
    );

    // Auto-create user account for the partner (with tenant_id)
    const tempPassword = Math.random().toString(36).slice(2, 10) + '!A1';
    const hash = await bcrypt.hash(tempPassword, 12);

    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, partner_id, tenant_id, must_change_password)
       VALUES ($1, $2, $3, 'partner', $4, $5, true)`,
      [email, hash, contact_name, partner.id, req.tenantId || null]
    );

    await client.query('COMMIT');

    res.status(201).json({ partner, tempPassword });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Un partenaire avec cet email existe dÃ©jÃ ' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// âââ Update partner (admin only) âââ
router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { name, contact_name, email, phone, company_website,
            commission_rate, is_active, iban, bic, account_holder } = req.body;

    // Tenant check
    let whereExtra = '';
    let params = [req.params.id, name, contact_name, email, phone,
                  company_website, commission_rate, is_active, iban, bic, account_holder];
    if (req.tenantId && !req.skipTenantFilter) {
      whereExtra = ` AND tenant_id = $12`;
      params.push(req.tenantId);
    }

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
       WHERE id = $1${whereExtra}
       RETURNING *`,
      params
    );

    if (!partner) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Partner updates own IBAN âââ
router.put('/:id/iban', async (req, res) => {
  try {
    if (req.user.role === 'partner' && req.user.partnerId !== req.params.id) {
      return res.status(403).json({ error: 'AccÃ¨s interdit' });
    }
    if (req.user.role !== 'partner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'AccÃ¨s interdit' });
    }

    const { iban, bic, account_holder } = req.body;
    if (iban) {
      const cleanIban = iban.replace(/\s/g, '').toUpperCase();
      if (cleanIban.length < 15 || cleanIban.length > 34) {
        return res.status(400).json({ error: 'Format IBAN invalide' });
      }
    }

    const { rows: [partner] } = await query(
      `UPDATE partners SET iban = $2, bic = $3, account_holder = $4
       WHERE id = $1 AND (tenant_id = $5 OR $5::uuid IS NULL)
       RETURNING id, iban, bic, account_holder`,
      [req.params.id, iban || null, bic || null, account_holder || null, req.tenantId || null]
    );

    if (!partner) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Archive / Restore partner âââ
router.put('/:id/archive', authorize('admin'), async (req, res) => {
  try {
    let whereExtra = '';
    let params = [req.params.id];
    if (req.tenantId && !req.skipTenantFilter) {
      whereExtra = ' AND tenant_id = $2';
      params.push(req.tenantId);
    }

    const { rows: [partner] } = await query(
      `UPDATE partners SET is_active = NOT is_active WHERE id = $1${whereExtra} RETURNING *`,
      params
    );

    if (!partner) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Delete partner (admin only) âââ
router.delete('/:id', authorize('admin'), async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM users WHERE partner_id = $1', [req.params.id]);
    const { rowCount } = await client.query('DELETE FROM partners WHERE id = $1 AND (tenant_id = $2 OR $2::uuid IS NULL)', [req.params.id, req.tenantId || null]);
    await client.query('COMMIT');

    if (rowCount === 0) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ message: 'Partenaire supprimÃ©' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Impossible de supprimer : ce partenaire a des referrals. Archivez-le plutÃ´t.' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// âââ Get partner's own profile âââ
router.get('/me/profile', async (req, res) => {
  try {
    if (!req.user.partnerId) {
      return res.status(400).json({ error: 'Pas un partenaire' });
    }

    const { rows } = await query(
      `SELECT id, name, contact_name, email, phone, company_website,
              commission_rate, iban, bic, account_holder
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

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const { queueNotification } = require('../services/emailService');

const router = express.Router();

// ─── PUBLIC: Submit application (no auth required) ───
// Tenant is inherited from req.tenantId set by global tenantMiddleware (domain-based)
router.post('/apply', [
  body('company_name').trim().notEmpty().withMessage('Nom de société requis'),
  body('contact_name').trim().notEmpty().withMessage('Nom du contact requis'),
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('phone').optional().trim(),
  body('company_website').optional().trim(),
  body('company_size').optional().trim(),
  body('motivation').optional().trim(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { company_name, contact_name, email, phone, company_website, company_size, motivation } = req.body;

    // Resolve tenant from URL slug (set via /r/:slug routing) — fallback to domain
    let resolvedTenantId = req.tenantId;
    if (req.body.tenant_slug) {
      try {
        const { rows: ts } = await query("SELECT id FROM tenants WHERE slug = $1", [req.body.tenant_slug]);
        if (ts[0]) resolvedTenantId = ts[0].id;
      } catch (e) {}
    }

    // Check if email already exists in applications or partners — within the same tenant
    let dupCheckSql = `
      SELECT id FROM partner_applications WHERE email = $1 AND status = 'pending'
      ${resolvedTenantId ? 'AND tenant_id = $2' : ''}
      UNION
      SELECT id FROM partners WHERE email = $1
      ${resolvedTenantId ? 'AND tenant_id = $2' : ''}
    `;
    const dupParams = resolvedTenantId ? [email, resolvedTenantId] : [email];
    const { rows: existing } = await query(dupCheckSql, dupParams);

    if (existing.length > 0) {
      return res.status(409).json({ error: 'Une candidature ou un compte existe déjà avec cet email' });
    }

    const { rows: [application] } = await query(
      `INSERT INTO partner_applications
       (company_name, contact_name, email, phone, company_website, company_size, motivation, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [company_name, contact_name, email, phone, company_website, company_size, motivation, resolvedTenantId || null]
    );

    // Notify admins of THIS tenant only
    let adminSql = `SELECT email, full_name FROM users WHERE role = 'admin' AND is_active = true`;
    let adminParams = [];
    if (resolvedTenantId) {
      adminSql += ' AND tenant_id = $1';
      adminParams = [resolvedTenantId];
    }
    const { rows: admins } = await query(adminSql, adminParams);

    for (const admin of admins) {
      await queueNotification(admin.email, admin.full_name, 'new_application', {
        companyName: company_name,
        contactName: contact_name,
        email: email,
      });
    }

    res.status(201).json({ message: 'Candidature envoyée avec succès', application: { id: application.id } });
  } catch (err) {
    console.error('Application submit error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ADMIN: List applications ───
router.get('/', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.query;
    let where = [];
    let params = [];
    let i = 1;

    if (status && status !== 'all') {
      where.push(`pa.status = $${i++}`);
      params.push(status);
    }

    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`pa.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT pa.*, u.full_name as reviewer_name
       FROM partner_applications pa
       LEFT JOIN users u ON pa.reviewed_by = u.id
       ${whereSql}
       ORDER BY pa.created_at DESC`,
      params
    );

    res.json({ applications: rows });
  } catch (err) {
    console.error('List applications error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ADMIN: Approve application ───
router.put('/:id/approve', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  const client = await getClient();
  try {
    const { commission_rate = 10 } = req.body;

    // Get application — tenant scoped
    let appSql = 'SELECT * FROM partner_applications WHERE id = $1';
    let appParams = [req.params.id];
    if (req.tenantId && !req.skipTenantFilter) {
      appSql += ' AND tenant_id = $2';
      appParams.push(req.tenantId);
    }
    const { rows: [app] } = await query(appSql, appParams);

    if (!app) return res.status(404).json({ error: 'Candidature introuvable' });
    if (app.status !== 'pending') return res.status(400).json({ error: 'Candidature déjà traitée' });

    await client.query('BEGIN');

    // Create partner with tenant_id
    const { rows: [partner] } = await client.query(
      `INSERT INTO partners (name, contact_name, email, phone, company_website, commission_rate, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [app.company_name, app.contact_name, app.email, app.phone, app.company_website, commission_rate, req.tenantId || null]
    );

    // Create user account with tenant_id
    const tempPassword = Math.random().toString(36).slice(2, 10) + '!A1';
    const hash = await bcrypt.hash(tempPassword, 12);
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, partner_id, tenant_id)
       VALUES ($1, $2, $3, 'partner', $4, $5)`,
      [app.email, hash, app.contact_name, partner.id, req.tenantId || null]
    );

    // Update application status
    await client.query(
      `UPDATE partner_applications
       SET status = 'approved', reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $1`,
      [req.params.id, req.user.id]
    );

    await client.query('COMMIT');

    // Send welcome email to partner
    await queueNotification(app.email, app.contact_name, 'application_approved', {
      companyName: app.company_name,
      email: app.email,
      tempPassword: tempPassword,
      loginUrl: process.env.FRONTEND_URL || 'https://skipcall-partners.vercel.app',
    });

    res.json({ partner, tempPassword });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Un partenaire avec cet email existe déjà' });
    }
    console.error('Approve application error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ─── ADMIN: Reject application ───
router.put('/:id/reject', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    const { reason } = req.body;

    let sql = `UPDATE partner_applications
               SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(), rejection_reason = $3
               WHERE id = $1 AND status = 'pending'`;
    let params = [req.params.id, req.user.id, reason || null];

    if (req.tenantId && !req.skipTenantFilter) {
      sql += ` AND tenant_id = $4`;
      params.push(req.tenantId);
    }
    sql += ' RETURNING *';

    const { rows: [app] } = await query(sql, params);

    if (!app) return res.status(404).json({ error: 'Candidature introuvable ou déjà traitée' });

    // Notify applicant of rejection
    await queueNotification(app.email, app.contact_name, 'application_rejected', {
      companyName: app.company_name,
      reason: reason || 'Votre candidature ne correspond pas à nos critères actuels.',
    });

    res.json({ application: app });
  } catch (err) {
    console.error('Reject application error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

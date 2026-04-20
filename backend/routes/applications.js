const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const resend = require('../services/resend');
const templates = require('../services/email-templates');
const { sendEmail, partnerAccessRevoked, newPartnerApplicationTpl } = require('../services/emailService');
const notify = require('../services/notifyService');

const router = express.Router();

// In-memory per-IP rate limit for POST /apply (bot protection)
const applyAttempts = new Map();
const APPLY_LIMIT = 5;
const APPLY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

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
    // Honeypot: bots typically fill every field including hidden ones
    if (req.body.website && req.body.website.length > 0) {
      return res.status(400).json({ error: 'Erreur de validation' });
    }
    // Per-IP rate limit: max 5 applications per hour
    const clientIp = req.ip || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.connection.remoteAddress;
    const nowTs = Date.now();
    const attempt = applyAttempts.get(clientIp);
    if (attempt && attempt.resetAt > nowTs) {
      if (attempt.count >= APPLY_LIMIT) {
        return res.status(429).json({ error: 'Trop de candidatures envoyées depuis cette adresse. Réessayez dans 1h.' });
      }
      attempt.count++;
    } else {
      applyAttempts.set(clientIp, { count: 1, resetAt: nowTs + APPLY_WINDOW_MS });
    }
    // Periodic cleanup to prevent memory leak (~0.1% of requests)
    if (Math.random() < 0.001) {
      for (const [k, v] of applyAttempts.entries()) {
        if (v.resetAt <= nowTs) applyAttempts.delete(k);
      }
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { company_name, contact_name, email, phone, company_website, company_size, motivation, category_id } = req.body;

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

    // Validate / fall back the applicant's chosen category.
    let resolvedCategoryId = null;
    if (resolvedTenantId) {
      if (category_id) {
        const { rows: cc } = await query(
          'SELECT id FROM partner_categories WHERE id = $1 AND tenant_id = $2',
          [category_id, resolvedTenantId]
        );
        if (cc.length) resolvedCategoryId = cc[0].id;
      }
      if (!resolvedCategoryId) {
        const { rows: dd } = await query(
          'SELECT id FROM partner_categories WHERE tenant_id = $1 AND is_default = TRUE LIMIT 1',
          [resolvedTenantId]
        );
        resolvedCategoryId = dd[0]?.id || null;
      }
    }

    const { rows: [application] } = await query(
      `INSERT INTO partner_applications
       (company_name, contact_name, email, phone, company_website, company_size, motivation, tenant_id, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [company_name, contact_name, email, phone, company_website, company_size, motivation, resolvedTenantId || null, resolvedCategoryId]
    );

    // Notify admins of THIS tenant only
    let adminSql = `SELECT email, full_name FROM users WHERE role = 'admin' AND is_active = true`;
    let adminParams = [];
    if (resolvedTenantId) {
      adminSql += ' AND tenant_id = $1';
      adminParams = [resolvedTenantId];
    }
    const { rows: admins } = await query(adminSql, adminParams);

    const _appDashUrl = (process.env.FRONTEND_URL || 'https://refboost.io') + '/applications';
    for (const admin of admins) {
      const _bodyHtml = `<p style="margin:0 0 16px;">Bonjour ${admin.full_name},</p>
        <p style="margin:0 0 16px;">Une nouvelle candidature partenaire vient d'être soumise :</p>
        <div style="margin:16px 0;padding:16px;background:#f0fdf4;border-radius:10px;border-left:4px solid #059669;">
          <div style="font-weight:700;font-size:16px;color:#1f2937;">${contact_name}</div>
          <div style="color:#6b7280;font-size:14px;">${company_name}</div>
          <div style="margin-top:8px;"><a href="mailto:${email}" style="color:#059669;">${email}</a></div>
        </div>`;
      const _html = templates.baseLayout({
        title: 'Nouvelle candidature partenaire',
        preheader: `${contact_name} (${company_name}) souhaite rejoindre votre programme`,
        bodyHtml: _bodyHtml,
        ctaLabel: 'Examiner la candidature',
        ctaUrl: _appDashUrl,
      });
      await resend.sendAndLog({
        to: admin.email,
        subject: `Nouvelle candidature : ${contact_name} — ${company_name}`,
        html: _html,
        text: `Nouvelle candidature de ${contact_name} (${company_name}) — ${email}.
Voir : ${_appDashUrl}`,
        template: 'new_application',
        payload: { recipient_name: admin.full_name, contact_name, company_name, email },
        query,
      });
    }

    // In-app + email fan-out via the preferences-aware notify service.
    if (resolvedTenantId) {
      notify.fanoutAdminNotification(resolvedTenantId, 'new_application', {
        title: `Nouvelle candidature — ${contact_name}`,
        message: `${company_name} — ${email}`,
        link: '/partners',
      }, { includeCommercial: true }).catch(() => {});
      notify.shouldNotify(resolvedTenantId, 'new_application').then(async p => {
        if (!p.email) return;
        const admins = await notify.adminEmails(resolvedTenantId);
        const tpl = newPartnerApplicationTpl(contact_name, company_name);
        for (const a of admins) sendEmail(a.email, tpl.subject, tpl.html).catch(() => {});
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

    // Plan partner-limit gate for approvals. Skip when reactivating an
    // existing partner (already counted) — that's checked further down;
    // we only block when approval would add a NEW active partner.
    if (req.tenantId) {
      const { rows: tr } = await query(
        'SELECT plan, plan_partner_limit FROM tenants WHERE id = $1',
        [req.tenantId]
      );
      const t = tr[0];
      const limit = t?.plan_partner_limit;
      if (t && limit != null && limit !== -1) {
        // Count existing ACTIVE partners in the tenant, excluding any
        // matching-email row since that one would be reactivated (not
        // a net-new partner).
        const { rows: cr } = await query(
          `SELECT COUNT(*)::int AS n FROM partners
             WHERE is_active = TRUE AND tenant_id = $1
               AND LOWER(email) <> LOWER($2)`,
          [req.tenantId, app.email]
        );
        // If this approval creates a net-new partner (no existing row
        // with this email at all), enforce the limit.
        const { rows: ex } = await query(
          'SELECT id FROM partners WHERE LOWER(email) = LOWER($1) AND tenant_id = $2 LIMIT 1',
          [app.email, req.tenantId]
        );
        const willAddNew = ex.length === 0;
        if (willAddNew && (cr[0]?.n || 0) >= limit) {
          return res.status(403).json({
            error: 'partner_limit_reached',
            limit,
            plan: t.plan || 'starter',
            upgradeTo: t.plan === 'starter' ? 'pro' : 'business',
          });
        }
      }
    }

    // Block when the application is already approved AND a matching
    // active partner still exists — that's the real "already handled"
    // case. If the partner was archived or deleted we allow re-approval
    // to rebuild the chain (partner + user_roles + welcome email) so
    // admins can recover without having to reject+re-apply.
    let existingPartner = null;
    if (app.status === 'approved') {
      const { rows } = await query(
        `SELECT id, is_active FROM partners
          WHERE LOWER(email) = LOWER($1)
            AND ($2::uuid IS NULL OR tenant_id = $2)
          LIMIT 1`,
        [app.email, req.tenantId || null]
      );
      existingPartner = rows[0] || null;
      if (existingPartner && existingPartner.is_active) {
        return res.status(400).json({ error: 'Candidature déjà traitée' });
      }
    } else if (app.status === 'rejected') {
      return res.status(400).json({ error: 'Candidature déjà traitée' });
    }

    await client.query('BEGIN');

    // If an archived partner already exists for this email, reactivate
    // it; otherwise insert a fresh partner.
    let partner;
    if (existingPartner) {
      const { rows: [p] } = await client.query(
        `UPDATE partners SET
           name = $2,
           contact_name = $3,
           phone = COALESCE($4, phone),
           company_website = COALESCE($5, company_website),
           commission_rate = $6,
           is_active = true,
           tenant_id = COALESCE(tenant_id, $7)
         WHERE id = $1
         RETURNING *`,
        [existingPartner.id, app.company_name, app.contact_name, app.phone, app.company_website, commission_rate, req.tenantId || null]
      );
      partner = p;
    } else {
      // Fall back the category to the tenant's default if the
      // applicant didn't (or couldn't) pick one.
      let approvedCategoryId = app.category_id || null;
      if (!approvedCategoryId && req.tenantId) {
        const { rows: dd } = await client.query(
          'SELECT id FROM partner_categories WHERE tenant_id = $1 AND is_default = TRUE LIMIT 1',
          [req.tenantId]
        );
        approvedCategoryId = dd[0]?.id || null;
      }
      const { rows: [p] } = await client.query(
        `INSERT INTO partners (name, contact_name, email, phone, company_website, commission_rate, tenant_id, category_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [app.company_name, app.contact_name, app.email, app.phone, app.company_website, commission_rate, req.tenantId || null, approvedCategoryId]
      );
      partner = p;
    }

    // Multi-role: link existing user OR create new account
    const existingRows = await client.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [app.email]
    );
    const existingUser = existingRows.rows[0];

    let tempPassword = null;
    let userId;
    const isNewUser = !existingUser;

    if (existingUser) {
      // User already exists (e.g. customer/admin) - link them as partner
      userId = existingUser.id;
      await client.query(
        `UPDATE users SET partner_id = COALESCE(partner_id, $1), updated_at = NOW() WHERE id = $2`,
        [partner.id, userId]
      );
    } else {
      // Brand new user - create account with temp password
      tempPassword = Math.random().toString(36).slice(-10) + 'Aa1!';
      const hash = await bcrypt.hash(tempPassword, 10);
      const newUserRows = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, partner_id, tenant_id, must_change_password)
         VALUES ($1, $2, $3, 'partner', $4, $5, true)
         RETURNING id`,
        [app.email, hash, app.contact_name, partner.id, req.tenantId || null]
      );
      userId = newUserRows.rows[0].id;
    }

    // Always: register the 'partner' role for this user in this tenant (idempotent)
    if (req.tenantId) {
      await client.query(
        `INSERT INTO user_roles (user_id, tenant_id, role, partner_id)
         VALUES ($1, $2, 'partner', $3)
         ON CONFLICT (user_id, role, tenant_id)
         DO UPDATE SET partner_id = EXCLUDED.partner_id, is_active = true`,
        [userId, req.tenantId, partner.id]
      );
    }

    // Update application status
    await client.query(
      `UPDATE partner_applications
       SET status = 'approved', reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $1`,
      [req.params.id, req.user.id]
    );

    await client.query('COMMIT');

    // Send welcome email to partner via Resend
    try {
      const { rows: [_tenantRow] } = await query('SELECT name FROM tenants WHERE id = $1', [req.tenantId]);
      const _tenantName = _tenantRow ? _tenantRow.name : 'RefBoost';
      const _loginUrl = (process.env.FRONTEND_URL || 'https://refboost.io') + '/login';
      const _bodyHtml = `<p style="margin:0 0 16px;">Bonjour ${app.contact_name},</p>
        <p style="margin:0 0 16px;">Félicitations ! Votre candidature au programme partenaire de <strong>${_tenantName}</strong> a été approuvée.</p>
        <p style="margin:0 0 16px;">Voici vos identifiants de connexion :</p>
        <div style="margin:20px 0;padding:18px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;">
          <div style="font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Email</div>
          <div style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:15px;color:#1f2937;margin-bottom:12px;">${app.email}</div>
          <div style="font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Mot de passe temporaire</div>
          <div style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:17px;font-weight:600;color:#059669;">${tempPassword || '(inchange - utilisez votre mot de passe actuel)'}</div>
        </div>
        <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">Modifiez ce mot de passe dès votre première connexion.</p>`;
      const _html = templates.baseLayout({
        title: 'Bienvenue dans le programme partenaire !',
        preheader: 'Votre candidature a été approuvée',
        tenantName: _tenantName,
        bodyHtml: _bodyHtml,
        ctaLabel: 'Se connecter maintenant',
        ctaUrl: _loginUrl,
      });
      await resend.sendAndLog({
        to: app.email,
        subject: `Bienvenue dans le programme partenaire ${_tenantName} !`,
        html: _html,
        text: `Bonjour ${app.contact_name},

Votre candidature a été approuvée !

Email: ${app.email}
Mot de passe temporaire: ${tempPassword || '(inchange - utilisez votre mot de passe actuel)'}

Connexion: ${_loginUrl}`,
        template: 'application_approved',
        payload: { recipient_name: app.contact_name, company_name: app.company_name },
        query,
      });
    } catch (_emailErr) {
      console.error('[applications.approve] email error:', _emailErr.message);
    }

    res.json({ partner, tempPassword, isNewUser, userId });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflit: cet email est deja lie a un partenaire dans ce tenant' });
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

    // Notify applicant of rejection via Resend
    try {
      const _rejReason = reason || 'Votre candidature ne correspond pas à nos critères actuels.';
      const _rejBodyHtml = `<p style="margin:0 0 16px;">Bonjour ${app.contact_name},</p>
        <p style="margin:0 0 16px;">Merci de l'intérêt que vous portez à notre programme partenaire.</p>
        <p style="margin:0 0 16px;">Après examen de votre candidature pour <strong>${app.company_name}</strong>, nous ne pouvons malheureusement pas y donner suite :</p>
        <div style="margin:16px 0;padding:16px;background:#fef2f2;border-radius:10px;border-left:4px solid #ef4444;color:#374151;font-style:italic;">${_rejReason}</div>
        <p style="margin:0 0 16px;">Nous vous souhaitons bonne continuation et espérons avoir l'opportunité de collaborer à l'avenir.</p>`;
      const _rejHtml = templates.baseLayout({
        title: 'Suite donnée à votre candidature',
        preheader: 'Réponse à votre candidature partenaire',
        bodyHtml: _rejBodyHtml,
      });
      await resend.sendAndLog({
        to: app.email,
        subject: 'Suite donnée à votre candidature partenaire',
        html: _rejHtml,
        text: `Bonjour ${app.contact_name},

Nous avons examiné votre candidature pour ${app.company_name}.

${_rejReason}

Cordialement.`,
        template: 'application_rejected',
        payload: { recipient_name: app.contact_name, company_name: app.company_name },
        query,
      });
    } catch (_rejEmailErr) {
      console.error('[applications.reject] email error:', _rejEmailErr.message);
    }

    res.json({ application: app });
  } catch (err) {
    console.error('Reject application error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── ADMIN: Delete an application (+ revoke linked partner access) ───
// Cleans up the full footprint of an approved application:
//   * deletes the application row
//   * deactivates the partner record that matches by email in the
//     same tenant (we never hard-delete because referrals reference
//     partners; archive preserves the FK chain)
//   * disables user_roles rows pointing at that partner
//   * emails the partner user(s) that access was revoked
router.delete('/:id', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  const client = await getClient();
  try {
    let appSql = 'SELECT id, email, company_name, contact_name, status, tenant_id FROM partner_applications WHERE id = $1';
    let appParams = [req.params.id];
    if (req.tenantId && !req.skipTenantFilter) {
      appSql += ' AND tenant_id = $2';
      appParams.push(req.tenantId);
    }
    const { rows: [app] } = await query(appSql, appParams);
    if (!app) return res.status(404).json({ error: 'Candidature introuvable' });

    await client.query('BEGIN');

    // Find the matching partner(s) linked to this email in the tenant
    // so we can deactivate them and their user_roles.
    const { rows: matchedPartners } = await client.query(
      `SELECT id FROM partners
        WHERE LOWER(email) = LOWER($1)
          AND ($2::uuid IS NULL OR tenant_id = $2)`,
      [app.email, app.tenant_id || null]
    );
    for (const p of matchedPartners) {
      await client.query('UPDATE partners SET is_active = false WHERE id = $1', [p.id]);
      await client.query('UPDATE user_roles SET is_active = false WHERE partner_id = $1', [p.id]);
    }

    await client.query('DELETE FROM partner_applications WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');

    // Fire-and-forget revocation email (applies even when no partner
    // record survived — the applicant should still know).
    try {
      const { rows: tRow } = await query('SELECT name FROM tenants WHERE id = $1', [app.tenant_id || null]);
      const tenantName = tRow[0]?.name || null;
      const tpl = partnerAccessRevoked(app.contact_name || app.company_name || '', tenantName);
      sendEmail(app.email, tpl.subject, tpl.html).catch(e =>
        console.error('[application-delete email]', app.email, e.message)
      );
    } catch (e) { console.error('[application-delete email outer]', e.message); }

    res.json({ ok: true, deactivated_partners: matchedPartners.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Delete application error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

module.exports = router;

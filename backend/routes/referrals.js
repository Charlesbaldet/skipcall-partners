const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const { authenticate, authorize, partnerScope, tenantScope } = require('../middleware/auth');
// emails via resend.sendAndLog — emailService.queueNotification removed
const resend = require('../services/resend');
const templates = require('../services/email-templates');

const router = express.Router();

// All routes require authentication + tenant isolation
router.use(authenticate);
router.use(tenantScope);
router.use(partnerScope);

// âââ List referrals âââ
router.get('/', async (req, res) => {
  try {
    const { status, partner_id, level, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let where = [];
    let params = [];
    let i = 1;

    // Tenant isolation â filter by tenant
    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`p.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    // Partners can only see their own referrals
    if (req.partnerScope) {
      where.push(`r.partner_id = $${i++}`);
      params.push(req.partnerScope);
    } else if (partner_id) {
      where.push(`r.partner_id = $${i++}`);
      params.push(partner_id);
    }

    if (status && status !== 'all') {
      where.push(`r.status = $${i++}`);
      params.push(status);
    }

    if (level && level !== 'all') {
      where.push(`r.recommendation_level = $${i++}`);
      params.push(level);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT r.*, p.name as partner_name, p.contact_name as partner_contact,
              p.commission_rate, u.full_name as assigned_name
       FROM referrals r
       JOIN partners p ON r.partner_id = p.id
       LEFT JOIN users u ON r.assigned_to = u.id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );

    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*)
       FROM referrals r
       JOIN partners p ON r.partner_id = p.id
       ${whereClause}`,
      params
    );

    res.json({
      referrals: rows,
      total: parseInt(count),
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
    });
  } catch (err) {
    console.error('List referrals error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Get single referral with activities âââ
router.get('/:id', async (req, res) => {
  try {
    let where = ['r.id = $1'];
    let params = [req.params.id];
    let i = 2;

    // Tenant isolation
    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`p.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    const { rows } = await query(
      `SELECT r.*, p.name as partner_name, p.contact_name as partner_contact,
              p.commission_rate, u.full_name as assigned_name
       FROM referrals r
       JOIN partners p ON r.partner_id = p.id
       LEFT JOIN users u ON r.assigned_to = u.id
       WHERE ${where.join(' AND ')}`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Referral introuvable' });
    }

    // Check partner scope
    if (req.partnerScope && rows[0].partner_id !== req.partnerScope) {
      return res.status(403).json({ error: 'AccÃ¨s interdit' });
    }

    // Get activity log
    const { rows: activities } = await query(
      `SELECT ra.*, u.full_name as user_name
       FROM referral_activities ra
       JOIN users u ON ra.user_id = u.id
       WHERE ra.referral_id = $1
       ORDER BY ra.created_at DESC`,
      [req.params.id]
    );

    res.json({ referral: rows[0], activities });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Create referral (partner submits) âââ
router.post('/', [
  body('prospect_name').trim().notEmpty(),
  body('prospect_email').isEmail().normalizeEmail(),
  body('prospect_company').trim().notEmpty(),
  body('recommendation_level').isIn(['hot', 'warm', 'cold']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      prospect_name, prospect_email, prospect_phone,
      prospect_company, prospect_role,
      recommendation_level, notes,
    } = req.body;

    // Determine partner_id from JWT, request body, or — for multi-role
    // users whose JWT is stale after /switch-space — by resolving the
    // partner record that matches this user+tenant+email.
    let partnerId = req.user.partnerId || req.body.partner_id;
    if (!partnerId && req.user.role === 'partner') {
      const { rows: ur } = await query(
        `SELECT partner_id FROM user_roles
          WHERE user_id = $1 AND role = 'partner' AND is_active = TRUE
            AND ($2::uuid IS NULL OR tenant_id = $2)
            AND partner_id IS NOT NULL
          ORDER BY created_at DESC LIMIT 1`,
        [req.user.id, req.tenantId || req.user.tenantId || null]
      );
      if (ur.length) partnerId = ur[0].partner_id;
      else {
        const { rows: pr } = await query(
          `SELECT p.id FROM partners p
             JOIN users u ON LOWER(u.email) = LOWER(p.email)
            WHERE u.id = $1 AND p.is_active = TRUE
              AND ($2::uuid IS NULL OR p.tenant_id = $2)
            ORDER BY p.created_at DESC LIMIT 1`,
          [req.user.id, req.tenantId || req.user.tenantId || null]
        );
        if (pr.length) partnerId = pr[0].id;
      }
    }
    if (!partnerId) {
      return res.status(400).json({ error: 'Partner ID requis' });
    }

    // INSERT with tenant_id
    const { rows: [referral] } = await query(
      `INSERT INTO referrals
        (partner_id, submitted_by, prospect_name, prospect_email,
         prospect_phone, prospect_company, prospect_role,
         recommendation_level, notes, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [partnerId, req.user.id, prospect_name, prospect_email,
       prospect_phone, prospect_company, prospect_role,
       recommendation_level, notes, req.tenantId || null]
    );

    // Log activity
    await query(
      `INSERT INTO referral_activities (referral_id, user_id, action, new_value)
       VALUES ($1, $2, 'created', 'new')`,
      [referral.id, req.user.id]
    );

    // Queue email notification to admins (within same tenant)
    let adminFilter = `WHERE u.role IN ('admin', 'commercial') AND u.is_active = true`;
    let adminParams = [];
    if (req.tenantId) {
      adminFilter += ` AND u.tenant_id = $1`;
      adminParams = [req.tenantId];
    }

    const { rows: admins } = await query(
      `SELECT email, full_name FROM users u ${adminFilter}`,
      adminParams
    );

    const { rows: [partner] } = await query(
      `SELECT name FROM partners WHERE id = $1`,
      [partnerId]
    );

    const _dashUrl = (process.env.FRONTEND_URL || 'https://refboost.io') + '/referrals';
    const _levelLabel = { hot: '🔥 Chaud', warm: '🌤️ Tiède', cold: '❄️ Froid' }[recommendation_level] || recommendation_level;
    for (const admin of admins) {
      const _bodyHtml = `<p style="margin:0 0 16px;">Bonjour ${admin.full_name},</p>
        <p style="margin:0 0 16px;"><strong>${partner.name}</strong> vient de soumettre un nouveau prospect :</p>
        <div style="margin:16px 0;padding:16px;background:#f0fdf4;border-radius:10px;border-left:4px solid #059669;">
          <div style="font-weight:700;font-size:16px;color:#1f2937;">${prospect_name}</div>
          ${prospect_company ? `<div style="color:#6b7280;font-size:14px;">${prospect_company}</div>` : ''}
          <div style="margin-top:8px;font-size:13px;color:#6b7280;">Niveau : <strong>${_levelLabel}</strong></div>
        </div>`;
      const _html = templates.baseLayout({
        title: 'Nouveau prospect soumis',
        preheader: `${partner.name} a soumis ${prospect_name}`,
        bodyHtml: _bodyHtml,
        ctaLabel: 'Voir dans le pipeline',
        ctaUrl: _dashUrl,
      });
      await resend.sendAndLog({
        to: admin.email,
        subject: `Nouveau referral : ${prospect_name} (${partner.name})`,
        html: _html,
        text: `Nouveau referral de ${partner.name} : ${prospect_name}${prospect_company ? ' — ' + prospect_company : ''}.
Niveau : ${_levelLabel}
Voir : ${_dashUrl}`,
        template: 'new_referral',
        payload: { recipient_name: admin.full_name, partner_name: partner.name, prospect_name, referral_id: referral.id },
        query,
      });
    }

    res.status(201).json({ referral });
  } catch (err) {
    console.error('Create referral error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Update referral (internal team) âââ
router.put('/:id', authenticate, authorize('admin', 'commercial'), async (req, res) => {
  const client = await getClient();
  try {
    const { status, deal_value, assigned_to, notes, lost_reason, engagement } = req.body;

    // Get current state (with tenant check)
    let selectQuery = 'SELECT * FROM referrals WHERE id = $1';
    let selectParams = [req.params.id];
    if (req.tenantId && !req.skipTenantFilter) {
      selectQuery += ' AND tenant_id = $2';
      selectParams.push(req.tenantId);
    }

    const { rows: [current] } = await client.query(selectQuery, selectParams);

    if (!current) {
      client.release();
      return res.status(404).json({ error: 'Referral introuvable' });
    }

    await client.query('BEGIN');

    // Build update
    const updates = {};
    const activities = [];

    if (status && status !== current.status) {
      updates.status = status;
      activities.push({ action: 'status_change', old_value: current.status, new_value: status });
      if (['won', 'lost'].includes(status)) {
        updates.closed_at = new Date().toISOString();
      }
    }

    if (deal_value !== undefined && deal_value !== current.deal_value) {
      updates.deal_value = deal_value;
      activities.push({ action: 'value_updated', old_value: String(current.deal_value), new_value: String(deal_value) });
    }

    if (engagement && engagement !== current.engagement) {
      updates.engagement = engagement;
      activities.push({ action: 'engagement_updated', old_value: current.engagement, new_value: engagement });
    }

    if (assigned_to && assigned_to !== current.assigned_to) {
      updates.assigned_to = assigned_to;
      activities.push({ action: 'assigned', new_value: assigned_to });
    }

    if (notes) {
      activities.push({ action: 'note_added', new_value: notes });
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
      const values = Object.values(updates);
      await client.query(
        `UPDATE referrals SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $1`,
        [req.params.id, ...values]
      );
    }

    // Log activities
    for (const act of activities) {
      await client.query(
        `INSERT INTO referral_activities (referral_id, user_id, action, old_value, new_value, comment)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.params.id, req.user.id, act.action, act.old_value || null, act.new_value || null, act.comment || null]
      );
    }

    // Handle commission on deal won
    if (status === 'won' && deal_value > 0) {
      const { rows: [partner] } = await client.query(
        `SELECT p.id, p.commission_rate
         FROM partners p JOIN referrals r ON r.partner_id = p.id
         WHERE r.id = $1`,
        [req.params.id]
      );

      if (partner) {
        await client.query(
          `INSERT INTO commissions (referral_id, partner_id, amount, rate, deal_value, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (referral_id)
           DO UPDATE SET amount = EXCLUDED.amount, deal_value = EXCLUDED.deal_value`,
          [req.params.id, partner.id,
           deal_value * partner.commission_rate / 100,
           partner.commission_rate, deal_value,
           req.tenantId || null]
        );

        const { rows: [partnerUser] } = await client.query(
          `SELECT u.email, u.full_name FROM users u WHERE u.partner_id = $1 LIMIT 1`,
          [partner.id]
        );
        // deal_won email handled by resend.sendAndLog fire-and-forget below
      }
    }

    // Notify partner of status changes
    if (status && status !== current.status) {
      const { rows: [partnerUser] } = await client.query(
        `SELECT u.email, u.full_name
         FROM users u JOIN referrals r ON u.partner_id = r.partner_id
         WHERE r.id = $1 LIMIT 1`,
        [req.params.id]
      );

      if (partnerUser && status !== 'won') {
        const _statusLabels = { new: 'Nouveau', contacted: 'Contacté', qualified: 'Qualifié', won: 'Conclu', lost: 'Perdu' };
        const _newLabel = _statusLabels[status] || status;
        const _bodyHtml2 = `<p style="margin:0 0 16px;">Bonjour ${partnerUser.full_name},</p>
          <p style="margin:0 0 16px;">Le statut de votre recommandation <strong>${current.prospect_name}</strong> vient de changer :</p>
          <div style="margin:16px 0;padding:20px;background:#f0fdf4;border-radius:10px;text-align:center;border-left:4px solid #059669;">
            <div style="font-size:22px;font-weight:700;color:#059669;">${_newLabel}</div>
          </div>
          <p style="margin:0 0 16px;">Connectez-vous à votre espace pour suivre l'avancement.</p>`;
        const _html2 = templates.baseLayout({
          title: 'Mise à jour de votre recommandation',
          preheader: `${current.prospect_name} est maintenant "${_newLabel}"`,
          bodyHtml: _bodyHtml2,
          ctaLabel: 'Voir mes recommandations',
          ctaUrl: (process.env.FRONTEND_URL || 'https://refboost.io') + '/referrals',
        });
        await resend.sendAndLog({
          to: partnerUser.email,
          subject: `Mise à jour : ${current.prospect_name} → ${_newLabel}`,
          html: _html2,
          text: `Bonjour ${partnerUser.full_name},

Votre recommandation "${current.prospect_name}" est passée au statut "${_newLabel}".

Voir : ${(process.env.FRONTEND_URL || 'https://refboost.io')}/referrals`,
          template: 'status_update',
          payload: { recipient_name: partnerUser.full_name, referral_id: req.params.id, new_status: status },
          query,
        });
      }
    }

    await client.query('COMMIT');

    // Return updated referral
    const { rows: [updated] } = await client.query(
      `SELECT r.*, p.name as partner_name, p.commission_rate
       FROM referrals r JOIN partners p ON r.partner_id = p.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    res.json({ referral: updated });

    // Fire-and-forget: send 'lead won' email to partner user(s) if status just transitioned to 'won'
    if (updates.status === 'won' && current.status !== 'won') {
      (async () => {
        try {
          const { rows: partnerUsers } = await query(
            `SELECT u.email, u.full_name, t.name as tenant_name
             FROM users u JOIN tenants t ON u.tenant_id = t.id
             WHERE u.partner_id = $1 AND u.is_active = true`,
            [updated.partner_id]
          );
          const rate = parseFloat(updated.commission_rate) || 0;
          const dealValue = parseFloat(updated.deal_value) || 0;
          const commissionAmount = Math.round(dealValue * rate) / 100;
          const dashboardUrl = (process.env.FRONTEND_URL || 'https://refboost.io') + '/dashboard';
          for (const u of partnerUsers) {
            const tmpl = templates.leadWon({
              partnerName: u.full_name,
              prospectName: updated.prospect_name || updated.prospect_company || 'votre prospect',
              dealValue: dealValue || null,
              commissionAmount: commissionAmount || null,
              currency: '€',
              dashboardUrl,
              tenantName: u.tenant_name,
            });
            await resend.sendAndLog({
              to: u.email,
              subject: tmpl.subject,
              html: tmpl.html,
              text: tmpl.text,
              template: 'lead_won',
              payload: { recipient_name: u.full_name, referral_id: updated.id, deal_value: dealValue },
              query,
            });
          }
        } catch (e) { console.error('[referrals.won] email error:', e.message); }
      })();
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update referral error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// âââ Delete referral âââ
router.delete('/:id', async (req, res) => {
  const client = await getClient();
  try {
    // Get the referral (with tenant check)
    let selectQuery = 'SELECT * FROM referrals WHERE id = $1';
    let selectParams = [req.params.id];
    if (req.tenantId && !req.skipTenantFilter) {
      selectQuery += ' AND tenant_id = $2';
      selectParams.push(req.tenantId);
    }

    const { rows: [referral] } = await query(selectQuery, selectParams);

    if (!referral) {
      return res.status(404).json({ error: 'Referral introuvable' });
    }

    // Authorization checks
    if (req.user.role === 'partner') {
      if (referral.partner_id !== req.user.partnerId) {
        return res.status(403).json({ error: 'AccÃ¨s interdit' });
      }
      if (referral.status !== 'new') {
        return res.status(400).json({ error: 'Vous ne pouvez supprimer que les recommandations au statut "Nouveau". Contactez l\'admin pour les autres.' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'AccÃ¨s interdit' });
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM referral_activities WHERE referral_id = $1', [req.params.id]);
    await client.query('DELETE FROM commissions WHERE referral_id = $1', [req.params.id]);
    await client.query('DELETE FROM referrals WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');

    res.json({ message: 'Referral supprimÃ©' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete referral error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

module.exports = router;

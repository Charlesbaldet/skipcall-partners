const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const { authenticate, authorize, partnerScope, tenantScope } = require('../middleware/auth');
// emails via resend.sendAndLog — emailService.queueNotification removed
const resend = require('../services/resend');
const templates = require('../services/email-templates');
const notify = require('../services/notifyService');
const { sendEmail, referralStatusChangedTpl, newCommissionAvailableTpl, dealWonTpl } = require('../services/emailService');
const crmService = require('../services/crmService');
const notionService = require('../services/notionService');
const { sendWebhookEvent } = require('../services/webhookService');

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
      // Surface the failing fields so the partner sees WHY the form
      // was rejected instead of a generic 400.
      const details = errors.array().map(e => `${e.path}: ${e.msg}`);
      console.warn('[referrals.create] validation 400:', details, '| body keys:', Object.keys(req.body || {}));
      return res.status(400).json({ error: 'Champs invalides: ' + details.join(', '), errors: errors.array() });
    }

    const {
      prospect_name, prospect_email, prospect_phone,
      prospect_company, prospect_role,
      contact_first_name, contact_last_name,
      recommendation_level, notes, lead_handling,
      referral_code_used, promo_code,
    } = req.body;
    // Both contact fields are optional — normalise empty strings to
    // null so we don't store blank rows.
    const safeContactFirst = (contact_first_name || '').trim() || null;
    const safeContactLast  = (contact_last_name  || '').trim() || null;
    const safeLeadHandling = lead_handling === 'client_prospect' ? 'client_prospect' : 'partner_managed';

    // Track the submission source for admin analytics. Tracking codes
    // override any explicit partner_id in the body.
    let source = 'manual';
    let promoCodeId = null;
    let refCodeNorm = null;
    let resolvedPartnerIdFromCode = null;

    if (referral_code_used) {
      refCodeNorm = String(referral_code_used).toUpperCase();
      const { rows: [pr] } = await query(
        'SELECT id, tenant_id FROM partners WHERE referral_code = $1 LIMIT 1',
        [refCodeNorm]
      );
      if (pr && (!req.tenantId || pr.tenant_id === req.tenantId)) {
        resolvedPartnerIdFromCode = pr.id;
        source = 'referral_link';
      } else {
        refCodeNorm = null; // invalid — fall through to manual flow
      }
    }
    if (promo_code && !resolvedPartnerIdFromCode) {
      const promoNorm = String(promo_code).toUpperCase();
      const { rows: [pc] } = await query(
        `SELECT pc.id, pc.partner_id, pc.tenant_id
           FROM promo_codes pc
          WHERE pc.code = $1 AND pc.is_active = TRUE
            AND ($2::uuid IS NULL OR pc.tenant_id = $2)
          ORDER BY pc.created_at DESC LIMIT 1`,
        [promoNorm, req.tenantId || null]
      );
      if (pc) {
        resolvedPartnerIdFromCode = pc.partner_id;
        promoCodeId = pc.id;
        source = 'promo_code';
      }
    }

    // Determine partner_id from JWT, request body, tracking code, or —
    // for multi-role users whose JWT is stale after /switch-space — by
    // resolving the partner record that matches this user+tenant+email.
    let partnerId = resolvedPartnerIdFromCode || req.user.partnerId || req.body.partner_id;
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
      console.warn('[referrals.create] partner_id could not be resolved | user:', {
        id: req.user?.id, role: req.user?.role, partnerId: req.user?.partnerId, tenantId: req.user?.tenantId,
      }, '| body.partner_id:', req.body?.partner_id, '| req.tenantId:', req.tenantId);
      return res.status(400).json({ error: 'Partner ID requis — votre compte n\'est lié à aucun partenaire actif dans cet espace.' });
    }

    // Default new referrals to the first pipeline stage (position 0)
    // for this tenant so the Kanban has a home for them.
    let defaultStageId = null;
    if (req.tenantId) {
      try {
        const { rows: sr } = await query(
          'SELECT id FROM pipeline_stages WHERE tenant_id = $1 ORDER BY position ASC LIMIT 1',
          [req.tenantId]
        );
        defaultStageId = sr[0]?.id || null;
      } catch (e) { /* stages may not exist yet — column allows NULL */ }
    }

    // INSERT with tenant_id + tracking source
    const { rows: [referral] } = await query(
      `INSERT INTO referrals
        (partner_id, submitted_by, prospect_name, prospect_email,
         prospect_phone, prospect_company, prospect_role,
         contact_first_name, contact_last_name,
         recommendation_level, notes, tenant_id, stage_id, lead_handling,
         source, promo_code_id, referral_code_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [partnerId, req.user.id, prospect_name, prospect_email,
       prospect_phone, prospect_company, prospect_role,
       safeContactFirst, safeContactLast,
       recommendation_level, notes, req.tenantId || null, defaultStageId,
       safeLeadHandling, source, promoCodeId, refCodeNorm]
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
    const _levelLabel = { hot: ' Chaud', warm: ' Tiède', cold: ' Froid' }[recommendation_level] || recommendation_level;
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

    // In-app notification fan-out for the new_referral event (respects
    // the tenant's notification_preferences).
    notify.fanoutAdminNotification(req.tenantId, 'new_referral', {
      title: `Nouveau referral — ${prospect_name}`,
      message: `${partner.name} a soumis ${prospect_name}${prospect_company ? ' (' + prospect_company + ')' : ''}.`,
      link: '/referrals',
    }, { includeCommercial: true }).catch(() => {});

    res.status(201).json({ referral });

    // Fire-and-forget CRM push. The crmService swallows its own
    // errors and writes them to crm_sync_log; we never want a CRM
    // outage to surface as a 500 on referral creation.
    crmService.pushReferralToCRM({ ...referral, partner_name: partner.name }, req.tenantId).catch(() => {});
    // Same fire-and-forget story for Notion — if the tenant has
    // notion_connected=false the service short-circuits.
    notionService.pushReferralToNotion({ ...referral, partner_name: partner.name }, req.tenantId).catch(() => {});
    // Outgoing webhook — customers subscribed to referral.created
    // get a HMAC-signed POST with the public referral payload.
    (async () => {
      const { rows: [p] } = await query('SELECT name, email FROM partners WHERE id = $1', [partnerId]);
      sendWebhookEvent(req.tenantId, 'referral.created', {
        referral_id: referral.id,
        partner_id: partnerId,
        partner_name: p?.name || null,
        partner_email: p?.email || null,
        prospect_name: referral.prospect_name,
        prospect_company: referral.prospect_company,
        prospect_email: referral.prospect_email,
        prospect_phone: referral.prospect_phone,
        notes: referral.notes,
        created_at: referral.created_at,
      });
    })().catch(() => {});
  } catch (err) {
    console.error('Create referral error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Update referral (internal team) âââ
router.put('/:id', authenticate, authorize('admin', 'commercial', 'partner'), async (req, res) => {
  const client = await getClient();
  try {
    let { status, stage_id, lead_handling, deal_value, assigned_to, notes, lost_reason, engagement,
          contact_first_name, contact_last_name } = req.body;

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

    // ─── Partner permission gate ────────────────────────────────────
    // Partners can only edit their OWN referrals, and only when the
    // lead is flagged partner_managed. client_prospect leads are
    // handled by the sales team and are read-only for the partner.
    // Fields a partner is allowed to write: stage_id + lead_handling
    // only — deal_value / commission / notes / assigned_to stay admin-
    // editable.
    if (req.user?.role === 'partner') {
      if (!req.user.partnerId || current.partner_id !== req.user.partnerId) {
        client.release();
        return res.status(403).json({ error: 'partner_not_owner' });
      }
      if (current.lead_handling === 'client_prospect') {
        client.release();
        return res.status(403).json({ error: 'client_prospect_locked' });
      }
      // Strip admin-only fields out of the partner's payload so we
      // don't accidentally write them on a legitimate stage drop.
      status = undefined;
      deal_value = undefined;
      assigned_to = undefined;
      notes = undefined;
      lost_reason = undefined;
      engagement = undefined;
      contact_first_name = undefined;
      contact_last_name = undefined;
    }

    // Resolve stage_id → derive canonical status so all the legacy
    // commission/email/notification hooks below keep working. When
    // the Kanban drops a card onto a new column it sends { stage_id },
    // not { status }. Stages carry is_won / is_lost flags; everything
    // else stays on 'contacted'/'qualified'/'new'/'proposal' etc.
    //
    // The referrals_status_check CHECK constraint used to block any
    // slug outside {new,contacted,meeting,proposal,won,lost,duplicate}.
    // The migration drops it, but we also pin status to the safe set
    // here as a belt-and-suspenders — if for whatever reason the
    // constraint is ever re-added, only known-safe values flow through.
    const LEGACY_STATUS_ALLOWED = new Set(['new', 'contacted', 'qualified', 'meeting', 'proposal', 'won', 'lost', 'duplicate']);
    if (stage_id) {
      const { rows: [s] } = await client.query(
        'SELECT slug, is_won, is_lost FROM pipeline_stages WHERE id = $1 AND tenant_id = $2',
        [stage_id, req.tenantId || current.tenant_id]
      );
      if (!s) {
        client.release();
        return res.status(400).json({ error: 'stage_id introuvable' });
      }
      // Map flags → legacy status. is_won / is_lost always win so the
      // commission + deal-won + email hooks (all gated on status) keep
      // firing. For other stages, use the slug when it's in the legacy
      // allowlist; otherwise hold status at its current value (stage_id
      // is the source of truth now — status is just a mirror).
      if (!status) {
        if (s.is_won) status = 'won';
        else if (s.is_lost) status = 'lost';
        else if (LEGACY_STATUS_ALLOWED.has(s.slug)) status = s.slug;
        else status = current.status;
      }
    }

    // `deal_value` is only in req.body when the client edits that field
    // in the same request. Dragging a card to "won" on the kanban just
    // sends `{ status: 'won' }` — so we must fall back to the deal
    // value already stored on the referral. Without this fallback the
    // `status === 'won' && dealValue > 0` gates below never fire and
    // no commission row is created.
    const effectiveDealValue = deal_value !== undefined
      ? (parseFloat(deal_value) || 0)
      : (parseFloat(current.deal_value) || 0);

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
    if (stage_id && stage_id !== current.stage_id) {
      updates.stage_id = stage_id;
    }
    if (lead_handling && lead_handling !== current.lead_handling && ['partner_managed', 'client_prospect'].includes(lead_handling)) {
      updates.lead_handling = lead_handling;
      activities.push({ action: 'lead_handling_changed', old_value: current.lead_handling, new_value: lead_handling });
    }

    if (deal_value !== undefined && deal_value !== current.deal_value) {
      updates.deal_value = deal_value;
      activities.push({ action: 'value_updated', old_value: String(current.deal_value), new_value: String(deal_value) });
    }

    if (engagement && engagement !== current.engagement) {
      updates.engagement = engagement;
      activities.push({ action: 'engagement_updated', old_value: current.engagement, new_value: engagement });
    }

    // Contact person fields — optional, any non-undefined value
    // (including explicit '') wins, so admins can clear a wrong
    // entry. Partners can't write these (stripped above alongside
    // the other admin-only fields).
    if (contact_first_name !== undefined && contact_first_name !== current.contact_first_name) {
      updates.contact_first_name = (contact_first_name || '').trim() || null;
    }
    if (contact_last_name !== undefined && contact_last_name !== current.contact_last_name) {
      updates.contact_last_name = (contact_last_name || '').trim() || null;
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

    // Handle commission on deal won. Use effectiveDealValue so a simple
    // status flip (no deal_value in the request) still produces a
    // commission row from the previously-saved deal value.
    if (status === 'won' && effectiveDealValue > 0) {
      const { rows: [partner] } = await client.query(
        `SELECT p.id, p.commission_rate
         FROM partners p JOIN referrals r ON r.partner_id = p.id
         WHERE r.id = $1`,
        [req.params.id]
      );

      if (partner) {
        // New commissions start in the approval flow: approval_status
        // 'pending_approval'. Admin clicks Approve/Reject in
        // CommissionsPage → flips it to 'approved' (ready for payment)
        // or 'rejected'. Legacy rows created before this flow stayed
        // on approval_status='pending' (the column default) and are
        // treated as already approved.
        const { rows: [createdCommission] } = await client.query(
          `INSERT INTO commissions (referral_id, partner_id, amount, rate, deal_value, tenant_id, approval_status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending_approval')
           ON CONFLICT (referral_id)
           DO UPDATE SET amount = EXCLUDED.amount, deal_value = EXCLUDED.deal_value
           RETURNING id, amount, rate, deal_value, created_at`,
          [req.params.id, partner.id,
           effectiveDealValue * partner.commission_rate / 100,
           partner.commission_rate, effectiveDealValue,
           req.tenantId || null]
        );

        const { rows: [partnerUser] } = await client.query(
          `SELECT u.email, u.full_name FROM users u WHERE u.partner_id = $1 LIMIT 1`,
          [partner.id]
        );
        // deal_won email handled by resend.sendAndLog fire-and-forget below

        // Outgoing webhook: commission.created
        sendWebhookEvent(req.tenantId, 'commission.created', {
          commission_id: createdCommission.id,
          referral_id: req.params.id,
          partner_id: partner.id,
          partner_name: partner.name,
          amount: parseFloat(createdCommission.amount) || 0,
          rate: parseFloat(createdCommission.rate) || 0,
          deal_value: parseFloat(createdCommission.deal_value) || 0,
          currency: 'EUR',
          created_at: createdCommission.created_at,
        });
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

    // ─── In-app notification fan-out (+ emails) ──────────────────────
    const statusChanged = status && status !== current.status;
    if (statusChanged) {
      const labels = { new: 'Nouveau', contacted: 'Contacté', qualified: 'Qualifié', proposal: 'Proposition', meeting: 'RDV planifié', won: 'Conclu', lost: 'Perdu', duplicate: 'Doublon' };
      const newLabel = labels[status] || status;

      // Notify the partner user of the status change.
      (async () => {
        try {
          const { rows: partnerUsers } = await query(
            `SELECT DISTINCT u.id, u.email, u.full_name
               FROM users u
               JOIN referrals r ON r.partner_id = u.partner_id
              WHERE r.id = $1 AND u.is_active = TRUE`,
            [req.params.id]
          );
          for (const pu of partnerUsers) {
            notify.createNotification(pu.id, 'referral_update', {
              title: `${current.prospect_name} → ${newLabel}`,
              message: `Le statut de votre recommandation a changé.`,
              link: '/partner/referrals',
              tenantId: req.tenantId,
            }).catch(() => {});
            // Email — tenant-level pref AND partner-level
            // `email_referral_status` must both be true.
            Promise.all([
              notify.shouldNotify(req.tenantId, 'referral_update'),
              notify.shouldNotifyPartner(current.partner_id, 'email_referral_status'),
            ]).then(([tenantPref, partnerPref]) => {
              if (!tenantPref.email || !partnerPref.email) return;
              const tpl = referralStatusChangedTpl(pu.full_name, current.prospect_name, newLabel);
              sendEmail(pu.email, tpl.subject, tpl.html).catch(() => {});
            });
          }
        } catch (e) { /* best-effort */ }
      })();

      // Admin-facing "deal won" fan-out + "commission to approve"
      // prompt. The commission row itself was inserted with
      // approval_status='pending_approval' further up; here we tell
      // the admins there's something waiting for them.
      if (status === 'won' && effectiveDealValue > 0) {
        const { rows: [pRow] } = await query('SELECT name, commission_rate FROM partners WHERE id = $1', [current.partner_id]);
        const commissionAmount = Math.round(effectiveDealValue * (parseFloat(pRow?.commission_rate) || 0)) / 100;
        notify.fanoutAdminNotification(req.tenantId, 'deal_won', {
          title: ` Deal gagné — ${current.prospect_name}`,
          message: `${pRow?.name || ''} · ${effectiveDealValue}€ · commission ${commissionAmount}€ à approuver`,
          link: '/commissions',
        }, { includeCommercial: true }).catch(() => {});
        notify.shouldNotify(req.tenantId, 'deal_won').then(async p => {
          if (!p.email) return;
          const admins = await notify.adminEmails(req.tenantId);
          const { commissionToApprove } = require('../utils/emailTemplates');
          for (const a of admins) {
            const tpl = commissionToApprove({
              adminName: a.full_name,
              partnerName: pRow?.name || '',
              prospectName: current.prospect_name,
              amount: commissionAmount,
            });
            sendEmail(a.email, tpl.subject, tpl.html).catch(() => {});
          }
        });
      }

      // Commission fan-out when a deal is freshly won — the row was
      // inserted in the won branch above; notify the partner it's
      // available (+ email).
      if (status === 'won' && effectiveDealValue > 0) {
        (async () => {
          try {
            const { rows: partnerUsers } = await query(
              `SELECT DISTINCT u.id, u.email, u.full_name
                 FROM users u
                 JOIN referrals r ON r.partner_id = u.partner_id
                WHERE r.id = $1 AND u.is_active = TRUE`,
              [req.params.id]
            );
            const { rows: [pRow] } = await query('SELECT commission_rate FROM partners WHERE id = $1', [current.partner_id]);
            const amount = Math.round((effectiveDealValue * (pRow?.commission_rate || 0)) / 100);
            for (const pu of partnerUsers) {
              notify.createNotification(pu.id, 'commission', {
                title: `Commission disponible : ${amount} €`,
                message: `Pour votre recommandation ${current.prospect_name}.`,
                link: '/partner/payments',
                tenantId: req.tenantId,
              }).catch(() => {});
              Promise.all([
                notify.shouldNotify(req.tenantId, 'commission'),
                notify.shouldNotifyPartner(current.partner_id, 'email_referral_won'),
              ]).then(([tenantPref, partnerPref]) => {
                if (!tenantPref.email || !partnerPref.email) return;
                const tpl = newCommissionAvailableTpl(pu.full_name, amount, current.prospect_name);
                sendEmail(pu.email, tpl.subject, tpl.html).catch(() => {});
              });
            }
          } catch { /* best-effort */ }
        })();
      }
    }

    // Return updated referral
    const { rows: [updated] } = await client.query(
      `SELECT r.*, p.name as partner_name, p.commission_rate
       FROM referrals r JOIN partners p ON r.partner_id = p.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    res.json({ referral: updated });

    // Fire-and-forget CRM sync — push status / value changes to the
    // wired CRM (HubSpot / Salesforce / webhook). Errors land in
    // crm_sync_log; never blocks the response.
    crmService.pushReferralToCRM(updated, req.tenantId).catch(() => {});
    notionService.pushReferralToNotion(updated, req.tenantId).catch(() => {});

    // ─── Outgoing webhooks ────────────────────────────────────────
    // Fire referral.updated whenever the status moved; fire the more
    // specific referral.won / referral.lost in addition when the
    // transition lands on a terminal state. Customers can subscribe
    // to just the generic event, just the terminal events, or both.
    if (updates.status && updates.status !== current.status) {
      (async () => {
        const { rows: [p] } = await query('SELECT email FROM partners WHERE id = $1', [updated.partner_id]);
        const basePayload = {
          referral_id: updated.id,
          partner_id: updated.partner_id,
          partner_name: updated.partner_name || null,
          partner_email: p?.email || null,
          prospect_name: updated.prospect_name,
          prospect_company: updated.prospect_company,
          prospect_email: updated.prospect_email,
          prospect_phone: updated.prospect_phone,
          notes: updated.notes,
          created_at: updated.created_at,
        };
        sendWebhookEvent(req.tenantId, 'referral.updated', {
          ...basePayload,
          old_status: current.status,
          new_status: updates.status,
        });
        if (updates.status === 'won') {
          sendWebhookEvent(req.tenantId, 'referral.won', {
            ...basePayload,
            deal_value: parseFloat(updated.deal_value) || null,
          });
        } else if (updates.status === 'lost') {
          sendWebhookEvent(req.tenantId, 'referral.lost', {
            ...basePayload,
            lost_reason: updated.lost_reason || null,
          });
        }
      })().catch(() => {});
    }

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

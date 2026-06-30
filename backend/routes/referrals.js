const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const { authenticate, authorize, partnerScope, tenantScope } = require('../middleware/auth');
const { calculateCommissionAmount, decomposeAmountWithTax } = require('../utils/commissionFormula');
const { bulkResolveTiers, resolveTierForPartner, effectiveRate } = require('../utils/tierResolver');
const { computeLongevitySnapshotAtWon } = require('../utils/longevitySnapshot');
// emails via resend.sendAndLog — emailService.queueNotification removed
const resend = require('../services/resend');
const templates = require('../services/email-templates');
const notify = require('../services/notifyService');
const pipedriveService = require('../services/pipedriveService');
const { sendEmail, referralStatusChangedTpl, newCommissionAvailableTpl, dealWonTpl } = require('../services/emailService');
const crmService = require('../services/crmService');
const notionService = require('../services/notionService');
const { sendWebhookEvent } = require('../services/webhookService');
const { logAudit } = require('../services/auditLog');

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

    // Sort whitelist. The FE table view sends ?sort=<key>&order=<asc|desc>;
    // unknown values fall back to created_at DESC. Each entry maps the
    // FE-facing key to its SQL fragment so we never interpolate
    // user input into the query string.
    const SORT_MAP = {
      prospect: 'r.prospect_name',
      partner:  'p.name',
      level:    'r.recommendation_level',
      status:   'r.status',
      value:    'r.deal_value',
      date:     'r.created_at',
    };
    const sortKey = SORT_MAP[req.query.sort] ? req.query.sort : 'date';
    const sortCol = SORT_MAP[sortKey];
    const orderDir = String(req.query.order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Hide soft-deleted referrals from every list query — they live
    // in the Corbeille for 30 days before purge.
    let where = ['r.deleted_at IS NULL'];
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
              p.commission_rate,
              p.tax_subject AS partner_tax_subject,
              p.tax_rate    AS partner_tax_rate,
              u.full_name as assigned_name
       FROM referrals r
       JOIN partners p ON r.partner_id = p.id
       LEFT JOIN users u ON r.assigned_to = u.id
       ${whereClause}
       ORDER BY ${sortCol} ${orderDir} NULLS LAST, r.id ${orderDir}
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

    // Bulk-resolve tiers so the FE renders the per-row "Silver",
    // "Gold" badge without firing a tier query per card.
    const partnerIds = rows.map(r => r.partner_id);
    const tiers = await bulkResolveTiers(req.tenantId || null, partnerIds);
    const enriched = rows.map(r => {
      const tier = tiers.get(r.partner_id) || null;
      return {
        ...r,
        partner_tier: tier,
        effective_commission_rate: effectiveRate(r, tier),
      };
    });

    res.json({
      referrals: enriched,
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
    let where = ['r.id = $1', 'r.deleted_at IS NULL'];
    let params = [req.params.id];
    let i = 2;

    // Tenant isolation
    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`p.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    const { rows } = await query(
      `SELECT r.*, p.name as partner_name, p.contact_name as partner_contact,
              p.commission_rate,
              p.tax_subject AS partner_tax_subject,
              p.tax_rate    AS partner_tax_rate,
              u.full_name as assigned_name
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

    // Surface whether the deal_value / status is currently locked
    // by an in-flight commission so the frontend can grey out the
    // editor without a second round-trip. Mirrors the same guard
    // applied in PUT /:id. Extended in E3 to also surface enough
    // state for the FE to render "revision allowed" instead of
    // "locked" when the commission is recurring on an opted-in tenant.
    const { rows: lockingComm } = await query(
      `SELECT id, status, is_recurring, qonto_transfer_id, payment_completed_at,
              current_revision_index
         FROM commissions
        WHERE referral_id = $1
          AND deleted_at IS NULL
          AND status IN ('awaiting_invoice', 'pending_validation', 'paid')
        ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]
    );
    const referral = rows[0];
    const lockingRow = lockingComm[0] || null;
    // Read the tenant feature flag once. Cheap — both reads against
    // tenants for this same handler are coalesced upstream.
    const { rows: [tflagRow] } = await query(
      'SELECT COALESCE(recurring_billing_enabled, FALSE) AS recurring_on FROM tenants WHERE id = $1',
      [referral.tenant_id || req.tenantId || null]
    );
    const tenantRecurringOn = !!tflagRow?.recurring_on;
    const paymentInFlight = !!(lockingRow && lockingRow.qonto_transfer_id && !lockingRow.payment_completed_at);
    // Revision path conditions (mirror PUT /:id):
    //   tenant flag ON + commission is_recurring + no transfer in flight.
    const revisionAllowed = !!lockingRow
      && tenantRecurringOn
      && !!lockingRow.is_recurring
      && !paymentInFlight;
    // E3: deal_value is "locked" ONLY when the legacy path applies.
    // On the revision path the field stays editable — the BE will
    // accept the edit and emit an amendment instead of a 400.
    referral.deal_value_locked = !!lockingRow && !revisionAllowed;
    referral.deal_value_revision_allowed = revisionAllowed;
    referral.locking_commission_status = lockingRow?.status || null;
    referral.locking_payment_in_flight = paymentInFlight;
    referral.locking_commission_id = lockingRow?.id || null;
    referral.locking_revision_index = lockingRow?.current_revision_index || null;

    // E3: hydrate the recent revision history for the FE record.
    // Empty array when no commission yet, or a single-row 'initial'
    // entry for backfilled commissions, or N entries after edits.
    let revisions = [];
    if (lockingRow?.id) {
      const { rows: revRows } = await query(
        `SELECT revision_index, deal_value, rate,
                amount_ht, tax_rate_applied, amount_tax, amount_ttc,
                effective_date, reason, created_by, created_at
           FROM commission_revisions
          WHERE commission_id = $1
          ORDER BY revision_index ASC`,
        [lockingRow.id]
      );
      revisions = revRows;
    }
    referral.commission_revisions = revisions;

    // E2: surface the recurring-billing duration of the latest live
    // commission so the deal modal's "À vie / Durée limitée" toggle
    // can hydrate from the saved value on re-open. Returns nulls when
    // there's no commission yet (= legacy default = bounded).
    // E5/partner-read-access: also expose cycle_index + tier_at_won +
    // amount_ttc for the partner's read-only Pipeline tab so it can
    // render the cycle counter and the "X €/durée · N versés" line
    // identical to the admin Kanban card.
    const { rows: durRows } = await query(
      `SELECT is_recurring, is_perpetual, engagement_until,
              cycle_index, tier_at_won,
              amount_ht, tax_rate_applied, amount_tax, amount_ttc, rate
         FROM commissions
        WHERE referral_id = $1 AND deleted_at IS NULL
          AND status <> 'cancelled'
        ORDER BY cycle_index DESC, created_at DESC LIMIT 1`,
      [req.params.id]
    );
    referral.commission_is_recurring = !!durRows[0]?.is_recurring;
    referral.commission_is_perpetual = !!durRows[0]?.is_perpetual;
    referral.commission_engagement_until = durRows[0]?.engagement_until || null;
    referral.commission_cycle_index = durRows[0]?.cycle_index || null;
    referral.commission_tier_at_won = durRows[0]?.tier_at_won || null;
    referral.commission_amount_ht = durRows[0]?.amount_ht || null;
    referral.commission_tax_rate_applied = durRows[0]?.tax_rate_applied || null;
    referral.commission_amount_tax = durRows[0]?.amount_tax || null;
    referral.commission_amount_ttc = durRows[0]?.amount_ttc || null;
    referral.commission_rate = durRows[0]?.rate || null;

    // Count "N versés" for the partner card readout. Same series
    // definition as E5 (cancelled excluded).
    const { rows: [paidRow] } = await query(
      `SELECT COUNT(*)::int AS paid_count
         FROM commissions
        WHERE referral_id = $1
          AND deleted_at IS NULL
          AND status = 'paid'`,
      [req.params.id]
    );
    referral.commission_paid_count = paidRow?.paid_count || 0;

    // Resolve the partner's current tier so the deal modal can show
    // the badge + the rate the override is being compared against.
    // Single-row endpoint → the simpler resolveTierForPartner path,
    // not the bulk one.
    const { rows: [stats] } = await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'won') AS won_deals,
              COALESCE(SUM(deal_value) FILTER (WHERE status = 'won'), 0) AS total_revenue
         FROM referrals WHERE partner_id = $1 AND deleted_at IS NULL`,
      [referral.partner_id]
    );
    const tier = await resolveTierForPartner({
      tenantId: req.tenantId || null,
      partnerId: referral.partner_id,
      wonDeals: stats?.won_deals,
      totalRevenue: stats?.total_revenue,
    });
    referral.partner_tier = tier;
    referral.effective_commission_rate = effectiveRate(referral, tier);

    // Get activity log
    const { rows: activities } = await query(
      `SELECT ra.*, u.full_name as user_name
       FROM referral_activities ra
       JOIN users u ON ra.user_id = u.id
       WHERE ra.referral_id = $1
       ORDER BY ra.created_at DESC`,
      [req.params.id]
    );

    res.json({ referral, activities });
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
      setup_value, // G2 — montant setup one-shot HT (hybrid). NULL si non-renseigné.
    } = req.body;
    // G2 — validation setup_value : >= 0 ou NULL. Non utilisé en
    // mrr_only (le handler closed_won G1 ne lit setup_value qu'en
    // hybrid), donc safe à accepter même sur tenants legacy : reste
    // simplement inutilisé.
    let safeSetupValue = null;
    if (setup_value !== undefined && setup_value !== null && setup_value !== '') {
      const n = parseFloat(setup_value);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: 'invalid_setup_value', message: 'setup_value doit être >= 0' });
      }
      safeSetupValue = Math.round(n * 100) / 100;
    }
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
         source, promo_code_id, referral_code_used, setup_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [partnerId, req.user.id, prospect_name, prospect_email,
       prospect_phone, prospect_company, prospect_role,
       safeContactFirst, safeContactLast,
       recommendation_level, notes, req.tenantId || null, defaultStageId,
       safeLeadHandling, source, promoCodeId, refCodeNorm, safeSetupValue]
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

    // ─── Pipedrive auto-push (fire-and-forget) ────────────────────────
    // Defer via setImmediate so the response ships before we touch
    // Pipedrive. The service swallows its own errors (logged to
    // crm_sync_log) so no Pipedrive outage can break referral creation.
    setImmediate(() => {
      pipedriveService.pushReferralToPipedrive(referral.id, req.tenantId).catch(e => {
        console.error('[pipedrive.autopush.create]', referral.id, e.message);
      });
    });
  } catch (err) {
    console.error('Create referral error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Update referral (internal team) âââ
router.put('/:id', authenticate, authorize('admin', 'commercial', 'partner'), async (req, res) => {
  const client = await getClient();
  try {
    let { status, stage_id, lead_handling, deal_value, assigned_to, notes, lost_reason, engagement, engagement_periods,
          contact_first_name, contact_last_name,
          prospect_name, prospect_email, prospect_phone, prospect_company, prospect_role,
          commission_rate_override, commission_overridden,
          setup_value } = req.body;
    // `is_perpetual` lived on this payload during the first E2 cut.
    // The refonte moves longevity to the partner's tier (tenant_levels),
    // so the deal modal no longer asks the user this question. We
    // accept (and ignore) the field if a stale frontend still sends
    // it — defensive against caches/old tabs.

    // Length caps on the free-text fields. Without these, an
    // attacker (or a careless admin pasting a long log) can stuff
    // arbitrary-size text into a TEXT column — DB bloat, slower
    // index scans on the parent row, and a bigger response payload
    // for every list endpoint that returns the row. 5 KB is plenty
    // for a deal note; lost_reason fits in 1 KB.
    if (typeof notes === 'string' && notes.length > 5000) {
      return res.status(400).json({ error: 'notes_too_long', max: 5000 });
    }
    if (typeof lost_reason === 'string' && lost_reason.length > 1000) {
      return res.status(400).json({ error: 'lost_reason_too_long', max: 1000 });
    }

    // Get current state (with tenant check). Skip soft-deleted rows
    // — admins can't edit a deal that's in the Corbeille.
    let selectQuery = 'SELECT * FROM referrals WHERE id = $1 AND deleted_at IS NULL';
    let selectParams = [req.params.id];
    if (req.tenantId && !req.skipTenantFilter) {
      selectQuery += ' AND tenant_id = $2';
      selectParams.push(req.tenantId);
    }

    const { rows: [current] } = await client.query(selectQuery, selectParams);

    if (!current) {
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
        return res.status(403).json({ error: 'partner_not_owner' });
      }
      // Anything that isn't explicitly partner_managed (NULL legacy
      // rows, client_prospect, future values) is read-only for the
      // partner. The frontend already blocks the drag, but the API
      // mirrors it so a hand-rolled request can't bypass the lock.
      if (current.lead_handling !== 'partner_managed') {
        return res.status(403).json({ error: 'client_prospect_locked' });
      }
      // Strip admin-only fields out of the partner's payload so we
      // don't accidentally write them on a legitimate stage drop.
      // Contact + prospect fields stay editable for the partner on
      // their own partner_managed deals so they can correct/complete
      // a lead (including one that came in via the public form).
      status = undefined;
      deal_value = undefined;
      assigned_to = undefined;
      notes = undefined;
      lost_reason = undefined;
      engagement = undefined;
      engagement_periods = undefined;
      commission_rate_override = undefined;
      commission_overridden = undefined;
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
      // E3 split-decision: when the referral has a commission past
      // pending_approval, the path forks on (tenant flag, is_recurring):
      //   - flag OFF, or is_recurring=false → legacy 400 deal_value_locked
      //   - flag ON + is_recurring=true     → create an amendment row
      //                                       in commission_revisions
      //                                       and re-sync the commission's
      //                                       headline amount fields.
      // The legacy lock is preserved BYTE-FOR-BYTE for non-recurring
      // commissions — that's the existing safety net for one-shot
      // deals where the partner has already been wired (or is being
      // wired) on the original value.
      const { rows: comm } = await client.query(
        `SELECT c.id, c.status, c.is_recurring, c.amount_ttc, c.amount_ht,
                c.rate, c.engagement_type, c.engagement_periods,
                c.current_revision_index, c.qonto_transfer_id,
                c.payment_completed_at, c.tenant_id, c.partner_id
           FROM commissions c
          WHERE c.referral_id = $1
            AND c.deleted_at IS NULL
            AND c.status IN ('awaiting_invoice', 'pending_validation', 'paid')
          LIMIT 1`,
        [req.params.id]
      );

      if (comm.length > 0) {
        const target = comm[0];
        // F2a — batch-active guard (E3 extension). A commission
        // attached to a batch in awaiting_invoice / ready_to_pay
        // must not have its deal_value revised under the partner's
        // feet — the batch total is already locked-in for the
        // partner's invoice. The admin must first retire the
        // commission from its batch (F3 endpoint) before revising.
        const { rows: batchActive } = await client.query(
          `SELECT 1
             FROM commissions c
             JOIN commission_payout_batches b ON b.id = c.payout_batch_id
            WHERE c.referral_id = $1
              AND c.deleted_at IS NULL
              AND b.deleted_at IS NULL
              AND b.status IN ('awaiting_invoice','ready_to_pay')
            LIMIT 1`,
          [req.params.id]
        );
        if (batchActive.length > 0) {
          await client.query('ROLLBACK');
          // Pas de client.release() ici — le finally du handler s'en
          // charge en sortie de try. Double release = "Release called
          // on client which has already been released to the pool" qui
          // crashait le process Node (cf. fix F2a-FIX4).
          return res.status(409).json({
            error: 'commission_in_active_batch',
            message: 'Cette commission est incluse dans un batch en cours. Retirez-la du batch avant de réviser/annuler.',
          });
        }
        // Tenant flag: only the opted-in tenants take the new path.
        const { rows: [tf] } = await client.query(
          'SELECT COALESCE(recurring_billing_enabled, FALSE) AS recurring_on FROM tenants WHERE id = $1',
          [target.tenant_id]
        );
        const recurringOn = !!tf?.recurring_on;
        const goRevisionPath = recurringOn && !!target.is_recurring;

        if (!goRevisionPath) {
          // ─── Legacy lock — UNCHANGED ──────────────────────────
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'deal_value_locked',
            message: 'Le montant ne peut plus être modifié car une commission est déjà en cours de traitement.',
            commission_status: target.status,
          });
        }

        // ─── Revision path (E3) ───────────────────────────────
        // PAYMENT-IN-FLIGHT GUARD: a transfer is initiated and not
        // yet finalised. Changing the amount under it would wire
        // one figure and book another. Refuse, no revision created.
        if (target.qonto_transfer_id && !target.payment_completed_at) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'revision_blocked_payment_in_flight',
            message: 'Un virement est déjà initié pour cette commission. Attendez sa finalisation avant de modifier le montant.',
            qonto_transfer_id: target.qonto_transfer_id,
          });
        }

        // Recompute the amount: rate / engagement / periods stay the
        // same (those are not what this edit is about); deal_value is
        // the new value; partner tax profile re-read to keep the VAT
        // snapshot accurate.
        const { rows: [taxRow] } = await client.query(
          'SELECT tax_subject, tax_rate FROM partners WHERE id = $1',
          [target.partner_id]
        );
        const partnerTaxRate = taxRow?.tax_subject ? Number(taxRow.tax_rate) : 0;
        const newRate = parseFloat(target.rate) || 0;
        const newAmount = calculateCommissionAmount({
          engagementType: target.engagement_type || 'mensuel',
          periods:        target.engagement_periods || 1,
          dealValue:      deal_value,
          rate:           newRate,
        });
        const breakdown = decomposeAmountWithTax(newAmount, partnerTaxRate);
        const nextIndex = (target.current_revision_index || 1) + 1;
        const reason = (parseFloat(deal_value) > parseFloat(current.deal_value)) ? 'upsell' : 'downsell';
        const today = new Date().toISOString().slice(0, 10);
        const oldTtcLabel  = target.amount_ttc != null ? target.amount_ttc : target.amount_ht;

        // Append-only amendment. Prior revisions are NEVER mutated
        // or deleted — they're the audit trail of past-paid cycles.
        await client.query(
          `INSERT INTO commission_revisions
             (commission_id, revision_index, deal_value, rate,
              amount_ht, tax_rate_applied, amount_tax, amount_ttc,
              effective_date, reason, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
          [target.id, nextIndex, deal_value, newRate,
           breakdown.amount_ht, breakdown.tax_rate, breakdown.amount_tax, breakdown.amount_ttc,
           today, reason, req.user.id]
        );

        // Re-sync the commission's headline columns to the latest
        // revision so Kanban / pay-qonto / Pennylane keep reading
        // the current value without joining commission_revisions.
        // is_perpetual / engagement_until / tier_at_won are
        // deliberately NOT in the SET — a revision changes the
        // amount, never the longevity (E2-bis snapshot stays frozen).
        await client.query(
          `UPDATE commissions
              SET deal_value = $2, amount = $3,
                  amount_ht = $4, tax_rate_applied = $5, amount_tax = $6, amount_ttc = $7,
                  current_revision_index = $8
            WHERE id = $1`,
          [target.id, deal_value, newAmount,
           breakdown.amount_ht, breakdown.tax_rate, breakdown.amount_tax, breakdown.amount_ttc,
           nextIndex]
        );

        // Mirror the referral.deal_value and the legacy value_updated
        // activity — same shape as the no-locking-commission path —
        // then push the dedicated revision activity.
        updates.deal_value = deal_value;
        activities.push({ action: 'value_updated', old_value: String(current.deal_value), new_value: String(deal_value) });
        activities.push({
          action: 'commission_recalculated',
          old_value: String(oldTtcLabel != null ? oldTtcLabel : ''),
          new_value: String(breakdown.amount_ttc),
          comment: `deal_value ${current.deal_value} → ${deal_value} € (avenant #${nextIndex}, ${reason})`,
        });
      } else {
        // No locking commission: same legacy path as before.
        updates.deal_value = deal_value;
        activities.push({ action: 'value_updated', old_value: String(current.deal_value), new_value: String(deal_value) });
      }
    }

    // Symmetric guard: blocking the user from dragging a card OUT of
    // the won column once a commission has crossed pending_approval.
    // Letting them do so would leave a paid commission attached to a
    // referral that's no longer "won" — confusing for everyone and
    // bad for accounting.
    const movingOutOfWon = (status && status !== 'won' && current.status === 'won')
      || (stage_id && stage_id !== current.stage_id && current.status === 'won');
    if (movingOutOfWon) {
      const { rows: comm } = await client.query(
        `SELECT id, status, is_recurring, qonto_transfer_id, payment_completed_at, tenant_id
           FROM commissions
          WHERE referral_id = $1
            AND deleted_at IS NULL
            AND status IN ('awaiting_invoice', 'pending_validation', 'paid')
          LIMIT 1`,
        [req.params.id]
      );
      if (comm.length > 0) {
        const target = comm[0];
        if (status === 'lost') {
          // J6-CLOSED-LOST-FIX — un passage en 'lost' PRÉSERVE les
          // commissions engagées (dans un batch ou non) : on ne bloque
          // plus sur le batch actif et on n'annule plus (la cascade E4
          // du bloc leftWon est retirée). Le recurring s'arrête seul via
          // le filtre r.status='won' du worker E5 (commissions.js
          // prepareRecurringRenewals). Seul garde-fou conservé : un
          // virement Qonto déjà initié mais non finalisé (évite une race
          // SCA où l'on clôturerait le deal pendant le transfert).
          if (target.qonto_transfer_id && !target.payment_completed_at) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              error: 'lost_blocked_payment_in_flight',
              message: 'Un virement est déjà initié pour cette commission. Attendez sa finalisation avant de clôturer le deal en perdu.',
              qonto_transfer_id: target.qonto_transfer_id,
            });
          }
          // sinon : on laisse passer, AUCUNE mutation de la commission.
        } else {
          // ─── Exits NON-lost (retour proposal / contacted / …) ───────
          // Verrous legacy INCHANGÉS : un deal qu'on sort de 'won' avec
          // une commission déjà engagée reste bloqué (batch actif → 409,
          // sinon → 400) tant que la commission n'est pas retirée du
          // batch. Letting them do so would leave a paid commission
          // attached to a referral that's no longer "won".
          const { rows: batchActive } = await client.query(
            `SELECT 1
               FROM commissions c
               JOIN commission_payout_batches b ON b.id = c.payout_batch_id
              WHERE c.referral_id = $1
                AND c.deleted_at IS NULL
                AND b.deleted_at IS NULL
                AND b.status IN ('awaiting_invoice','ready_to_pay')
              LIMIT 1`,
            [req.params.id]
          );
          if (batchActive.length > 0) {
            await client.query('ROLLBACK');
            // Pas de client.release() ici — le finally du handler s'en
            // charge en sortie de try (cf. fix F2a-FIX4).
            return res.status(409).json({
              error: 'commission_in_active_batch',
              message: 'Cette commission est incluse dans un batch en cours. Retirez-la du batch avant de réviser/annuler.',
            });
          }
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'commission_locked',
            message: 'Cette commission est déjà en cours de paiement, le statut ne peut pas être modifié.',
            commission_status: target.status,
          });
        }
      }
    }

    if (engagement && engagement !== current.engagement) {
      updates.engagement = engagement;
      activities.push({ action: 'engagement_updated', old_value: current.engagement, new_value: engagement });
      // Forfait is a one-time fee: clamp the periods count to 1 even
      // if the client sent something else. Keeps the commission math
      // honest even when the FE selector forgets to reset.
      if (engagement === 'forfait') {
        engagement_periods = 1;
      }
    }
    if (engagement_periods !== undefined) {
      const ep = Math.max(1, parseInt(engagement_periods, 10) || 1);
      if (ep !== current.engagement_periods) {
        updates.engagement_periods = ep;
        activities.push({ action: 'engagement_periods_updated', old_value: String(current.engagement_periods || 1), new_value: String(ep) });
      }
    }

    // Commission-rate override. Two related fields:
    //   commission_overridden       boolean — drives the "use the
    //                               override / use the tier" branch
    //                               at read + commission-creation time.
    //   commission_rate_override    NUMERIC — only meaningful when
    //                               commission_overridden = true.
    // The FE always sends both together (the warning modal forces an
    // explicit confirmation), but the backend defends against either
    // arriving alone — flipping the flag without a value clears the
    // override; passing a value without the flag is treated as
    // overridden=true.
    if (commission_rate_override !== undefined) {
      const v = parseFloat(commission_rate_override);
      const next = isFinite(v) && v >= 0 ? Math.min(100, v) : null;
      if (next !== current.commission_rate_override) {
        updates.commission_rate_override = next;
        activities.push({ action: 'commission_rate_override_updated', old_value: String(current.commission_rate_override ?? ''), new_value: String(next ?? '') });
      }
    }
    if (commission_overridden !== undefined) {
      const flag = !!commission_overridden;
      if (flag !== !!current.commission_overridden) {
        updates.commission_overridden = flag;
        activities.push({ action: 'commission_overridden_updated', old_value: String(!!current.commission_overridden), new_value: String(flag) });
      }
      // Clear the value when the flag goes off — keeps the row tidy
      // and lets the next /referrals GET fall back to the tier rate
      // cleanly.
      if (!flag) {
        updates.commission_rate_override = null;
      }
    }

    // Contact + prospect fields — optional, any non-undefined value
    // (including explicit '') wins, so the caller can clear a wrong
    // entry. Editable by admin/commercial on every deal and by the
    // partner on their own partner_managed deals (form leads need to
    // be correctable just like manual ones — see étape 4 / item 6).
    // The two NOT NULL columns (prospect_name + prospect_email) are
    // guarded against being emptied: incoming '' is dropped silently
    // so we never violate the existing schema invariants.
    if (contact_first_name !== undefined && contact_first_name !== current.contact_first_name) {
      updates.contact_first_name = (contact_first_name || '').trim() || null;
    }
    if (contact_last_name !== undefined && contact_last_name !== current.contact_last_name) {
      updates.contact_last_name = (contact_last_name || '').trim() || null;
    }
    if (prospect_name !== undefined) {
      const v = String(prospect_name).trim();
      if (v && v !== current.prospect_name) updates.prospect_name = v;
    }
    if (prospect_email !== undefined) {
      const v = String(prospect_email).trim().toLowerCase();
      // Minimal sanity: must contain @. Heavier validation would
      // reject leads created via the public form's synthetic
      // lead+<hex>@noemail.refboost.local fallback so we keep it
      // permissive here.
      if (v && v.includes('@') && v !== current.prospect_email) updates.prospect_email = v;
    }
    if (prospect_phone !== undefined && prospect_phone !== current.prospect_phone) {
      updates.prospect_phone = (prospect_phone || '').trim() || null;
    }
    if (prospect_company !== undefined) {
      const v = String(prospect_company).trim();
      if (v && v !== current.prospect_company) updates.prospect_company = v;
    }
    if (prospect_role !== undefined && prospect_role !== current.prospect_role) {
      updates.prospect_role = (prospect_role || '').trim() || null;
    }

    if (assigned_to && assigned_to !== current.assigned_to) {
      updates.assigned_to = assigned_to;
      activities.push({ action: 'assigned', new_value: assigned_to });
    }

    if (notes) {
      activities.push({ action: 'note_added', new_value: notes });
    }

    // G2 — setup_value (montant setup one-shot HT du contrat client
    // final, hybrid). Accepté quel que soit business_model (le handler
    // closed_won ne le lit qu'en hybrid). null/"" → set NULL ; nombre
    // ≥ 0 → set valeur ; négatif/NaN → 400.
    if (setup_value !== undefined) {
      if (setup_value === null || setup_value === '') {
        updates.setup_value = null;
      } else {
        const n = parseFloat(setup_value);
        if (!Number.isFinite(n) || n < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'invalid_setup_value', message: 'setup_value doit être >= 0' });
        }
        updates.setup_value = Math.round(n * 100) / 100;
      }
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

    // Handle commission on deal won. The row gets created even when
    // deal_value is 0 — admin sees the card in the "À approuver" column
    // and adjusts the amount if needed before approving. Without this,
    // partner-submitted leads (which usually have no deal_value at
    // creation) would never produce a commission card when moved to
    // Gagné.
    const leftWon = current.status === 'won' && status && status !== 'won';

    if (status === 'won') {
      const { rows: [partner] } = await client.query(
        `SELECT p.id, p.name, p.commission_rate,
                p.tax_subject, p.tax_rate
         FROM partners p JOIN referrals r ON r.partner_id = p.id
         WHERE r.id = $1`,
        [req.params.id]
      );

      if (partner) {
        // Effective commission rate: override (when flagged) > tier
        // rate (live from tenant_levels) > legacy partner.commission_rate.
        // Pulls the in-flight updates first so the same drag that
        // toggled the override uses the new value.
        const overriddenFlag = updates.commission_overridden !== undefined
          ? updates.commission_overridden
          : !!current.commission_overridden;
        const overrideValue = updates.commission_rate_override !== undefined
          ? updates.commission_rate_override
          : current.commission_rate_override;
        let rate;
        if (overriddenFlag && overrideValue != null) {
          rate = parseFloat(overrideValue);
        } else {
          // Resolve current tier from won-deal stats — a partner who
          // crossed a threshold mid-deal sees the new rate applied
          // automatically the moment Gagné fires, which is the
          // user's "auto-update non-overridden deals" intent.
          const { rows: [stats] } = await client.query(
            `SELECT COUNT(*) FILTER (WHERE status = 'won') AS won_deals,
                    COALESCE(SUM(deal_value) FILTER (WHERE status = 'won'), 0) AS total_revenue
               FROM referrals WHERE partner_id = $1 AND id <> $2 AND deleted_at IS NULL`,
            [partner.id, req.params.id]
          );
          const tier = await resolveTierForPartner({
            tenantId: req.tenantId || null,
            partnerId: partner.id,
            wonDeals: stats?.won_deals,
            totalRevenue: stats?.total_revenue,
          });
          rate = tier && tier.commission_rate != null
            ? parseFloat(tier.commission_rate)
            : (parseFloat(partner.commission_rate) || 0);
        }
        // Use the same formula as the deal-card forecast so the
        // commission row matches what the admin already saw.
        // Engagement metadata is read from the in-flight `updates`
        // first (the change the user just made on the same drag),
        // then falls back to whatever's on the row.
        const effEngagement = updates.engagement || current.engagement || 'mensuel';
        const effPeriods    = updates.engagement_periods != null
          ? updates.engagement_periods
          : (current.engagement_periods || 1);
        const mrrBaseAmount = calculateCommissionAmount({
          engagementType: effEngagement,
          periods: effPeriods,
          dealValue: effectiveDealValue,
          rate,
        });

        // ─── G1 : business model hybride (MRR + setup one-shot) ────
        // mrr_only (défaut, tous tenants existants) : comportement
        //   strictement inchangé — amount = mrrBaseAmount, setup_amount_ht
        //   et mrr_amount_ht restent NULL en DB.
        // hybrid : setupAmountHt = referral.setup_value × tier.setup_rate
        //   sur le cycle 1 (le won transition EST le cycle 1 par
        //   construction). Le worker E5 propage ensuite uniquement
        //   mrr_amount_ht aux cycles 2+ (setup = one-shot, jamais
        //   récurrent). amount = mrrBaseAmount + setupAmountHt → le
        //   breakdown VAT s'applique sur ce total agrégé (le partner
        //   facture UN seul HT/TVA/TTC, jamais deux factures séparées).
        const { rows: [tenantBmRow] } = await client.query(
          `SELECT COALESCE(business_model, 'mrr') AS business_model FROM tenants WHERE id = $1`,
          [req.tenantId || null]
        );
        const businessModel = tenantBmRow?.business_model || 'mrr';
        let setupAmountHt = null;
        let mrrAmountHt = null;
        let amount = mrrBaseAmount;
        if (businessModel === 'hybrid') {
          // Résolution dédiée du tier pour récupérer le setup_rate.
          // resolveTierForPartner ne projette pas setup_rate aujourd'hui ;
          // on récupère son .name (cache getLevels TTL 10s = quasi-gratuit)
          // puis on fait une petite SELECT sur tenant_levels pour le
          // setup_rate (idempotent, indexé via (tenant_id, name)).
          // Indépendant du chemin override/non-override pour fonctionner
          // dans toutes les branches sans recours à `tier` (out of scope
          // au point d'exécution).
          let tierNameHybrid = null;
          let setupRate = null;
          try {
            const { rows: [statsHy] } = await client.query(
              `SELECT COUNT(*) FILTER (WHERE status = 'won') AS won_deals,
                      COALESCE(SUM(deal_value) FILTER (WHERE status = 'won'), 0) AS total_revenue
                 FROM referrals WHERE partner_id = $1 AND id <> $2 AND deleted_at IS NULL`,
              [partner.id, req.params.id]
            );
            const tierHy = await resolveTierForPartner({
              tenantId: req.tenantId || null,
              partnerId: partner.id,
              wonDeals: statsHy?.won_deals,
              totalRevenue: statsHy?.total_revenue,
            });
            tierNameHybrid = tierHy?.name || null;
            if (tierNameHybrid) {
              const { rows: [tl] } = await client.query(
                `SELECT setup_rate FROM tenant_levels
                  WHERE tenant_id = $1 AND name = $2
                  LIMIT 1`,
                [req.tenantId || null, tierNameHybrid]
              );
              setupRate = tl?.setup_rate != null ? parseFloat(tl.setup_rate) : null;
            }
          } catch (e) {
            console.warn('[hybrid] setup_rate lookup failed:', e.message);
          }
          const setupValue = current.setup_value != null ? parseFloat(current.setup_value) : 0;
          if (setupValue > 0 && setupRate != null && setupRate > 0) {
            // Math.round(setup_value × setup_rate) / 100 ≡ arrondi à 2 décimales.
            setupAmountHt = Math.round(setupValue * setupRate) / 100;
          }
          mrrAmountHt = mrrBaseAmount;
          amount = mrrBaseAmount + (setupAmountHt || 0);
        }
        // H1 — mode forfait_tjm (one-shot pur). Commission unique au
        // won, jamais récurrente. amount_ht = mrrBaseAmount (calcul
        // legacy via calculateCommissionAmount), setup/mrr columns
        // restent NULL (pas de split). is_recurring forcé à false plus
        // bas pour neutraliser Phase E (longévité, worker E5 ignore
        // via is_recurring=false). Symétrique avec mrr_only mais sans
        // recurring machinery.
        const isForfaitTjm = businessModel === 'forfait_tjm';
        // partner's current tax profile. Without this the row sits at
        // tax_rate_applied = 0 / amount_ttc = amount until /pay-qonto
        // re-snapshots — and the partner's payments page can't show
        // their HT/TVA/TTC breakdown for unpaid commissions. The
        // /pay-qonto path will overwrite this snapshot with whatever
        // the partner's tax config is at payout time, so this is a
        // best-known-now value, not a final commitment.
        // En hybrid, `amount` est le total agrégé (setup+mrr) — le
        // breakdown VAT s'applique sur ce total, partner doit facturer
        // un seul HT/TVA/TTC.
        const partnerTaxRate = partner.tax_subject ? Number(partner.tax_rate) : 0;
        const breakdown = decomposeAmountWithTax(amount, partnerTaxRate);

        // ─── Phase E2 (refonte): longevity is derived from the
        // partner's CURRENT tier, not from the deal modal. The tier
        // resolution above (rate branch) already has the right tier
        // object in scope when we didn't take the override path; when
        // we did take the override path the local `tier` variable is
        // unset, so we re-resolve once here. Cached for ~10s by
        // getLevels so the extra call is essentially free for a
        // burst of won transitions.
        const { rows: [tenantFlagRow] } = await client.query(
          'SELECT COALESCE(recurring_billing_enabled, FALSE) AS recurring_on FROM tenants WHERE id = $1',
          [req.tenantId || null]
        );
        const recurringOn = !!tenantFlagRow?.recurring_on;
        // A recurring commission is, by definition, non-forfait — a
        // one-off flat fee can't "live as long as the deal is won".
        // H1 : un tenant en business_model='forfait_tjm' force
        // is_recurring=false quoi qu'il arrive (le sélecteur Commission
        // est l'arbitre métier — même si recurring_billing_enabled
        // était à TRUE par erreur côté DB, on neutralise ici).
        const isRecurringEff = recurringOn && effEngagement !== 'forfait' && !isForfaitTjm;

        // Resolve tier-driven longevity. Note we re-resolve the tier
        // for longevity even if the rate path used an override —
        // overrides only override the RATE, not the longevity policy.
        let tierForLongevity = null;
        if (isRecurringEff) {
          const { rows: [statsLong] } = await client.query(
            `SELECT COUNT(*) FILTER (WHERE status = 'won') AS won_deals,
                    COALESCE(SUM(deal_value) FILTER (WHERE status = 'won'), 0) AS total_revenue
               FROM referrals WHERE partner_id = $1 AND id <> $2 AND deleted_at IS NULL`,
            [partner.id, req.params.id]
          );
          tierForLongevity = await resolveTierForPartner({
            tenantId: req.tenantId || null,
            partnerId: partner.id,
            wonDeals: statsLong?.won_deals,
            totalRevenue: statsLong?.total_revenue,
          });
        }
        // E2-bis: SNAPSHOT FIXED AT WON. The values computed here
        // get written to the commission row exactly once (or
        // re-snapshotted while the row is still pending_approval —
        // see below) and are NEVER recalculated afterwards. A later
        // tier promotion or demotion has zero effect on existing
        // commissions, only on deals won after the change. The dynamic
        // resolver from the previous E2 cut has been removed entirely.
        let isPerpetualEff = false;
        let engagementUntilEff = null;
        let tierAtWonEff = null;
        if (isRecurringEff) {
          const wonDateIso = updates.closed_at || current.closed_at || new Date().toISOString();
          const snap = computeLongevitySnapshotAtWon(tierForLongevity, wonDateIso);
          isPerpetualEff   = snap.is_perpetual;
          engagementUntilEff = snap.engagement_until;
          tierAtWonEff     = snap.tier_at_won;
        }

        // Look up an existing commission first so we can decide between
        // INSERT and a status-aware UPDATE: a row that already moved
        // past pending_approval (awaiting_invoice / pending_validation /
        // paid) shouldn't get its lifecycle reset by a re-drag onto the
        // same column.
        // E4: a 'cancelled' commission is a terminal historical
        // record — a lost→won reopen MUST NOT resurrect it. We
        // filter it out here so the "no existing commission" branch
        // fires and a brand-new commission gets INSERTed against the
        // partner's current tier (fresh longevity snapshot + fresh
        // initial revision). The cancelled row stays around as audit.
        const { rows: [existingCom] } = await client.query(
          `SELECT id, status, is_recurring, is_perpetual, engagement_until
             FROM commissions
            WHERE referral_id = $1
              AND deleted_at IS NULL
              AND status <> 'cancelled'`,
          [req.params.id]
        );

        // Build a human label for the duration so the
        // engagement_duration_set activity stays readable. The label
        // now carries the tier name as the origin of the policy
        // (palier-driven, not deal-driven). Skipped when recurring
        // is off (legacy behaviour = no activity at all on this axis).
        const durationLabel = (recurring, perpetual, untilDate, tierName) => {
          if (!recurring) return null;
          const suffix = tierName ? ` (palier ${tierName})` : '';
          if (perpetual) return `à vie${suffix}`;
          return untilDate ? `limité jusqu'au ${untilDate}${suffix}` : `limité${suffix}`;
        };
        const oldDurationLabel = durationLabel(
          existingCom?.is_recurring,
          existingCom?.is_perpetual,
          existingCom?.engagement_until ? new Date(existingCom.engagement_until).toISOString().slice(0, 10) : null,
          null,
        );
        const newDurationLabel = durationLabel(isRecurringEff, isPerpetualEff, engagementUntilEff, tierForLongevity?.name);
        if (recurringOn && newDurationLabel && oldDurationLabel !== newDurationLabel) {
          activities.push({
            action: 'engagement_duration_set',
            old_value: oldDurationLabel || '—',
            new_value: newDurationLabel,
          });
        }

        let createdCommission;
        if (!existingCom) {
          ({ rows: [createdCommission] } = await client.query(
            `INSERT INTO commissions
               (referral_id, partner_id, amount, rate, deal_value, tenant_id, approval_status, status,
                engagement_type, engagement_periods,
                amount_ht, tax_rate_applied, amount_tax, amount_ttc,
                setup_amount_ht, mrr_amount_ht,
                is_recurring, is_perpetual, engagement_until, current_revision_index, tier_at_won)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending_approval', 'pending_approval',
                     $7, $8,
                     $9, $10, $11, $12,
                     $13, $14,
                     $15, $16, $17, 1, $18)
             RETURNING id, amount, rate, deal_value, created_at`,
            [req.params.id, partner.id, amount, rate, effectiveDealValue, req.tenantId || null,
             effEngagement, effPeriods,
             breakdown.amount_ht, breakdown.tax_rate, breakdown.amount_tax, breakdown.amount_ttc,
             setupAmountHt, mrrAmountHt,
             isRecurringEff, isPerpetualEff, engagementUntilEff, tierAtWonEff]
          ));
        } else if (existingCom.status === 'pending_approval') {
          // Re-snapshot while still pre-approval: the commission isn't
          // "engaged" yet, so a re-drag onto the won column captures
          // the partner's tier-at-that-moment. Once the commission
          // moves past pending_approval, the past-pending UPDATE
          // branch below leaves these columns untouched — that's
          // where the SNAPSHOT semantic locks in.
          ({ rows: [createdCommission] } = await client.query(
            `UPDATE commissions
                SET amount = $2, rate = $3, deal_value = $4,
                    engagement_type = $5, engagement_periods = $6,
                    amount_ht = $7, tax_rate_applied = $8, amount_tax = $9, amount_ttc = $10,
                    setup_amount_ht = $11, mrr_amount_ht = $12,
                    is_recurring = $13, is_perpetual = $14, engagement_until = $15,
                    tier_at_won = $16
              WHERE id = $1
              RETURNING id, amount, rate, deal_value, created_at`,
            [existingCom.id, amount, rate, effectiveDealValue, effEngagement, effPeriods,
             breakdown.amount_ht, breakdown.tax_rate, breakdown.amount_tax, breakdown.amount_ttc,
             setupAmountHt, mrrAmountHt,
             isRecurringEff, isPerpetualEff, engagementUntilEff, tierAtWonEff]
          ));
        } else {
          // Already approved or further along — keep numbers in sync
          // with the latest deal_value but don't fire the
          // commission.created webhook (it isn't a fresh creation).
          // The breakdown is re-snapshotted too: pay-qonto will
          // re-do it fresh anyway right before wiring, so this stays
          // consistent with what the partner actually receives.
          // G1 : setup_amount_ht et mrr_amount_ht resync aussi pour
          // qu'un edit deal_value/setup_value post-approval garde la
          // décomposition cohérente.
          ({ rows: [createdCommission] } = await client.query(
            `UPDATE commissions
                SET amount = $2, deal_value = $3,
                    engagement_type = $4, engagement_periods = $5,
                    amount_ht = $6, tax_rate_applied = $7, amount_tax = $8, amount_ttc = $9,
                    setup_amount_ht = $10, mrr_amount_ht = $11
              WHERE id = $1
              RETURNING id, amount, rate, deal_value, created_at`,
            [existingCom.id, amount, effectiveDealValue, effEngagement, effPeriods,
             breakdown.amount_ht, breakdown.tax_rate, breakdown.amount_tax, breakdown.amount_ttc,
             setupAmountHt, mrrAmountHt]
          ));
        }

        // Outgoing webhook: commission.created (only on the real
        // first-time creation, not on subsequent value sync updates).
        if (!existingCom && createdCommission) {
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
    }

    // Reverse: if the deal moves OUT of 'won' (back to proposition,
    // contacted, etc.), drop the still-unapproved commission so it
    // doesn't linger in "À approuver". A commission that already moved
    // to awaiting_invoice / pending_validation / paid is preserved —
    // those states represent real-world money flows we can't undo by
    // dragging a card. Legacy behaviour byte-for-byte preserved here.
    if (leftWon) {
      await client.query(
        `DELETE FROM commissions
          WHERE referral_id = $1 AND status = 'pending_approval'`,
        [req.params.id]
      );

      // J6-CLOSED-LOST-FIX — cascade E4 retirée : un passage en 'lost'
      // ne flip plus la commission engagée en 'cancelled'. Les
      // commissions approved+ (awaiting_invoice / pending_validation /
      // paid) sont PRÉSERVÉES intactes (dans un batch ou non), à payer
      // normalement. Seules les commissions encore 'pending_approval'
      // (non engagées) sont supprimées ci-dessus, pour ne pas laisser
      // d'orpheline morte dans la file "À approuver". L'arrêt du
      // recurring est garanti par le filtre r.status='won' du worker E5
      // (commissions.js prepareRecurringRenewals) — aucune action requise
      // ici. Les endpoints "Décisions après lost" restent en place pour
      // les éventuelles rows 'cancelled' legacy.
    }

    // Notify partner of status changes
    if (status && status !== current.status) {
      const { rows: [partnerUser] } = await client.query(
        `SELECT u.email, u.full_name
         FROM users u JOIN referrals r ON u.partner_id = r.partner_id
         WHERE r.id = $1 AND r.deleted_at IS NULL LIMIT 1`,
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
              WHERE r.id = $1 AND r.deleted_at IS NULL AND u.is_active = TRUE`,
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
      // Email/in-app blast still gated on a meaningful deal value —
      // emailing partners about a 0 € commission would be noise. The
      // commission row itself was already created above for admin
      // approval regardless.
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
       WHERE r.id = $1 AND r.deleted_at IS NULL`,
      [req.params.id]
    );

    if (status && status !== current.status) {
      logAudit(req, 'referral.status_changed', 'referral', req.params.id, {
        from: current.status,
        to: status,
      });
      // J6-CLOSED-LOST-FIX — trace dédiée du passage en perdu : les
      // commissions engagées sont préservées (plus de cascade cancel),
      // le recurring s'arrête via le filtre worker E5 (status='won').
      if (status === 'lost') {
        logAudit(req, 'referral.closed_lost', 'referral', req.params.id, {
          from: current.status,
          lost_reason: (typeof lost_reason === 'string' && lost_reason.trim()) || null,
          commissions_preserved: true,
        });
      }
    }

    // ─── Pipedrive auto-push (fire-and-forget) ────────────────────────
    // Same posture as the create path — setImmediate so the response
    // flushes first, errors swallowed and logged to crm_sync_log.
    // The push picks up the status flip too, so won/lost transitions
    // mirror back into Pipedrive automatically.
    setImmediate(() => {
      pipedriveService.pushReferralToPipedrive(req.params.id, req.tenantId).catch(e => {
        console.error('[pipedrive.autopush.update]', req.params.id, e.message);
      });
    });

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
    // Get the referral (with tenant check). Skip already-deleted rows
    // so a double-delete returns 404 cleanly.
    let selectQuery = 'SELECT * FROM referrals WHERE id = $1 AND deleted_at IS NULL';
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

    // Mirror the guards on DELETE /commissions/:id — once money has
    // moved (paid) or is mid-flight on Qonto, we can't pretend the
    // commission never existed by cascade-deleting the parent deal.
    const { rows: blockers } = await query(
      `SELECT id, status, qonto_transfer_id, payment_completed_at
         FROM commissions
        WHERE referral_id = $1
          AND deleted_at IS NULL
          AND (status = 'paid'
               OR (qonto_transfer_id IS NOT NULL AND payment_completed_at IS NULL))`,
      [req.params.id]
    );
    if (blockers.length > 0) {
      const inFlight = blockers.some(c => c.qonto_transfer_id && !c.payment_completed_at);
      if (inFlight) {
        return res.status(409).json({
          error: 'transfer_in_flight',
          message: 'Un virement est en cours pour une commission liée à ce deal. Annulez-le côté Qonto avant de supprimer le deal.',
        });
      }
      return res.status(409).json({
        error: 'commission_paid',
        message: 'Ce deal a une commission déjà payée et ne peut pas être supprimé.',
      });
    }

    // Soft delete: stamp deleted_at + deleted_by on the deal and any
    // linked commissions. referral_activities are kept untouched —
    // restoring the deal restores them too. The Corbeille worker
    // permanently removes rows older than 30 days.
    const userId = req.user?.id || null;
    await client.query('BEGIN');
    await client.query(
      'UPDATE commissions SET deleted_at = NOW(), deleted_by = $1 WHERE referral_id = $2 AND deleted_at IS NULL',
      [userId, req.params.id]
    );
    await client.query(
      'UPDATE referrals SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
      [userId, req.params.id]
    );
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

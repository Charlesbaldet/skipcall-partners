// Public endpoints for partner-registration forms — étape 3/6.
//
// No auth. Tenant is resolved via form_id → forms.tenant_id (not via
// Host header) because partners embed the form on their own domains.
// Authorisation is replaced by:
//   - Form must be published (is_published = true, deleted_at NULL).
//   - Partner attribution requires a valid ?p=<token>; missing or
//     unknown tokens are rejected up front so anonymous traffic
//     doesn't create unattributed leads.
//   - Honeypot field `website` on submit silently 200s bots that
//     fill every input. The bait is hidden via CSS on the FE, so a
//     real user never sees it.
//   - DB-backed per-IP rate limit, separate row table from the
//     /apply rate limiter so the two features can't drain each
//     other's quota.
const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');
const { ensureSystemUser } = require('../services/systemUser');
// Side-effects parity with manual referral creation: CRM push,
// Notion push, outgoing webhook, in-app + email notifications.
// Form submissions used to bypass all four — fixed in item 1.
const crmService = require('../services/crmService');
const notionService = require('../services/notionService');
const pipedriveService = require('../services/pipedriveService');
const { sendWebhookEvent } = require('../services/webhookService');
const notify = require('../services/notifyService');
const resend = require('../services/resend');
const templates = require('../services/email-templates');

const router = express.Router();

// Rate limit: 5 submissions per hour per IP — symmetrical with the
// /apply public form. Uses a dedicated table so we don't share the
// counter with partner-application submissions.
const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

// Event-endpoint rate limit. Permissive (60 events/min) because a
// normal funnel completion legitimately emits ~10 events; we want
// headroom for retries + the auto-resize tracking on slow networks.
// Reuses the SUBMIT_WINDOW_MS pattern in its own table so the two
// counters don't compete.
const EVENT_LIMIT = 60;
const EVENT_WINDOW_MS = 60 * 1000;

async function checkEventRateLimit(ip) {
  const newResetAt = new Date(Date.now() + EVENT_WINDOW_MS);
  const { rows: [row] } = await query(
    `INSERT INTO form_event_rate_limits (ip, attempt_count, reset_at)
     VALUES ($1, 1, $2)
     ON CONFLICT (ip) DO UPDATE
       SET attempt_count = CASE
             WHEN form_event_rate_limits.reset_at < NOW() THEN 1
             ELSE form_event_rate_limits.attempt_count + 1
           END,
           reset_at = CASE
             WHEN form_event_rate_limits.reset_at < NOW() THEN $2
             ELSE form_event_rate_limits.reset_at
           END
     RETURNING attempt_count`,
    [ip, newResetAt]
  );
  return { allowed: row.attempt_count <= EVENT_LIMIT };
}

async function checkSubmitRateLimit(ip) {
  const nowMs = Date.now();
  const newResetAt = new Date(nowMs + SUBMIT_WINDOW_MS);
  const { rows: [row] } = await query(
    `INSERT INTO form_submit_rate_limits (ip, attempt_count, reset_at)
     VALUES ($1, 1, $2)
     ON CONFLICT (ip) DO UPDATE
       SET attempt_count = CASE
             WHEN form_submit_rate_limits.reset_at < NOW() THEN 1
             ELSE form_submit_rate_limits.attempt_count + 1
           END,
           reset_at = CASE
             WHEN form_submit_rate_limits.reset_at < NOW() THEN $2
             ELSE form_submit_rate_limits.reset_at
           END
     RETURNING attempt_count, reset_at`,
    [ip, newResetAt]
  );
  return { allowed: row.attempt_count <= SUBMIT_LIMIT };
}

function clientIp(req) {
  return req.ip
    || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.connection?.remoteAddress
    || 'unknown';
}

// GET /api/f/:formId — public form metadata + fields. Requires ?p=
// to attribute a partner; we reject anonymous loads to keep
// unattributable leads from being created.
router.get('/:formId', async (req, res) => {
  try {
    const formId = req.params.formId;
    const partnerToken = req.query.p;
    if (!partnerToken) return res.status(400).json({ error: 'invalid_link' });

    const { rows: tokenRows } = await query(
      `SELECT fpt.partner_id, p.name AS partner_name, p.tenant_id
         FROM form_partner_tokens fpt
         JOIN partners p ON p.id = fpt.partner_id
        WHERE fpt.form_id = $1 AND fpt.token = $2 AND p.deleted_at IS NULL
        LIMIT 1`,
      [formId, partnerToken]
    );
    if (!tokenRows.length) return res.status(404).json({ error: 'invalid_link' });
    const partner = tokenRows[0];

    const { rows: formRows } = await query(
      `SELECT id, tenant_id, title, description, thank_you_message,
              is_published, step_count, appointment_enabled, appointment_url, deleted_at
         FROM forms WHERE id = $1 LIMIT 1`,
      [formId]
    );
    if (!formRows.length || formRows[0].deleted_at) return res.status(404).json({ error: 'form_not_found' });
    const form = formRows[0];
    if (!form.is_published) return res.status(410).json({ error: 'form_not_available' });

    const { rows: fields } = await query(
      `SELECT id, step, order_index, type, label, placeholder, required, options, config, field_role
         FROM form_fields
        WHERE form_id = $1
        ORDER BY step ASC, order_index ASC, created_at ASC`,
      [formId]
    );

    res.json({
      form: {
        id: form.id,
        title: form.title,
        description: form.description,
        thank_you_message: form.thank_you_message,
        step_count: form.step_count,
        appointment_enabled: form.appointment_enabled,
        appointment_url: form.appointment_url,
      },
      fields,
      partner: { id: partner.partner_id, name: partner.partner_name },
    });
  } catch (err) {
    console.error('[formsPublic.GET] failed:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ─── Submit ─────────────────────────────────────────────────────────

// Map an answers array to the legacy referrals columns.
//
// Two paths:
//
//   1. field.field_role is set (v50+, standard lead fields seeded at
//      form creation): the role maps 1:1 to the column. Deterministic,
//      no heuristic needed. Roles: contact_first_name,
//      contact_last_name, prospect_email, prospect_phone,
//      prospect_company, prospect_role.
//
//   2. field.field_role is null (custom field, OR a legacy field
//      created before v50): fall back to the older heuristic — by
//      field type first (email → prospect_email, phone →
//      prospect_phone), then by label keyword. Anything still
//      unmapped goes into the notes JSON-ish blob.
//
// prospect_name (referrals.prospect_name, NOT NULL) is composed last
// from contact_first_name + contact_last_name when both are set, so
// existing read sites that key off prospect_name keep working.
function pickMapping(fields, answers) {
  const ansByField = new Map();
  for (const a of answers) ansByField.set(a.fieldId, a.value);
  const ordered = [...fields].sort((a, b) =>
    a.step - b.step || a.order_index - b.order_index
  );

  const used = new Set();
  let contact_first_name = null;
  let contact_last_name = null;
  let prospect_email = null;
  let prospect_phone = null;
  let prospect_name = null;
  let prospect_company = null;
  let prospect_role = null;

  // Path 1 — explicit field_role wins. Iterate fields first so that
  // standard slots are claimed before any heuristic pass touches them.
  for (const f of ordered) {
    if (!f.field_role) continue;
    const v = ansByField.get(f.id);
    if (v == null || v === '') { used.add(f.id); continue; }
    const sv = String(v);
    switch (f.field_role) {
      case 'contact_first_name': contact_first_name = sv; break;
      case 'contact_last_name':  contact_last_name = sv;  break;
      case 'prospect_email':     prospect_email = sv;     break;
      case 'prospect_phone':     prospect_phone = sv;     break;
      case 'prospect_company':   prospect_company = sv;   break;
      case 'prospect_role':      prospect_role = sv;      break;
    }
    used.add(f.id);
  }

  // Path 2 — legacy heuristic for custom / pre-v50 fields. Only fills
  // slots that path 1 left empty.
  const nameRe    = /(nom|name|prénom|prenom|firstname|lastname)/i;
  const companyRe = /(entreprise|société|societe|company|organisation|firma|empresa|azienda|bedrijf|empresa)/i;
  const roleRe    = /(rôle|role|poste|fonction|position|title|job|cargo|ruolo|functie)/i;

  for (const f of ordered) {
    if (used.has(f.id)) continue;
    const v = ansByField.get(f.id);
    if (v == null || v === '') continue;
    if (f.type === 'email' && !prospect_email)      { prospect_email = String(v); used.add(f.id); }
    else if (f.type === 'phone' && !prospect_phone) { prospect_phone = String(v); used.add(f.id); }
  }
  for (const f of ordered) {
    if (used.has(f.id)) continue;
    if (f.type !== 'text_short') continue;
    const v = ansByField.get(f.id);
    if (v == null || v === '') continue;
    const label = f.label || '';
    if (companyRe.test(label) && !prospect_company)    { prospect_company = String(v); used.add(f.id); }
    else if (roleRe.test(label) && !prospect_role)     { prospect_role = String(v);    used.add(f.id); }
  }
  for (const f of ordered) {
    if (used.has(f.id)) continue;
    if (f.type !== 'text_short') continue;
    const v = ansByField.get(f.id);
    if (v == null || v === '') continue;
    const label = f.label || '';
    if (nameRe.test(label) && !prospect_name) { prospect_name = String(v); used.add(f.id); }
  }
  // Fallback name: first unused text_short.
  if (!prospect_name) {
    for (const f of ordered) {
      if (used.has(f.id)) continue;
      if (f.type !== 'text_short') continue;
      const v = ansByField.get(f.id);
      if (v == null || v === '') continue;
      prospect_name = String(v); used.add(f.id); break;
    }
  }

  // Compose prospect_name from first/last when path 1 supplied them.
  if (!prospect_name) {
    const composed = [contact_first_name, contact_last_name].filter(Boolean).join(' ').trim();
    if (composed) prospect_name = composed;
  }

  // Notes: every remaining field, formatted "Label: value". Multi-value
  // answers (multi_select) are joined with ', '.
  const notesLines = [];
  for (const f of ordered) {
    if (used.has(f.id)) continue;
    const v = ansByField.get(f.id);
    if (v == null || v === '') continue;
    const printable = Array.isArray(v) ? v.join(', ') : String(v);
    notesLines.push(`${f.label}: ${printable}`);
  }
  const notes = notesLines.length ? notesLines.join('\n') : null;

  return {
    contact_first_name, contact_last_name,
    prospect_email, prospect_phone, prospect_name, prospect_company, prospect_role,
    notes,
  };
}

router.post('/:formId/submit', async (req, res) => {
  try {
    // Honeypot: silently 200 so bots don't learn the rejection signal.
    if (req.body && typeof req.body.website === 'string' && req.body.website.length > 0) {
      return res.status(200).json({ ok: true });
    }

    const formId = req.params.formId;
    const partnerToken = req.body?.partnerToken;
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : null;
    if (!partnerToken || !answers) return res.status(400).json({ error: 'invalid_payload' });

    // Rate limit. Fail-open on DB hiccup so a transient PG issue
    // doesn't break submissions.
    try {
      const { allowed } = await checkSubmitRateLimit(clientIp(req));
      if (!allowed) return res.status(429).json({ error: 'rate_limited' });
    } catch (rlErr) {
      console.error('[formsPublic.submit] rate-limit check failed:', rlErr.message);
    }

    // Resolve token → partner_id.
    const { rows: tokenRows } = await query(
      `SELECT fpt.partner_id, p.tenant_id
         FROM form_partner_tokens fpt
         JOIN partners p ON p.id = fpt.partner_id
        WHERE fpt.form_id = $1 AND fpt.token = $2 AND p.deleted_at IS NULL
        LIMIT 1`,
      [formId, partnerToken]
    );
    if (!tokenRows.length) return res.status(404).json({ error: 'invalid_link' });
    const partnerId = tokenRows[0].partner_id;
    const tenantId  = tokenRows[0].tenant_id;

    // Form must still be published.
    const { rows: formRows } = await query(
      `SELECT id, tenant_id, default_lead_handling, is_published, deleted_at
         FROM forms WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [formId, tenantId]
    );
    if (!formRows.length || formRows[0].deleted_at) return res.status(404).json({ error: 'form_not_found' });
    const form = formRows[0];
    if (!form.is_published) return res.status(410).json({ error: 'form_not_available' });

    // Load the field schema so we can map answers to referral columns.
    const { rows: fields } = await query(
      `SELECT id, step, order_index, type, label, required, field_role FROM form_fields
        WHERE form_id = $1 ORDER BY step ASC, order_index ASC, created_at ASC`,
      [formId]
    );

    // Enforce required fields server-side: the FE validates too but
    // we don't trust it.
    const ansByField = new Map(answers.map(a => [a.fieldId, a.value]));
    for (const f of fields) {
      if (!f.required) continue;
      const v = ansByField.get(f.id);
      const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) return res.status(400).json({ error: 'missing_required', fieldId: f.id });
    }

    const map = pickMapping(fields, answers);

    // Synthetic fallbacks to keep the referrals NOT NULL constraints
    // satisfied without auditing every downstream read site (see étape
    // 1 rapport — option B). For prospect_email, .local TLD never
    // routes so a stray notification can't leak to a real inbox.
    const prospect_name = map.prospect_name || `Lead du ${new Date().toLocaleDateString('fr-FR')}`;
    const prospect_email = map.prospect_email
      || `lead+${crypto.randomBytes(8).toString('hex')}@noemail.refboost.local`;
    const prospect_company = map.prospect_company || prospect_name;
    const prospect_phone = map.prospect_phone || null;
    const prospect_role = map.prospect_role || null;
    const contact_first_name = map.contact_first_name || null;
    const contact_last_name = map.contact_last_name || null;
    const notes = map.notes || null;

    // System user owns submitted_by for form-originated rows. Lazy-
    // creates the per-tenant placeholder on first submission.
    const systemUserId = await ensureSystemUser(tenantId);

    // Default-stage lookup: identical to routes/referrals.js so a form
    // lead lands in the same Kanban column as a manually-submitted one.
    let defaultStageId = null;
    try {
      const { rows: sr } = await query(
        'SELECT id FROM pipeline_stages WHERE tenant_id = $1 ORDER BY position ASC LIMIT 1',
        [tenantId]
      );
      defaultStageId = sr[0]?.id || null;
    } catch {}

    const leadHandling = form.default_lead_handling || 'partner_managed';

    const { rows: refRows } = await query(
      `INSERT INTO referrals
        (partner_id, submitted_by, prospect_name, prospect_email,
         prospect_phone, prospect_company, prospect_role,
         contact_first_name, contact_last_name,
         recommendation_level, notes, tenant_id, stage_id, lead_handling,
         source, form_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'warm', $10, $11, $12, $13, 'form', $14)
       RETURNING *`,
      [
        partnerId, systemUserId, prospect_name, prospect_email,
        prospect_phone, prospect_company, prospect_role,
        contact_first_name, contact_last_name,
        notes, tenantId, defaultStageId, leadHandling, formId,
      ]
    );
    const referral = refRows[0];

    res.status(201).json({ ok: true, referral_id: referral.id });

    // ─── Side-effects (fire-and-forget) ────────────────────────────
    // Pulled out of the response path so the prospect always sees
    // success even if a CRM or partner SMTP is down. Each block
    // swallows its own errors; we never log to the prospect.
    runFormSubmissionSideEffects(referral, { partnerId, tenantId, formId }).catch(err => {
      console.error('[formsPublic.submit.sideEffects]', err.message);
    });
    // Pipedrive auto-push (P3). Isolated from runFormSubmissionSideEffects
    // so a Pipedrive 4xx never trips an unrelated side-effect; the
    // service logs its own failures into crm_sync_log.
    setImmediate(() => {
      pipedriveService.pushReferralToPipedrive(referral.id, tenantId).catch(e => {
        console.error('[pipedrive.autopush.formSubmit]', referral.id, e.message);
      });
    });
  } catch (err) {
    console.error('[formsPublic.submit] failed:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// Hooks every channel that a manual /api/referrals POST hits. Same
// CRM/Notion/webhook fan-out, plus dedicated `new_form_lead` admin
// notifications (so admins can mute form leads independently from
// manual referrals) and a partner notification scoped to the OWNING
// partner only (never fanoutPartnerNotification — that broadcasts
// to every partner of the tenant and would leak the form lead's
// existence to competitors).
async function runFormSubmissionSideEffects(referral, { partnerId, tenantId, formId }) {
  // Resolve partner name + form title once, both used in the email
  // bodies and the webhook payload.
  const { rows: [partner] } = await query(
    `SELECT id, name, email FROM partners WHERE id = $1`,
    [partnerId]
  );
  const { rows: [form] } = await query(
    `SELECT id, title FROM forms WHERE id = $1`,
    [formId]
  );

  // 1. CRM push (HubSpot / Salesforce). Wrapped in catch so a CRM
  //    outage never propagates here.
  crmService.pushReferralToCRM({ ...referral, partner_name: partner?.name || null }, tenantId).catch(() => {});
  // 2. Notion push. Short-circuits internally when notion_connected=false.
  notionService.pushReferralToNotion({ ...referral, partner_name: partner?.name || null }, tenantId).catch(() => {});
  // 3. Outgoing webhook — same shape as manual referrals so customers
  //    have a single subscription contract regardless of source.
  sendWebhookEvent(tenantId, 'referral.created', {
    referral_id: referral.id,
    partner_id: partnerId,
    partner_name: partner?.name || null,
    partner_email: partner?.email || null,
    prospect_name: referral.prospect_name,
    prospect_company: referral.prospect_company,
    prospect_email: referral.prospect_email,
    prospect_phone: referral.prospect_phone,
    notes: referral.notes,
    source: 'form',
    form_id: formId,
    created_at: referral.created_at,
  });

  // 4. Admin in-app + email — gated by the tenant's new_form_lead pref.
  const dashUrl = (process.env.FRONTEND_URL || 'https://refboost.io') + '/referrals';
  const formLabel = form?.title || 'Formulaire d\'inscription';
  const prospectLabel = referral.prospect_name || 'Nouveau prospect';
  const adminMessage = `Un prospect a rempli votre formulaire « ${formLabel} »${referral.prospect_company ? ' — ' + referral.prospect_company : ''}.`;

  notify.fanoutAdminNotification(tenantId, 'new_form_lead', {
    title: `Nouveau lead via formulaire — ${prospectLabel}`,
    message: adminMessage,
    link: '/referrals',
  }, { includeCommercial: true }).catch(() => {});

  notify.shouldNotify(tenantId, 'new_form_lead').then(async pref => {
    if (!pref.email) return;
    const admins = await notify.adminEmails(tenantId).catch(() => []);
    for (const admin of admins) {
      const bodyHtml = `
        <p style="margin:0 0 16px;">Bonjour ${admin.full_name || ''},</p>
        <p style="margin:0 0 16px;">Un nouveau prospect a rempli votre formulaire d'inscription :</p>
        <div style="margin:16px 0;padding:16px;background:#eef2ff;border-radius:10px;border-left:4px solid #6366f1;">
          <div style="font-weight:700;font-size:16px;color:#1f2937;">${prospectLabel}</div>
          ${referral.prospect_company ? `<div style="color:#6b7280;font-size:14px;">${referral.prospect_company}</div>` : ''}
          ${referral.prospect_email ? `<div style="color:#6b7280;font-size:13px;margin-top:4px;">${referral.prospect_email}</div>` : ''}
          <div style="margin-top:8px;font-size:12px;color:#6b7280;">Via le lien du partenaire <strong>${partner?.name || ''}</strong>.</div>
        </div>`;
      const html = templates.baseLayout({
        title: 'Nouveau lead via formulaire',
        preheader: `Un prospect a rempli votre formulaire : ${prospectLabel}`,
        bodyHtml,
        ctaLabel: 'Voir dans le pipeline',
        ctaUrl: dashUrl,
      });
      resend.sendAndLog({
        to: admin.email,
        subject: `Nouveau lead via formulaire : ${prospectLabel}`,
        html,
        text: `Nouveau lead via formulaire : ${prospectLabel}. Voir : ${dashUrl}`,
        template: 'new_form_lead',
        payload: { recipient_name: admin.full_name, prospect_name: prospectLabel, form_title: formLabel, referral_id: referral.id, partner_name: partner?.name },
        query,
      }).catch(() => {});
    }
  }).catch(() => {});

  // 5. Partner notification — STRICTLY scoped to the owning partner.
  //    Do NOT use notify.fanoutPartnerNotification: that broadcasts
  //    to every partner of the tenant and would leak the lead's
  //    existence to competitors. We query users where partner_id =
  //    THIS partner_id only, then loop to createNotification + email.
  //    Email is per-partner-pref gated via partners.notification_preferences.email_new_form_lead.
  try {
    const { rows: partnerUsers } = await query(
      `SELECT id, email, full_name
         FROM users
        WHERE partner_id = $1 AND is_active = TRUE`,
      [partnerId]
    );
    if (partnerUsers.length) {
      const partnerPref = await notify.shouldNotifyPartner(partnerId, 'email_new_form_lead').catch(() => ({ email: true }));
      for (const pu of partnerUsers) {
        // In-app: always on (per the partner notif model — see notes
        // in services/notifyService.js fanoutPartnerNotification).
        notify.createNotification(pu.id, 'new_form_lead', {
          title: `Nouveau lead via votre lien — ${prospectLabel}`,
          message: `Un prospect a rempli votre formulaire d'inscription.`,
          link: '/partner/referrals',
          tenantId,
        }, { skipPreferenceCheck: true }).catch(() => {});
        // Email: per-partner pref.
        if (partnerPref.email !== false) {
          const bodyHtml = `
            <p style="margin:0 0 16px;">Bonjour ${pu.full_name || ''},</p>
            <p style="margin:0 0 16px;">Un nouveau prospect a rempli votre formulaire d'inscription. Le lead vous est attribué automatiquement.</p>
            <div style="margin:16px 0;padding:16px;background:#f0fdf4;border-radius:10px;border-left:4px solid #059669;">
              <div style="font-weight:700;font-size:16px;color:#1f2937;">${prospectLabel}</div>
              ${referral.prospect_company ? `<div style="color:#6b7280;font-size:14px;">${referral.prospect_company}</div>` : ''}
              ${referral.prospect_email ? `<div style="color:#6b7280;font-size:13px;margin-top:4px;">${referral.prospect_email}</div>` : ''}
            </div>`;
          const html = templates.baseLayout({
            title: 'Nouveau lead via votre lien',
            preheader: `Nouveau lead : ${prospectLabel}`,
            bodyHtml,
            ctaLabel: 'Voir le lead',
            ctaUrl: (process.env.FRONTEND_URL || 'https://refboost.io') + '/partner/referrals',
          });
          resend.sendAndLog({
            to: pu.email,
            subject: `Nouveau lead via votre lien : ${prospectLabel}`,
            html,
            text: `Nouveau lead via votre lien : ${prospectLabel}.`,
            template: 'new_form_lead_partner',
            payload: { recipient_name: pu.full_name, prospect_name: prospectLabel, referral_id: referral.id },
            query,
          }).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('[formsPublic.submit.partnerNotify]', e.message);
  }
}

// POST /api/f/:formId/event — funnel instrumentation.
//
// Fire-and-forget from the FE: returns 204 with no body. The client
// doesn't wait or retry. We accept the loss of an event when the
// rate limiter / a transient PG hiccup hits — better than blocking
// the prospect's UX. Tenant is resolved via form_id → forms.tenant_id
// rather than the auth context (this endpoint has no auth at all).
const VALID_EVENT_TYPES = new Set(['form_view', 'form_start', 'step_complete', 'field_abandon', 'form_submit']);
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

router.post('/:formId/event', async (req, res) => {
  try {
    // Rate limit first so we drop bursty bots before touching the
    // forms table.
    try {
      const { allowed } = await checkEventRateLimit(clientIp(req));
      if (!allowed) return res.status(204).end();
    } catch (rlErr) {
      console.error('[formsPublic.event] rate-limit check failed:', rlErr.message);
      // Fail-open: continue with the insert below.
    }

    const formId = req.params.formId;
    const { event_type, session_id, partner_token, step_index, field_id } = req.body || {};

    if (!VALID_EVENT_TYPES.has(event_type)) return res.status(204).end();
    if (typeof session_id !== 'string' || !SESSION_ID_RE.test(session_id)) return res.status(204).end();

    // Resolve tenant via form_id (no auth, no Host trust).
    const { rows: formRows } = await query(
      `SELECT tenant_id FROM forms WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [formId]
    );
    if (!formRows.length) return res.status(204).end();
    const tenantId = formRows[0].tenant_id;

    const safeStep = Number.isInteger(step_index) && step_index >= 1 && step_index <= 5 ? step_index : null;
    const safeField = typeof field_id === 'string' && /^[0-9a-f-]{36}$/i.test(field_id) ? field_id : null;
    const safeToken = typeof partner_token === 'string' && partner_token.length <= 64 ? partner_token : null;
    const userAgent = (req.headers['user-agent'] || '').slice(0, 1000) || null;
    const ip = clientIp(req);

    await query(
      `INSERT INTO form_events
        (form_id, tenant_id, partner_token, session_id, event_type, step_index, field_id, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::inet)`,
      [formId, tenantId, safeToken, session_id, event_type, safeStep, safeField, userAgent, ip]
    );

    res.status(204).end();
  } catch (err) {
    // Best-effort: log + 204 so the FE never sees a failure code.
    console.error('[formsPublic.event] failed:', err.message);
    res.status(204).end();
  }
});

module.exports = router;

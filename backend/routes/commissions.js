const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, partnerScope, tenantScope } = require('../middleware/auth');
const resend = require('../services/resend');
const templates = require('../services/email-templates');
const { sendEmail } = require('../services/emailService');
const notify = require('../services/notifyService');
const { sendWebhookEvent } = require('../services/webhookService');

const router = express.Router();

router.use(authenticate);
router.use(tenantScope);
router.use(partnerScope);

// Helper: compute next quarter end from a date
function nextQuarterEnd(date) {
  const d = new Date(date);
  const month = d.getMonth();
  const quarterEnd = Math.ceil((month + 1) / 3) * 3;
  const nextQ = new Date(d.getFullYear(), quarterEnd + 3, 0);
  return nextQ.toISOString().split('T')[0];
}

const NEW_STATUSES = ['pending_approval', 'awaiting_invoice', 'pending_validation', 'paid'];

// Translate legacy status values that older clients may still send.
function normalizeStatus(s) {
  if (!s) return null;
  if (s === 'pending' || s === 'to_approve') return 'pending_approval';
  if (s === 'approved') return 'awaiting_invoice';
  if (NEW_STATUSES.includes(s)) return s;
  return null;
}

// ─── List commissions ───
router.get('/', async (req, res) => {
  try {
    const { status, partner_id, approval_status } = req.query;
    let where = [];
    let params = [];
    let i = 1;

    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`c.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    if (req.partnerScope) {
      where.push(`c.partner_id = $${i++}`);
      params.push(req.partnerScope);
    } else if (partner_id) {
      where.push(`c.partner_id = $${i++}`);
      params.push(partner_id);
    }

    if (status && status !== 'all') {
      const norm = normalizeStatus(status);
      if (norm) {
        where.push(`c.status = $${i++}`);
        params.push(norm);
      }
    }
    if (approval_status && approval_status !== 'all') {
      where.push(`c.approval_status = $${i++}`);
      params.push(approval_status);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT c.id, c.referral_id, c.partner_id, c.amount, c.rate, c.deal_value,
              c.status, c.approval_status, c.rejection_reason,
              c.approved_at, c.paid_at, c.created_at, c.tenant_id,
              c.invoice_uploaded_at,
              (c.invoice_url IS NOT NULL) AS has_invoice,
              c.qonto_transfer_id, c.payment_initiated_at, c.payment_completed_at,
              c.payment_reference, c.payment_error,
              (c.qonto_sca_session_token IS NOT NULL) AS sca_pending,
              p.name as partner_name, p.contact_name as partner_contact,
              r.prospect_name, r.prospect_company
       FROM commissions c
       JOIN partners p ON c.partner_id = p.id
       JOIN referrals r ON c.referral_id = r.id
       ${whereClause}
       ORDER BY c.created_at DESC`,
      params
    );

    const totalPending = rows.filter(r => r.status === 'pending_approval').reduce((s, r) => s + parseFloat(r.amount), 0);
    const totalApproved = rows.filter(r => r.status === 'awaiting_invoice' || r.status === 'pending_validation').reduce((s, r) => s + parseFloat(r.amount), 0);
    const totalPaid = rows.filter(r => r.status === 'paid').reduce((s, r) => s + parseFloat(r.amount), 0);

    const enriched = rows.map(c => ({
      ...c,
      payment_due_date: c.approved_at ? nextQuarterEnd(c.approved_at) : null,
      is_late: c.approved_at && c.status !== 'paid' && new Date(nextQuarterEnd(c.approved_at)) < new Date(),
    }));

    res.json({ commissions: enriched, totalPending, totalApproved, totalPaid });
  } catch (err) {
    console.error('List commissions error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Summary by partner ───
router.get('/summary', authorize('admin', 'commercial'), async (req, res) => {
  try {
    let where = ['p.is_active = true'];
    let params = [];
    let i = 1;

    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`p.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    const { rows } = await query(
      `SELECT p.id, p.name, p.contact_name, p.commission_rate,
              COUNT(c.id) as total_commissions,
              COALESCE(SUM(c.amount), 0) as total_amount,
              COALESCE(SUM(CASE WHEN c.status = 'pending_approval' THEN c.amount END), 0) as pending_amount,
              COALESCE(SUM(CASE WHEN c.status IN ('awaiting_invoice','pending_validation') THEN c.amount END), 0) as approved_amount,
              COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.amount END), 0) as paid_amount,
              COALESCE(SUM(c.deal_value), 0) as total_deal_value
       FROM partners p
       LEFT JOIN commissions c ON p.id = c.partner_id
       WHERE ${where.join(' AND ')}
       GROUP BY p.id
       ORDER BY total_amount DESC`,
      params
    );
    res.json({ summary: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Update commission status (admin only) ───
// Accepts the new lifecycle values. Legacy values ('pending','approved')
// are translated for backwards compat. 'paid' here is the
// admin's "Valider le paiement" action from the pending_validation column.
router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const status = normalizeStatus(req.body.status);
    if (!status) return res.status(400).json({ error: 'Statut invalide' });

    const approvedAt = (status === 'awaiting_invoice') ? new Date().toISOString() : null;
    const paidAt = status === 'paid' ? new Date().toISOString() : null;

    let whereExtra = '';
    let params = [req.params.id, status, approvedAt, paidAt];
    if (req.tenantId && !req.skipTenantFilter) {
      whereExtra = ' AND tenant_id = $5';
      params.push(req.tenantId);
    }

    const { rows: [commission] } = await query(
      `UPDATE commissions SET status = $2, approved_at = COALESCE($3, approved_at), paid_at = COALESCE($4, paid_at)
       WHERE id = $1${whereExtra}
       RETURNING *`,
      params
    );

    if (!commission) return res.status(404).json({ error: 'Commission introuvable' });

    commission.payment_due_date = commission.approved_at ? nextQuarterEnd(commission.approved_at) : null;
    commission.is_late = commission.approved_at && commission.status !== 'paid' && new Date(nextQuarterEnd(commission.approved_at)) < new Date();

    if (status === 'awaiting_invoice' || status === 'paid') {
      const emailKey = status === 'paid' ? 'commission_paid' : 'commission_validated';
      (async () => {
        try {
          const { rows: [enriched] } = await query(
            `SELECT c.id, c.amount, c.status, c.referral_id, c.partner_id,
                    r.prospect_name, r.prospect_company,
                    t.name as tenant_name
             FROM commissions c
             JOIN referrals r ON c.referral_id = r.id
             JOIN partners p ON c.partner_id = p.id
             JOIN tenants t ON p.tenant_id = t.id
             WHERE c.id = $1`,
            [req.params.id]
          );
          if (!enriched) return;
          const { rows: partnerUsers } = await query(
            `SELECT email, full_name FROM users WHERE partner_id = $1 AND is_active = true`,
            [enriched.partner_id]
          );
          const dashboardUrl = (process.env.FRONTEND_URL || 'https://refboost.io') + '/commissions';
          const prospectName = enriched.prospect_name || enriched.prospect_company || 'votre prospect';
          const amount = parseFloat(enriched.amount) || 0;
          for (const u of partnerUsers) {
            const tmpl = status === 'paid'
              ? templates.commissionPaid({ partnerName: u.full_name, prospectName, commissionAmount: amount, currency: '€', dashboardUrl, tenantName: enriched.tenant_name })
              : templates.commissionValidated({ partnerName: u.full_name, prospectName, commissionAmount: amount, currency: '€', dashboardUrl, tenantName: enriched.tenant_name });
            await resend.sendAndLog({
              to: u.email,
              subject: tmpl.subject,
              html: tmpl.html,
              text: tmpl.text,
              template: emailKey,
              payload: { recipient_name: u.full_name, commission_id: enriched.id, amount },
              query,
            });
          }
        } catch (e) { console.error('[commissions.statusChange] email error:', e.message); }
      })();
    }

    res.json({ commission });

    // Outgoing webhooks
    if (status === 'awaiting_invoice' || status === 'paid') {
      (async () => {
        const { rows: [enriched] } = await query(
          `SELECT c.id, c.amount, c.status, c.referral_id, c.partner_id,
                  c.approved_at, c.paid_at,
                  r.prospect_name, r.prospect_company,
                  p.name AS partner_name, p.email AS partner_email
             FROM commissions c
             JOIN referrals r ON c.referral_id = r.id
             JOIN partners p ON c.partner_id = p.id
            WHERE c.id = $1`,
          [req.params.id]
        );
        if (!enriched) return;
        const basePayload = {
          commission_id: enriched.id,
          referral_id: enriched.referral_id,
          partner_id: enriched.partner_id,
          partner_name: enriched.partner_name,
          partner_email: enriched.partner_email,
          prospect_name: enriched.prospect_name,
          prospect_company: enriched.prospect_company,
          amount: parseFloat(enriched.amount) || 0,
          currency: 'EUR',
        };
        if (status === 'awaiting_invoice') {
          sendWebhookEvent(req.tenantId, 'commission.approved', { ...basePayload, approved_at: enriched.approved_at });
        } else if (status === 'paid') {
          sendWebhookEvent(req.tenantId, 'commission.paid', { ...basePayload, paid_at: enriched.paid_at });
        }
      })().catch(() => {});
    }
  } catch (err) {
    console.error('Update commission error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Approve / Reject commission (admin approval flow) ─────────────
async function loadCommissionWithContext(commissionId, tenantId) {
  const { rows } = await query(
    `SELECT c.*, p.name AS partner_name, r.prospect_name
       FROM commissions c
       JOIN partners p ON p.id = c.partner_id
       JOIN referrals r ON r.id = c.referral_id
      WHERE c.id = $1 AND ($2::uuid IS NULL OR c.tenant_id = $2)
      LIMIT 1`,
    [commissionId, tenantId || null]
  );
  return rows[0] || null;
}
async function partnerUsers(partnerId) {
  if (!partnerId) return [];
  const { rows } = await query(
    "SELECT id, email, full_name FROM users WHERE partner_id = $1 AND is_active = TRUE",
    [partnerId]
  );
  return rows;
}
const fmtMoney = (n) => {
  const num = parseFloat(n) || 0;
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num); }
  catch { return num.toFixed(2) + ' €'; }
};

// Admin approve: pending_approval → awaiting_invoice
router.post('/:id/approve', authorize('admin'), async (req, res) => {
  try {
    const existing = await loadCommissionWithContext(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ error: 'Commission introuvable' });
    if (existing.status === 'awaiting_invoice' || existing.status === 'pending_validation' || existing.status === 'paid') {
      return res.json({ commission: existing, noop: true });
    }

    const { rows: [updated] } = await query(
      `UPDATE commissions
          SET status = 'awaiting_invoice',
              approval_status = 'approved',
              rejection_reason = NULL,
              approved_at = COALESCE(approved_at, NOW())
        WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    (async () => {
      try {
        const users = await partnerUsers(existing.partner_id);
        const amountLabel = fmtMoney(existing.amount);
        for (const u of users) {
          notify.createNotification(u.id, 'commission', {
            title: `Commission approuvée — ${amountLabel}`,
            message: `Pour ${existing.prospect_name || 'votre lead'} — merci de déposer votre facture.`,
            link: '/partner/payments',
            tenantId: existing.tenant_id,
          }).catch(() => {});
          const p = await notify.shouldNotifyPartner(existing.partner_id, 'email_commission_update');
          if (p.email) {
            const tpl = require('../utils/emailTemplates').commissionApproved({
              partnerName: u.full_name,
              prospectName: existing.prospect_name,
              amount: existing.amount,
            });
            sendEmail(u.email, tpl.subject, tpl.html).catch(() => {});
          }
        }
      } catch {}
    })();

    res.json({ commission: updated });
  } catch (err) {
    console.error('Approve commission error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/reject', authorize('admin'), async (req, res) => {
  try {
    const { reason } = req.body || {};
    const existing = await loadCommissionWithContext(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ error: 'Commission introuvable' });

    const { rows: [updated] } = await query(
      `UPDATE commissions
          SET approval_status = 'rejected',
              rejection_reason = $2
        WHERE id = $1 RETURNING *`,
      [req.params.id, reason || null]
    );

    (async () => {
      try {
        const users = await partnerUsers(existing.partner_id);
        for (const u of users) {
          notify.createNotification(u.id, 'commission', {
            title: `Commission à revoir — ${existing.prospect_name || ''}`,
            message: reason || 'Votre gestionnaire a demandé une révision.',
            link: '/partner/payments',
            tenantId: existing.tenant_id,
          }).catch(() => {});
          const p = await notify.shouldNotifyPartner(existing.partner_id, 'email_commission_update');
          if (p.email) {
            const tpl = require('../utils/emailTemplates').commissionRejected({
              partnerName: u.full_name,
              prospectName: existing.prospect_name,
              reason,
            });
            sendEmail(u.email, tpl.subject, tpl.html).catch(() => {});
          }
        }
      } catch {}
    })();

    res.json({ commission: updated });
  } catch (err) {
    console.error('Reject commission error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Partner uploads invoice ───
// awaiting_invoice → pending_validation. Body is JSON with a base64 data
// URL: { filename, data_url } where data_url = "data:application/pdf;base64,...".
// Stored verbatim in invoice_url; the GET endpoint streams it back.
router.post('/:id/upload-invoice', async (req, res) => {
  try {
    const { filename, data_url } = req.body || {};
    if (!data_url || typeof data_url !== 'string' || !data_url.startsWith('data:')) {
      return res.status(400).json({ error: 'Fichier requis (PDF)' });
    }

    let where = 'id = $1';
    const params = [req.params.id];
    let i = 2;
    if (req.tenantId && !req.skipTenantFilter) {
      where += ` AND tenant_id = $${i++}`;
      params.push(req.tenantId);
    }
    if (req.partnerScope) {
      where += ` AND partner_id = $${i++}`;
      params.push(req.partnerScope);
    }

    const { rows: [existing] } = await query(`SELECT * FROM commissions WHERE ${where}`, params);
    if (!existing) return res.status(404).json({ error: 'Commission introuvable' });
    if (existing.status !== 'awaiting_invoice') {
      return res.status(409).json({ error: 'Cette commission n\'attend pas de facture' });
    }

    const safeName = (filename && typeof filename === 'string' ? filename : 'invoice.pdf').replace(/[^\w.\-]/g, '_').slice(0, 120);

    const { rows: [updated] } = await query(
      `UPDATE commissions
          SET invoice_url = $2,
              invoice_filename = $3,
              invoice_uploaded_at = NOW(),
              status = 'pending_validation'
        WHERE id = $1 RETURNING id, status, invoice_uploaded_at`,
      [req.params.id, data_url, safeName]
    );

    res.json({ commission: updated });
  } catch (err) {
    // The invoice_filename column is best-effort — if it doesn't exist
    // yet (column was added at runtime), retry without it.
    if (err && /invoice_filename/.test(err.message || '')) {
      try {
        await query(`ALTER TABLE commissions ADD COLUMN IF NOT EXISTS invoice_filename TEXT`);
        const { rows: [updated] } = await query(
          `UPDATE commissions
              SET invoice_url = $2,
                  invoice_filename = $3,
                  invoice_uploaded_at = NOW(),
                  status = 'pending_validation'
            WHERE id = $1 RETURNING id, status, invoice_uploaded_at`,
          [req.params.id, req.body.data_url, (req.body.filename || 'invoice.pdf').replace(/[^\w.\-]/g, '_').slice(0, 120)]
        );
        return res.json({ commission: updated });
      } catch (e2) { console.error('Upload invoice retry error:', e2); }
    }
    console.error('Upload invoice error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Download invoice ───
// Admin: any commission in their tenant. Partner: only their own.
router.get('/:id/invoice', async (req, res) => {
  try {
    let where = 'id = $1';
    const params = [req.params.id];
    let i = 2;
    if (req.tenantId && !req.skipTenantFilter) {
      where += ` AND tenant_id = $${i++}`;
      params.push(req.tenantId);
    }
    if (req.partnerScope) {
      where += ` AND partner_id = $${i++}`;
      params.push(req.partnerScope);
    }

    const { rows: [c] } = await query(
      `SELECT invoice_url,
              COALESCE(NULLIF(invoice_filename, ''), 'invoice.pdf') AS invoice_filename
         FROM commissions WHERE ${where}`,
      params
    );
    if (!c || !c.invoice_url) return res.status(404).json({ error: 'Aucune facture' });

    const m = /^data:([^;]+);base64,(.+)$/.exec(c.invoice_url);
    if (!m) return res.status(500).json({ error: 'Fichier corrompu' });
    const mime = m[1];
    const buf = Buffer.from(m[2], 'base64');
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${c.invoice_filename}"`);
    res.send(buf);
  } catch (err) {
    if (err && /invoice_filename/.test(err.message || '')) {
      // Older DBs without invoice_filename — fall back to plain SELECT.
      try {
        const { rows: [c] } = await query(`SELECT invoice_url FROM commissions WHERE id = $1`, [req.params.id]);
        if (!c || !c.invoice_url) return res.status(404).json({ error: 'Aucune facture' });
        const m = /^data:([^;]+);base64,(.+)$/.exec(c.invoice_url);
        if (!m) return res.status(500).json({ error: 'Fichier corrompu' });
        res.setHeader('Content-Type', m[1]);
        res.setHeader('Content-Disposition', `attachment; filename="invoice.pdf"`);
        return res.send(Buffer.from(m[2], 'base64'));
      } catch (e2) { console.error('Download invoice fallback error:', e2); }
    }
    console.error('Download invoice error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Qonto payment helpers ─────────────────────────────────────────
// Pulled into their own block so the route handlers stay readable.
const qonto = require('../services/qontoService');
const emailTemplates = require('../utils/emailTemplates');

async function loadPaymentIntegration(tenantId) {
  const { rows } = await query(
    `SELECT bank_account_id, bank_account_iban, is_active
       FROM payment_integrations
      WHERE tenant_id = $1 AND provider = 'qonto'`,
    [tenantId]
  );
  return rows[0] || null;
}

function dataUrlToBuffer(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

// Extract a short, durable error code/message from whatever Qonto's
// API client throws. We must never store the raw JSON body in
// payment_error — the card renders it verbatim and that's how the
// "ugly JSON on the card" bug got there in the first place. Output
// is capped at 200 chars; sca_required short-circuits to null because
// SCA isn't really an error.
function sanitizePaymentError(err) {
  if (!err) return null;
  const raw = err?.body || err?.message || String(err);
  let code = null;
  let message = null;
  // Try JSON-parse the body — Qonto consistently returns
  // { code, message, ... } on errors.
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') {
      code = parsed.code || null;
      message = parsed.message || null;
    }
  } catch { /* not JSON, fall through */ }
  // The api() helper wraps text in "Qonto … failed (…): {…}"; pull
  // the code out of the embedded JSON if we can.
  if (!code && typeof raw === 'string') {
    const jsonStart = raw.indexOf('{');
    if (jsonStart >= 0) {
      try {
        const parsed = JSON.parse(raw.slice(jsonStart));
        code = parsed.code || null;
        message = parsed.message || message;
      } catch {}
    }
  }
  if (code === 'sca_required') return null;
  if (code) return code;
  // Last resort: a plain status-only string from raw error message.
  const m = /failed \((\d+)\)/.exec(typeof raw === 'string' ? raw : '');
  if (m) return `qonto_http_${m[1]}`;
  return (message || 'qonto_error').slice(0, 200);
}

async function loadCommissionForPayment(commissionId, tenantId) {
  const { rows } = await query(
    `SELECT c.id, c.tenant_id, c.amount, c.status, c.qonto_transfer_id,
            c.invoice_url, c.invoice_filename, c.qonto_attachment_id,
            c.qonto_idempotency_key, c.qonto_sca_session_token,
            p.id AS partner_id, p.name AS partner_name,
            p.iban, p.bic, p.account_holder, p.bank_name,
            r.prospect_name, r.prospect_company
       FROM commissions c
       JOIN partners p ON p.id = c.partner_id
       JOIN referrals r ON r.id = c.referral_id
      WHERE c.id = $1 AND ($2::uuid IS NULL OR c.tenant_id = $2)
      LIMIT 1`,
    [commissionId, tenantId || null]
  );
  return rows[0] || null;
}

// ─── POST /commissions/:id/pay-qonto ───────────────────────────────
// Initiates a SEPA transfer for a single commission. Returns 202
// (transfer scheduled, may require SCA) — the polling worker (or an
// inbound Qonto webhook, when wired) flips the commission to 'paid'
// and emails the partner once Qonto reports the transfer completed.
router.post('/:id/pay-qonto', authorize('admin'), async (req, res) => {
  try {
    if (!req.tenantId && !req.skipTenantFilter) return res.status(400).json({ error: 'Tenant introuvable' });

    const integ = await loadPaymentIntegration(req.tenantId);
    if (!integ || !integ.is_active) return res.status(400).json({ error: 'qonto_not_connected' });
    if (!integ.bank_account_id) return res.status(400).json({ error: 'qonto_bank_account_missing' });

    const c = await loadCommissionForPayment(req.params.id, req.tenantId);
    if (!c) return res.status(404).json({ error: 'Commission introuvable' });
    if (c.status !== 'pending_validation') {
      return res.status(409).json({ error: 'commission_not_payable', status: c.status });
    }
    if (!c.iban) return res.status(400).json({ error: 'partner_iban_missing' });
    const amount = parseFloat(c.amount) || 0;
    if (amount <= 0) return res.status(400).json({ error: 'amount_zero' });

    // Upload the partner's invoice to Qonto so the transfer carries it
    // as an attachment. Best-effort: if the upload fails (403 missing
    // scope, network blip, anything) we send the transfer WITHOUT an
    // attachment_ids field — Qonto accepts that, and an attachment
    // failure is never worth blocking a real-money payment over.
    //
    // Critically: do NOT reuse a previously-persisted
    // qonto_attachment_id on retry. Stale IDs from earlier failed
    // attempts (e.g. uploads under a different OAuth grant) reference
    // attachments Qonto can't find, and the bulk endpoint then fails
    // every line with 422 "Not found". Always re-upload fresh; only
    // attach the JUST-uploaded id.
    let attachmentId = null;
    if (c.invoice_url) {
      try {
        const decoded = dataUrlToBuffer(c.invoice_url);
        if (decoded) {
          const att = await qonto.uploadAttachment(req.tenantId, {
            buffer: decoded.buffer,
            contentType: decoded.contentType,
            filename: c.invoice_filename || `invoice-${c.id}.pdf`,
            idempotencyKey: qonto.newIdempotencyKey(),
          });
          attachmentId = att?.id || null;
          if (attachmentId) {
            // Persist only as audit — the next pay attempt re-uploads
            // and re-overwrites; we never read this back into a
            // request body.
            await query('UPDATE commissions SET qonto_attachment_id = $2 WHERE id = $1', [c.id, attachmentId]);
          }
        }
      } catch (e) {
        console.warn('[qonto.pay] attachment upload failed, continuing without:', e.message);
      }
    }

    const beneficiary = await qonto.findBeneficiaryByIban(req.tenantId, c.iban);
    const dealName = c.prospect_company || c.prospect_name || '';
    const beneficiaryName = c.account_holder || c.partner_name;

    // Reuse the previously-stored idempotency key if any (so a retry
    // after a network blip lands on the SAME Qonto transfer instead
    // of double-paying). Otherwise generate one and persist it
    // BEFORE the API call — we want the key on disk even if the
    // process crashes mid-request.
    let idempotencyKey = c.qonto_idempotency_key;
    if (!idempotencyKey) {
      idempotencyKey = qonto.newIdempotencyKey();
      await query(
        'UPDATE commissions SET qonto_idempotency_key = $2 WHERE id = $1',
        [c.id, idempotencyKey]
      );
    }

    const result = await qonto.createSingleTransfer(req.tenantId, {
      commissionId: c.id,
      bankAccountId: integ.bank_account_id,
      amount,
      partnerName: c.partner_name,
      dealName,
      iban: c.iban,
      beneficiaryName,
      beneficiaryId: beneficiary?.id || null,
      attachmentIds: attachmentId ? [attachmentId] : [],
      idempotencyKey,
      // Reuse the saved SCA session token on retries so a previously
      // 428'd transfer can complete without challenging the admin
      // again (assuming they already approved on their phone).
      scaSessionToken: c.qonto_sca_session_token || undefined,
    });

    const transfer = result.transfer || {};
    if (result.requires_sca) {
      console.log(`[pay-qonto] SCA required for commission ${c.id}`, {
        has_sca_token: !!result.sca_session_token,
        has_request_body: !!result.request_body,
        has_idempotency_key: !!result.idempotency_key,
        reference: result.reference,
      });
    } else {
      console.log(`[pay-qonto] Transfer accepted for commission ${c.id}`, {
        transfer_id: transfer.id || null,
        status: transfer.status || null,
        reference: result.reference,
      });
    }
    // SCA-pending → persist the exact body Qonto rejected with 428,
    // alongside the SCA token + idempotency key, so the
    // /confirm-sca endpoint can replay it byte-for-byte once the
    // admin approves on their phone. The transfer is NOT yet
    // created on Qonto's side at this point.
    await query(
      `UPDATE commissions
          SET qonto_transfer_id = $2,
              qonto_sca_session_token = $3,
              qonto_request_body = $4,
              payment_initiated_at = NOW(),
              payment_reference = $5,
              payment_error = NULL
        WHERE id = $1`,
      [
        c.id,
        transfer.id || null,
        result.requires_sca ? (result.sca_session_token || c.qonto_sca_session_token || null) : null,
        result.requires_sca ? JSON.stringify(result.request_body || null) : null,
        result.reference,
      ]
    );

    res.status(202).json({
      ok: true,
      transfer_id: transfer.id || null,
      reference: result.reference,
      status: transfer.status || (result.requires_sca ? 'sca_pending' : 'pending'),
      requires_sca: !!result.requires_sca,
    });
  } catch (err) {
    console.error('[commissions.pay-qonto] error:', err);
    const msg = err.message || 'Erreur serveur';
    if (msg === 'qonto_not_connected' || msg === 'qonto_reconnect_required') {
      return res.status(400).json({ error: msg });
    }
    // Persist a SHORT, parseable code on the commission. Never the
    // raw JSON body — the card renders payment_error verbatim.
    const sanitized = sanitizePaymentError(err);
    try {
      await query(
        'UPDATE commissions SET payment_error = $2 WHERE id = $1 AND tenant_id = $3',
        [req.params.id, sanitized, req.tenantId || null]
      );
    } catch {}
    res.status(500).json({ error: sanitized || msg });
  }
});

// ─── Internal: pay one commission via the single SEPA transfer ─────
// The endpoint POST /v2/sepa/transfers is the only one we trust —
// the bulk endpoint went through 5+ failed shapes and is left in
// the service layer untouched but unused. /pay-qonto and /pay-bulk
// both funnel through this helper so they share the same
// idempotency-key handling, SCA-token reuse, payment_error sanitiser,
// and transfer_id persistence.
async function payOneCommissionViaQonto(c, integ, tenantId) {
  if (c.status !== 'pending_validation') {
    return { ok: false, code: 'commission_not_payable' };
  }
  if (!c.iban) return { ok: false, code: 'partner_iban_missing' };
  const amount = parseFloat(c.amount) || 0;
  if (amount <= 0) return { ok: false, code: 'amount_zero' };

  // Reuse a stored idempotency key on retry; mint + persist if absent.
  let idempotencyKey = c.qonto_idempotency_key;
  if (!idempotencyKey) {
    idempotencyKey = qonto.newIdempotencyKey();
    await query(
      'UPDATE commissions SET qonto_idempotency_key = $2 WHERE id = $1',
      [c.id, idempotencyKey]
    );
  }

  let beneficiary = null;
  try { beneficiary = await qonto.findBeneficiaryByIban(tenantId, c.iban); }
  catch { /* fall through to inline beneficiary */ }

  try {
    const result = await qonto.createSingleTransfer(tenantId, {
      commissionId: c.id,
      bankAccountId: integ.bank_account_id,
      amount,
      partnerName: c.partner_name,
      dealName: c.prospect_company || c.prospect_name || '',
      iban: c.iban,
      beneficiaryName: c.account_holder || c.partner_name,
      beneficiaryId: beneficiary?.id || null,
      attachmentIds: [], // attachments deliberately omitted for now
      idempotencyKey,
      scaSessionToken: c.qonto_sca_session_token || undefined,
    });
    const transfer = result.transfer || {};
    await query(
      `UPDATE commissions
          SET qonto_transfer_id = $2,
              qonto_sca_session_token = $3,
              payment_initiated_at = NOW(),
              payment_reference = $4,
              payment_error = NULL
        WHERE id = $1`,
      [
        c.id,
        transfer.id || null,
        result.requires_sca ? (result.sca_session_token || c.qonto_sca_session_token || null) : null,
        result.reference,
      ]
    );
    return {
      ok: true,
      commission_id: c.id,
      transfer_id: transfer.id || null,
      reference: result.reference,
      requires_sca: !!result.requires_sca,
      status: transfer.status || (result.requires_sca ? 'sca_pending' : 'pending'),
    };
  } catch (err) {
    console.error('[qonto.pay-one] failed for', c.id, ':', err.message);
    const sanitized = sanitizePaymentError(err);
    try {
      await query(
        'UPDATE commissions SET payment_error = $2 WHERE id = $1',
        [c.id, sanitized]
      );
    } catch {}
    return { ok: false, commission_id: c.id, code: sanitized || 'qonto_error', error: err.message };
  }
}

// ─── POST /commissions/pay-bulk ────────────────────────────────────
// Body: { commission_ids: [uuid, ...] }
// Loops sequentially over the selected commissions and pays each via
// the single-transfer endpoint. Qonto's bulk endpoint kept failing
// across multiple shapes; the single endpoint is the confirmed-working
// path (we hit a clean 428 SCA challenge there). Same per-commission
// state writes as /pay-qonto, just batched. Returns the per-commission
// outcomes so the UI can render success / failure / skipped cleanly.
router.post('/pay-bulk', authorize('admin'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.commission_ids) ? req.body.commission_ids : [];
    if (!ids.length) return res.status(400).json({ error: 'commission_ids requis' });
    if (ids.length > 400) return res.status(400).json({ error: 'Maximum 400 commissions par lot' });

    const integ = await loadPaymentIntegration(req.tenantId);
    if (!integ || !integ.is_active) return res.status(400).json({ error: 'qonto_not_connected' });
    if (!integ.bank_account_id) return res.status(400).json({ error: 'qonto_bank_account_missing' });

    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
    const { rows: list } = await query(
      `SELECT c.id, c.amount, c.status, c.invoice_url, c.invoice_filename,
              c.qonto_idempotency_key, c.qonto_sca_session_token,
              p.id AS partner_id, p.name AS partner_name,
              p.iban, p.account_holder,
              r.prospect_name, r.prospect_company
         FROM commissions c
         JOIN partners p ON p.id = c.partner_id
         JOIN referrals r ON r.id = c.referral_id
        WHERE c.tenant_id = $1 AND c.id IN (${placeholders})`,
      [req.tenantId, ...ids]
    );

    const success = [];
    const failed = [];
    const skipped = [];
    let anyRequiresSca = false;
    for (const c of list) {
      if (c.status !== 'pending_validation') { skipped.push({ id: c.id, reason: 'not_payable' }); continue; }
      if (!c.iban) { skipped.push({ id: c.id, reason: 'partner_iban_missing' }); continue; }
      const amt = parseFloat(c.amount) || 0;
      if (amt <= 0) { skipped.push({ id: c.id, reason: 'amount_zero' }); continue; }

      const r = await payOneCommissionViaQonto(c, integ, req.tenantId);
      if (r.ok) {
        if (r.requires_sca) anyRequiresSca = true;
        success.push({
          commission_id: c.id,
          transfer_id: r.transfer_id,
          reference: r.reference,
          status: r.status,
        });
      } else {
        failed.push({ commission_id: c.id, code: r.code, error: r.error });
      }
    }

    res.status(202).json({
      ok: true,
      requires_sca: anyRequiresSca,
      // Mirror the original /pay-bulk shape so the frontend modal
      // doesn't have to branch — `transfers` is the success+failed
      // composite the UI iterates over.
      transfers: [
        ...success,
        ...failed.map(f => ({ commission_id: f.commission_id, transfer_id: null, error: f.code })),
      ],
      success,
      failed,
      skipped,
    });
  } catch (err) {
    console.error('[commissions.pay-bulk] error:', err);
    const msg = err.message || 'Erreur serveur';
    if (msg === 'qonto_not_connected' || msg === 'qonto_reconnect_required') {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: sanitizePaymentError(err) || msg });
  }
});

// ─── Internal: poll Qonto and finalize settled transfers ──────────
// Called from the polling worker AND exposed as POST /poll-qonto for
// manual reconciliation. Iterates every commission with a
// qonto_transfer_id but no payment_completed_at, asks Qonto for the
// current status, flips the commission to 'paid' + emails the partner
// when Qonto reports `settled` (its canonical "money sent" state).
async function reconcileQontoTransfers(tenantId) {
  const { rows } = await query(
    `SELECT c.id, c.qonto_transfer_id, c.amount, c.payment_reference,
            c.tenant_id,
            p.email AS partner_email, p.name AS partner_name, p.iban,
            r.prospect_name, r.prospect_company,
            t.name AS tenant_name
       FROM commissions c
       JOIN partners p ON p.id = c.partner_id
       JOIN referrals r ON r.id = c.referral_id
       JOIN tenants t ON t.id = c.tenant_id
      WHERE c.qonto_transfer_id IS NOT NULL
        AND c.payment_completed_at IS NULL
        AND ($1::uuid IS NULL OR c.tenant_id = $1)
      LIMIT 200`,
    [tenantId || null]
  );

  const updates = [];
  for (const c of rows) {
    try {
      const t = await qonto.getTransfer(c.tenant_id, c.qonto_transfer_id);
      const status = t?.status;
      // Qonto's terminal "money sent" state is `settled` (the API
      // rejects status filters using `completed` outright). Keep
      // `completed` as a forward-compat fallback so a future API
      // rename doesn't silently strand transfers.
      if (status === 'settled' || status === 'completed') {
        await query(
          `UPDATE commissions
              SET status = 'paid',
                  paid_at = COALESCE(paid_at, NOW()),
                  payment_completed_at = NOW(),
                  payment_error = NULL
            WHERE id = $1`,
          [c.id]
        );
        // Send the proof-of-payment email. Best-effort — failures are
        // logged, the commission stays paid.
        try {
          const ibanLast4 = (c.iban || '').replace(/\s+/g, '').slice(-4);
          const dealLabel = c.prospect_company || c.prospect_name || '';
          const tpl = emailTemplates.commissionPaymentSent({
            partnerName: c.partner_name,
            amount: c.amount,
            currency: '€',
            tenantName: c.tenant_name,
            dealName: dealLabel,
            transferReference: c.payment_reference,
            transferDateLabel: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
            ibanLast4,
          });
          if (c.partner_email && tpl) {
            await sendEmail(c.partner_email, tpl.subject, tpl.html);
          }
        } catch (e) {
          console.warn('[qonto.reconcile] email failed for', c.id, ':', e.message);
        }
        updates.push({ commission_id: c.id, transfer_id: c.qonto_transfer_id, status: 'paid' });
      } else if (status === 'declined' || status === 'canceled' || status === 'cancelled' || status === 'failed') {
        // Qonto refused / cancelled / outright failed the transfer.
        // Revert the commission to a re-payable state by clearing the
        // transfer pointer + initiated-at timestamp so the card stops
        // showing "Virement en cours" and the Payer button comes
        // back. Keep payment_reference for audit history. Persist
        // whatever reason Qonto gave us (declined_reason, error
        // message, status code) into payment_error so the admin can
        // see it on the card.
        const reason = t?.declined_reason
          || t?.error_message
          || t?.failure_reason
          || `Qonto status: ${status}`;
        await query(
          `UPDATE commissions
              SET payment_error = $2,
                  qonto_transfer_id = NULL,
                  payment_initiated_at = NULL,
                  status = 'pending_validation'
            WHERE id = $1`,
          [c.id, String(reason).slice(0, 500)]
        );
        updates.push({ commission_id: c.id, transfer_id: c.qonto_transfer_id, status, reason });
      } else {
        // pending / processing — leave as-is.
        updates.push({ commission_id: c.id, transfer_id: c.qonto_transfer_id, status: status || 'unknown' });
      }
    } catch (e) {
      console.warn('[qonto.reconcile] fetch failed for', c.id, ':', e.message);
    }
  }

  // Second pass: orphaned commissions — payment_initiated_at set,
  // qonto_transfer_id NULL — typically from a 428 response that
  // carried no transfer id. Two recovery paths:
  //
  //   a) Search Qonto's recent SEPA transfers for one matching our
  //      reference (preferred) or amount+commission-id-in-note. If
  //      found, adopt the transfer id and let the next reconcile
  //      pass handle status.
  //
  //   b) For SCA-pending rows where (a) didn't find anything, replay
  //      the same POST with the saved idempotency key + SCA session
  //      token. If the admin has approved on their phone, Qonto
  //      returns the created transfer; otherwise it answers 428
  //      again and we leave the row alone.
  const MAX_SCA_RETRIES = 3;
  const { rows: orphanRows } = await query(
    `SELECT c.id, c.tenant_id, c.amount, c.payment_reference,
            c.qonto_idempotency_key, c.qonto_sca_session_token,
            c.qonto_request_body,
            c.qonto_attachment_id,
            COALESCE(c.qonto_retry_count, 0) AS qonto_retry_count,
            p.id AS partner_id, p.name AS partner_name,
            p.iban, p.account_holder,
            r.prospect_name, r.prospect_company,
            pi.bank_account_id
       FROM commissions c
       JOIN partners p ON p.id = c.partner_id
       JOIN referrals r ON r.id = c.referral_id
       JOIN payment_integrations pi ON pi.tenant_id = c.tenant_id AND pi.provider = 'qonto' AND pi.is_active = TRUE
      WHERE c.qonto_transfer_id IS NULL
        AND c.payment_initiated_at IS NOT NULL
        AND c.payment_completed_at IS NULL
        AND ($1::uuid IS NULL OR c.tenant_id = $1)
      LIMIT 50`,
    [tenantId || null]
  );

  // Group by tenant so we only fetch the recent-transfers list once
  // per tenant per reconcile tick.
  const byTenant = new Map();
  for (const c of orphanRows) {
    if (!byTenant.has(c.tenant_id)) byTenant.set(c.tenant_id, []);
    byTenant.get(c.tenant_id).push(c);
  }

  for (const [tid, group] of byTenant) {
    let recent = [];
    try {
      recent = await qonto.listRecentTransfers(tid, { perPage: 100 });
    } catch (e) {
      console.warn('[qonto.reconcile.search] listRecentTransfers failed for tenant', tid, ':', e.message);
    }
    const byReference = new Map();
    for (const t of recent) {
      const ref = (t.reference || '').trim();
      if (ref) byReference.set(ref, t);
    }

    for (const c of group) {
      // (a) Match by reference first.
      const ourRef = c.payment_reference || qonto.buildReference(c.id);
      let match = byReference.get(ourRef);

      // Fallback: scan by amount + commission-id-in-note. Reference
      // is the canonical match path; this is the safety net for the
      // case where Qonto stripped/normalized our reference.
      if (!match) {
        const amount = (parseFloat(c.amount) || 0).toFixed(2);
        const idHint = String(c.id).replace(/-/g, '').slice(0, 12).toUpperCase();
        match = recent.find(t => {
          const tAmount = parseFloat(t.amount).toFixed(2);
          const tNote = (t.note || '').toUpperCase();
          return tAmount === amount && tNote.includes(idHint);
        });
      }

      if (match && match.id) {
        // Adopt the transfer id we found — and if Qonto already
        // reports the transfer as settled, finalize the commission
        // in the same pass (status='paid' + proof-of-payment email).
        // Without this, a 428 SCA flow that's already been approved
        // by the time the next poll runs would otherwise need a
        // SECOND reconcile tick before flipping to Payé.
        await query(
          `UPDATE commissions
              SET qonto_transfer_id = $2,
                  qonto_sca_session_token = NULL,
                  payment_error = NULL
            WHERE id = $1`,
          [c.id, match.id]
        );
        if (match.status === 'settled' || match.status === 'completed') {
          await query(
            `UPDATE commissions
                SET status = 'paid',
                    paid_at = COALESCE(paid_at, NOW()),
                    payment_completed_at = NOW(),
                    payment_error = NULL
              WHERE id = $1`,
            [c.id]
          );
          // Best-effort proof-of-payment email — same template path
          // as the regular settled branch above.
          try {
            const { rows: extra } = await query(
              `SELECT p.email AS partner_email, p.name AS partner_name, p.iban,
                      r.prospect_name, r.prospect_company,
                      t.name AS tenant_name
                 FROM commissions c
                 JOIN partners p ON p.id = c.partner_id
                 JOIN referrals r ON r.id = c.referral_id
                 JOIN tenants t ON t.id = c.tenant_id
                WHERE c.id = $1 LIMIT 1`,
              [c.id]
            );
            const x = extra[0];
            if (x && x.partner_email) {
              const ibanLast4 = (x.iban || '').replace(/\s+/g, '').slice(-4);
              const dealLabel = x.prospect_company || x.prospect_name || '';
              const tpl = emailTemplates.commissionPaymentSent({
                partnerName: x.partner_name,
                amount: c.amount,
                currency: '€',
                tenantName: x.tenant_name,
                dealName: dealLabel,
                transferReference: c.payment_reference,
                transferDateLabel: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
                ibanLast4,
              });
              if (tpl) await sendEmail(x.partner_email, tpl.subject, tpl.html);
            }
          } catch (e) {
            console.warn('[qonto.reconcile.match] email failed for', c.id, ':', e.message);
          }
          updates.push({ commission_id: c.id, transfer_id: match.id, status: 'paid', reference: ourRef });
        } else {
          updates.push({ commission_id: c.id, transfer_id: match.id, status: 'matched_by_reference', reference: ourRef });
        }
        continue;
      }

      // (b) Still no match — try the SCA replay if we have a session
      // token AND we haven't burned through the retry budget yet.
      if (!c.qonto_sca_session_token || !c.qonto_request_body || !c.qonto_idempotency_key) {
        updates.push({ commission_id: c.id, status: 'orphan_no_match' });
        continue;
      }
      if ((c.qonto_retry_count || 0) >= MAX_SCA_RETRIES) {
        // Burned through the retry budget without Qonto ever
        // accepting the replay. Likely the SCA session expired.
        // Reset SCA state so the admin can hit Pay from a clean
        // slate; surface the error on the card with a Réessayer
        // button.
        await query(
          `UPDATE commissions
              SET payment_initiated_at = NULL,
                  qonto_sca_session_token = NULL,
                  qonto_request_body = NULL,
                  qonto_idempotency_key = NULL,
                  qonto_retry_count = 0,
                  payment_error = $2
            WHERE id = $1`,
          [c.id, 'sca_replay_max_retries_exceeded']
        );
        updates.push({ commission_id: c.id, status: 'sca_max_retries_exceeded' });
        continue;
      }
      try {
        // Increment BEFORE the call — if the worker crashes mid-
        // request the next sweep still sees one fewer retry slot.
        await query(
          'UPDATE commissions SET qonto_retry_count = COALESCE(qonto_retry_count, 0) + 1 WHERE id = $1',
          [c.id]
        );
        const result = await qonto.replayTransfer(tid, {
          body: c.qonto_request_body,
          idempotencyKey: c.qonto_idempotency_key,
          scaSessionToken: c.qonto_sca_session_token,
        });
        if (result.ok) {
          const transfer = result.transfer || {};
          // Transfer actually created on Qonto's side — clear SCA
          // scratch fields, drop retry budget back to 0, let the
          // next reconcile tick promote 'settled' → 'paid'.
          await query(
            `UPDATE commissions
                SET qonto_transfer_id = $2,
                    qonto_sca_session_token = NULL,
                    qonto_request_body = NULL,
                    qonto_retry_count = 0,
                    payment_error = NULL
              WHERE id = $1`,
            [c.id, transfer.id || null]
          );
          updates.push({ commission_id: c.id, transfer_id: transfer.id, status: 'initiated_after_sca' });
        } else if (result.expired) {
          // SCA token aged out (15 min). Reset for manual retry.
          await query(
            `UPDATE commissions
                SET qonto_sca_session_token = NULL,
                    qonto_request_body = NULL,
                    qonto_idempotency_key = NULL,
                    payment_initiated_at = NULL,
                    qonto_retry_count = 0,
                    status = 'pending_validation',
                    payment_error = NULL
              WHERE id = $1`,
            [c.id]
          );
          updates.push({ commission_id: c.id, status: 'sca_token_expired' });
        } else {
          // Still 428 — admin hasn't approved on their phone yet.
          // Refresh the SCA token if Qonto rotated it.
          if (result.sca_session_token && result.sca_session_token !== c.qonto_sca_session_token) {
            await query(
              'UPDATE commissions SET qonto_sca_session_token = $2 WHERE id = $1',
              [c.id, result.sca_session_token]
            );
          }
          updates.push({ commission_id: c.id, status: 'sca_pending' });
        }
      } catch (e) {
        console.warn('[qonto.reconcile.sca] replay failed for', c.id, ':', e.message);
      }
    }
  }

  return updates;
}

router.post('/poll-qonto', authorize('admin'), async (req, res) => {
  try {
    const updates = await reconcileQontoTransfers(req.tenantId);
    res.json({ ok: true, updates });
  } catch (err) {
    console.error('[commissions.poll-qonto] error:', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

// ─── POST /commissions/:id/confirm-sca ────────────────────────────
// Replays the SCA-pending transfer with the saved session token.
// Triggered by the "J'ai déjà approuvé" button after the admin
// approves the SCA challenge on their Qonto mobile app.
//
// Per Qonto docs: "Once the user has authorized the action, you
// can use the sca_session_token value from the previous response
// to set the X-Qonto-Sca-Session-Token header and repeat the
// original sensitive action request with no other change than the
// new header." We persist the exact original body in
// qonto_request_body to satisfy that requirement.
router.post('/:id/confirm-sca', authorize('admin'), async (req, res) => {
  console.log(`[confirm-sca] Starting for commission ${req.params.id}`);
  try {
    let where = 'id = $1';
    const params = [req.params.id];
    let i = 2;
    if (req.tenantId && !req.skipTenantFilter) {
      where += ` AND tenant_id = $${i++}`;
      params.push(req.tenantId);
    }
    const { rows } = await query(
      `SELECT id, tenant_id, status, partner_id, amount, payment_reference,
              qonto_request_body, qonto_idempotency_key,
              qonto_sca_session_token, payment_initiated_at
         FROM commissions
        WHERE ${where} LIMIT 1`,
      params
    );
    const c = rows[0];
    if (!c) {
      console.log(`[confirm-sca] Commission ${req.params.id} not found`);
      return res.status(404).json({ error: 'Commission introuvable' });
    }
    console.log(`[confirm-sca] Commission state:`, {
      status: c.status,
      has_sca_token: !!c.qonto_sca_session_token,
      has_request_body: !!c.qonto_request_body,
      has_idempotency_key: !!c.qonto_idempotency_key,
      payment_initiated_at: c.payment_initiated_at,
    });
    if (!c.qonto_sca_session_token || !c.qonto_request_body || !c.qonto_idempotency_key) {
      console.log(`[confirm-sca] Missing SCA data for ${c.id} — cannot replay`);
      return res.status(400).json({ error: 'no_pending_sca', message: 'Aucun virement en attente de validation SCA pour cette commission.' });
    }

    const result = await qonto.replayTransfer(c.tenant_id, {
      body: c.qonto_request_body,
      idempotencyKey: c.qonto_idempotency_key,
      scaSessionToken: c.qonto_sca_session_token,
    });
    console.log(`[confirm-sca] Replay result for ${c.id}:`, {
      ok: !!result.ok,
      expired: !!result.expired,
      sca_still_pending: !!result.sca_still_pending,
      transfer_id: result.transfer?.id || null,
      transfer_status: result.transfer?.status || null,
    });

    if (result.ok) {
      const transfer = result.transfer || {};
      console.log(`[confirm-sca] SUCCESS for ${c.id} — transfer created: ${transfer.id || '(no id returned)'} (status=${transfer.status || 'pending'})`);
      // Transfer actually created on Qonto's side. The polling worker
      // will flip status to 'paid' + email the partner once Qonto
      // moves it from 'pending' / 'processing' to 'settled'.
      await query(
        `UPDATE commissions
            SET qonto_transfer_id = $2,
                qonto_sca_session_token = NULL,
                qonto_request_body = NULL,
                qonto_retry_count = 0,
                payment_error = NULL
          WHERE id = $1`,
        [c.id, transfer.id || null]
      );
      // If Qonto already reports it settled in this very response,
      // finalize inline.
      if (transfer.status === 'settled' || transfer.status === 'completed') {
        await query(
          `UPDATE commissions
              SET status = 'paid',
                  paid_at = COALESCE(paid_at, NOW()),
                  payment_completed_at = NOW()
            WHERE id = $1`,
          [c.id]
        );
      }
      return res.json({
        ok: true,
        transfer_id: transfer.id || null,
        status: transfer.status || 'processing',
      });
    }

    if (result.expired) {
      console.log(`[confirm-sca] SCA token expired (412) for ${c.id} — resetting for fresh retry`);
      // Token aged out (15 min). Reset SCA-side state so the admin
      // can hit Pay again from a clean slate; keep payment_reference
      // for audit but null everything Qonto would refuse to replay.
      await query(
        `UPDATE commissions
            SET qonto_sca_session_token = NULL,
                qonto_request_body = NULL,
                qonto_idempotency_key = NULL,
                payment_initiated_at = NULL,
                qonto_retry_count = 0,
                payment_error = NULL,
                status = 'pending_validation'
          WHERE id = $1`,
        [c.id]
      );
      return res.json({
        ok: false,
        expired: true,
        message: 'Le délai de validation SCA a expiré (15 min). Veuillez relancer le paiement.',
      });
    }

    if (result.sca_still_pending) {
      console.log(`[confirm-sca] SCA still pending for ${c.id} — admin hasn't approved on phone yet`);
      // Admin hasn't approved on their phone yet. Refresh the SCA
      // token in case Qonto rotated it.
      if (result.sca_session_token && result.sca_session_token !== c.qonto_sca_session_token) {
        await query(
          'UPDATE commissions SET qonto_sca_session_token = $2 WHERE id = $1',
          [c.id, result.sca_session_token]
        );
      }
      return res.json({
        ok: false,
        sca_still_pending: true,
        message: 'Le virement attend toujours votre validation dans Qonto.',
      });
    }

    return res.status(500).json({ ok: false, error: 'unknown_replay_error' });
  } catch (err) {
    console.error('[commissions.confirm-sca] error:', err);
    const sanitized = sanitizePaymentError(err);
    try {
      await query(
        'UPDATE commissions SET payment_error = $2 WHERE id = $1 AND tenant_id = $3',
        [req.params.id, sanitized, req.tenantId || null]
      );
    } catch {}
    res.status(500).json({ ok: false, error: sanitized || err.message || 'Erreur serveur' });
  }
});

// ─── POST /commissions/:id/reset-payment ──────────────────────────
// Wipes every Qonto-side scratch field on the commission so the
// admin can hit Pay again from a clean state. Used by the
// "Réessayer le paiement" button on the error banner.
//
// Idempotent and safe to call repeatedly. Refuses to touch a paid
// commission — once money's wired we don't pretend it never
// happened.
router.post('/:id/reset-payment', authorize('admin'), async (req, res) => {
  try {
    let where = 'id = $1 AND status <> \'paid\'';
    const params = [req.params.id];
    let i = 2;
    if (req.tenantId && !req.skipTenantFilter) {
      where += ` AND tenant_id = $${i++}`;
      params.push(req.tenantId);
    }
    const { rowCount } = await query(
      `UPDATE commissions
          SET payment_error = NULL,
              qonto_transfer_id = NULL,
              qonto_attachment_id = NULL,
              payment_initiated_at = NULL,
              payment_completed_at = NULL,
              qonto_sca_session_token = NULL,
              qonto_idempotency_key = NULL,
              qonto_retry_count = 0,
              status = 'pending_validation'
        WHERE ${where}`,
      params
    );
    if (!rowCount) return res.status(404).json({ error: 'Commission introuvable ou déjà payée' });
    res.json({ ok: true, message: 'Payment state reset — ready to retry' });
  } catch (err) {
    console.error('[commissions.reset-payment] error:', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

module.exports = router;
module.exports.reconcileQontoTransfers = reconcileQontoTransfers;

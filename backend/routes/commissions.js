const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, partnerScope, tenantScope } = require('../middleware/auth');
const resend = require('../services/resend');
const templates = require('../services/email-templates');
const { sendEmail } = require('../services/emailService');
const notify = require('../services/notifyService');
const { sendWebhookEvent } = require('../services/webhookService');
const { decomposeAmountWithTax } = require('../utils/commissionFormula');
const PennylaneService = require('../services/pennylaneService');
const { logAudit } = require('../services/auditLog');
const { decrypt } = require('../utils/crypto');

const router = express.Router();

// ─── Pennylane integration helpers ───────────────────────────────────
// Both fire-and-forget. Pennylane is a downstream accounting layer —
// every call here is wrapped so a 401/500/timeout from Pennylane
// never poisons the commission flow. Logs go to Railway with the
// `[pennylane]` prefix so the admin can correlate failures.
//
// Invoice creation runs after a commission is approved; mark-paid
// runs after Qonto confirms the SEPA transfer settled. Both are
// guarded by `tenants.pennylane_enabled` AND `pennylane_api_token`,
// so disabling the integration is a hard kill-switch.

async function createPennylaneInvoice(commissionId, tenantId) {
  try {
    const { rows: [tenant] } = await query(
      'SELECT pennylane_api_token, pennylane_enabled FROM tenants WHERE id = $1',
      [tenantId]
    );
    if (!tenant?.pennylane_enabled || !tenant?.pennylane_api_token) return;

    const { rows: [commission] } = await query(
      'SELECT * FROM commissions WHERE id = $1',
      [commissionId]
    );
    // Idempotent — never re-create an invoice for the same commission.
    if (!commission || commission.pennylane_invoice_id) return;

    const { rows: [partner] } = await query(
      'SELECT * FROM partners WHERE id = $1',
      [commission.partner_id]
    );
    if (!partner) return;

    const pl = new PennylaneService(decrypt(tenant.pennylane_api_token));

    let supplierId = partner.pennylane_supplier_id;
    if (!supplierId) {
      const supplier = await pl.findOrCreateSupplier(partner);
      supplierId = supplier && supplier.id;
      if (supplierId) {
        await query(
          'UPDATE partners SET pennylane_supplier_id = $1 WHERE id = $2',
          [String(supplierId), partner.id]
        );
      }
    }
    if (!supplierId) {
      console.error('[pennylane] no supplier id for commission', commissionId);
      return;
    }

    const invoice = await pl.createSupplierInvoice(commission, partner, { id: supplierId });
    const invoiceId = invoice && (invoice.id || invoice.uuid);
    if (!invoiceId) {
      console.error('[pennylane] no invoice id returned for commission', commissionId);
      return;
    }
    await query(
      `UPDATE commissions
          SET pennylane_invoice_id  = $2,
              pennylane_supplier_id = $3,
              pennylane_status      = $4
        WHERE id = $1`,
      [commissionId, String(invoiceId), String(supplierId), invoice.status || 'imported']
    );
    console.log(`[pennylane] created invoice ${invoiceId} for commission ${commissionId}`);
  } catch (err) {
    console.error(`[pennylane] invoice create failed for ${commissionId}:`, err.message);
  }
}

async function markPennylaneInvoicePaid(commissionId, tenantId) {
  try {
    const { rows: [tenant] } = await query(
      'SELECT pennylane_api_token, pennylane_enabled FROM tenants WHERE id = $1',
      [tenantId]
    );
    if (!tenant?.pennylane_enabled || !tenant?.pennylane_api_token) return;

    const { rows: [commission] } = await query(
      'SELECT pennylane_invoice_id FROM commissions WHERE id = $1',
      [commissionId]
    );
    if (!commission?.pennylane_invoice_id) return;

    const pl = new PennylaneService(decrypt(tenant.pennylane_api_token));
    const today = new Date().toISOString().slice(0, 10);
    const result = await pl.markInvoiceAsPaid(commission.pennylane_invoice_id, today);
    if (result) {
      await query('UPDATE commissions SET pennylane_status = $2 WHERE id = $1', [commissionId, 'paid']);
      console.log(`[pennylane] marked invoice ${commission.pennylane_invoice_id} paid for commission ${commissionId}`);
    }
  } catch (err) {
    console.error(`[pennylane] mark-paid failed for ${commissionId}:`, err.message);
  }
}

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
    // Hide soft-deleted commissions and any commission whose parent
    // deal has been moved to the Corbeille — both live in /trash for
    // 30 days before purge.
    let where = ['c.deleted_at IS NULL', 'r.deleted_at IS NULL'];
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
              c.engagement_type, c.engagement_periods,
              c.amount_ht, c.tax_rate_applied, c.amount_tax, c.amount_ttc,
              c.is_recurring, c.is_perpetual, c.engagement_until, c.current_revision_index, c.tier_at_won,
              c.cancelled_at, c.cancelled_reason, c.cancelled_resolved,
              (c.invoice_url IS NOT NULL) AS has_invoice,
              c.qonto_transfer_id, c.payment_initiated_at, c.payment_completed_at,
              c.payment_reference, c.payment_error,
              (c.qonto_sca_session_token IS NOT NULL) AS sca_pending,
              c.pennylane_invoice_id, c.pennylane_status,
              c.payout_batch_id,
              p.name as partner_name, p.contact_name as partner_contact,
              r.prospect_name, r.prospect_company
       FROM commissions c
       JOIN partners p ON c.partner_id = p.id
       JOIN referrals r ON c.referral_id = r.id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT 2000`,
      params
    );
    // Hard cap at 2000. The FE paginates client-side and the
    // aggregations below operate on `rows`, so a real cap-and-page
    // refactor needs FE coordination. The cap stops a tenant with
    // 50k+ commissions from blowing up the response payload + JSON
    // serialise time on the heavyweight admin list. 2000 is well
    // above any current tenant's commission count and gives us
    // headroom while we plan proper pagination.

    const totalPending = rows.filter(r => r.status === 'pending_approval').reduce((s, r) => s + parseFloat(r.amount), 0);
    const totalApproved = rows.filter(r => r.status === 'awaiting_invoice' || r.status === 'pending_validation').reduce((s, r) => s + parseFloat(r.amount), 0);
    const totalPaid = rows.filter(r => r.status === 'paid').reduce((s, r) => s + parseFloat(r.amount), 0);

    // E2-bis: longevity is read straight from the SNAPSHOT columns
    // written on the commission at the won transition
    // (is_perpetual / engagement_until / tier_at_won). No dynamic
    // resolution against the partner's CURRENT tier — that was the
    // dynamic-resolver pattern from the previous E2 cut and has
    // been intentionally removed. A partner tier change does NOT
    // touch existing commissions.
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

    // total_amount stays for back-compat (HT). Legacy commissions
    // pre-v31 have NULL amount_ht / amount_ttc — COALESCE to amount
    // so a tenant with no VAT-subject partners still gets the same
    // numbers in every column. total_tax > 0 on the FE is the signal
    // to switch the table to the dual HT/TTC layout.
    const { rows } = await query(
      `SELECT p.id, p.name, p.contact_name, p.commission_rate,
              COUNT(c.id)                                                                             AS total_commissions,
              COALESCE(SUM(c.amount), 0)                                                              AS total_amount,
              COALESCE(SUM(CASE WHEN c.status = 'pending_approval' THEN c.amount END), 0)             AS pending_amount,
              COALESCE(SUM(CASE WHEN c.status IN ('awaiting_invoice','pending_validation') THEN c.amount END), 0) AS approved_amount,
              COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.amount END), 0)                         AS paid_amount,
              COALESCE(SUM(c.deal_value), 0)                                                          AS total_deal_value,
              COALESCE(SUM(COALESCE(c.amount_ht,  c.amount)), 0)                                      AS total_ht,
              COALESCE(SUM(COALESCE(c.amount_tax, 0)),         0)                                     AS total_tax,
              COALESCE(SUM(COALESCE(c.amount_ttc, c.amount)), 0)                                      AS total_ttc,
              COALESCE(SUM(CASE WHEN c.status = 'pending_approval' THEN COALESCE(c.amount_ttc, c.amount) END), 0)             AS pending_ttc,
              COALESCE(SUM(CASE WHEN c.status IN ('awaiting_invoice','pending_validation') THEN COALESCE(c.amount_ttc, c.amount) END), 0) AS approved_ttc,
              COALESCE(SUM(CASE WHEN c.status = 'paid' THEN COALESCE(c.amount_ttc, c.amount) END), 0) AS paid_ttc
       FROM partners p
       LEFT JOIN commissions c ON p.id = c.partner_id AND c.deleted_at IS NULL
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
       WHERE id = $1 AND deleted_at IS NULL${whereExtra}
       RETURNING *`,
      params
    );

    if (!commission) return res.status(404).json({ error: 'Commission introuvable' });

    if (status === 'paid') {
      logAudit(req, 'commission.paid', 'commission', commission.id, { amount: commission.amount });
    } else if (status === 'awaiting_invoice') {
      logAudit(req, 'commission.approved', 'commission', commission.id, { amount: commission.amount });
    }

    commission.payment_due_date = commission.approved_at ? nextQuarterEnd(commission.approved_at) : null;
    commission.is_late = commission.approved_at && commission.status !== 'paid' && new Date(nextQuarterEnd(commission.approved_at)) < new Date();

    if (status === 'awaiting_invoice' || status === 'paid') {
      const emailKey = status === 'paid' ? 'commission_paid' : 'commission_validated';
      (async () => {
        try {
          const { rows: [enriched] } = await query(
            `SELECT c.id, c.amount, c.status, c.referral_id, c.partner_id,
                    c.amount_ht, c.amount_tax, c.amount_ttc, c.tax_rate_applied,
                    r.prospect_name, r.prospect_company,
                    t.name as tenant_name
             FROM commissions c
             JOIN referrals r ON c.referral_id = r.id
             JOIN partners p ON c.partner_id = p.id
             JOIN tenants t ON p.tenant_id = t.id
             WHERE c.id = $1 AND c.deleted_at IS NULL AND r.deleted_at IS NULL`,
            [req.params.id]
          );
          if (!enriched) return;
          const { rows: partnerUsers } = await query(
            `SELECT email, full_name FROM users WHERE partner_id = $1 AND is_active = true`,
            [enriched.partner_id]
          );
          const dashboardUrl = (process.env.FRONTEND_URL || 'https://refboost.io') + '/commissions';
          const prospectName = enriched.prospect_name || enriched.prospect_company || 'votre prospect';
          // Headline = TTC (what gets / got wired). Fallback to legacy
          // `amount` for pre-v31 rows where no VAT snapshot exists.
          const amount = parseFloat(enriched.amount_ttc != null ? enriched.amount_ttc : enriched.amount) || 0;
          // Parallel fan-out. The previous serial `for (… await …)`
          // pattern blocked this IIFE for ~N×Resend-latency (≈300 ms
          // each), so a partner with 5 users on the account left a
          // long-running open task hanging well after the response
          // shipped. Promise.all + per-send catch lets all emails
          // race; one failure no longer cancels the rest.
          await Promise.all(partnerUsers.map(u => {
            const tmpl = status === 'paid'
              ? templates.commissionPaid({
                  partnerName: u.full_name, prospectName,
                  commissionAmount: amount,
                  amountHt:  enriched.amount_ht,
                  amountTax: enriched.amount_tax,
                  amountTtc: enriched.amount_ttc,
                  taxRate:   enriched.tax_rate_applied,
                  currency: '€', dashboardUrl, tenantName: enriched.tenant_name,
                })
              : templates.commissionValidated({ partnerName: u.full_name, prospectName, commissionAmount: amount, currency: '€', dashboardUrl, tenantName: enriched.tenant_name });
            return resend.sendAndLog({
              to: u.email,
              subject: tmpl.subject,
              html: tmpl.html,
              text: tmpl.text,
              template: emailKey,
              payload: { recipient_name: u.full_name, commission_id: enriched.id, amount },
              query,
            }).catch(err => {
              console.error('[commissions.statusChange] send failed for', u.email, ':', err.message);
            });
          }));
        } catch (e) { console.error('[commissions.statusChange] email error:', e.message); }
      })();
    }

    res.json({ commission });

    // Outgoing webhooks
    if (status === 'awaiting_invoice' || status === 'paid') {
      (async () => {
        const { rows: [enriched] } = await query(
          `SELECT c.id, c.amount, c.status, c.referral_id, c.partner_id,
                  c.amount_ht, c.amount_tax, c.amount_ttc, c.tax_rate_applied,
                  c.approved_at, c.paid_at,
                  r.prospect_name, r.prospect_company,
                  p.name AS partner_name, p.email AS partner_email
             FROM commissions c
             JOIN referrals r ON c.referral_id = r.id
             JOIN partners p ON c.partner_id = p.id
            WHERE c.id = $1 AND c.deleted_at IS NULL AND r.deleted_at IS NULL`,
          [req.params.id]
        );
        if (!enriched) return;
        // Webhook `amount` keeps its legacy semantics (= what consumers
        // already integrated against). The HT/VAT/TTC fields are
        // additive — non-VAT-subject rows carry null/0 there, so
        // downstream code can branch on amount_ttc != null to detect
        // the new VAT-aware payouts.
        const basePayload = {
          commission_id: enriched.id,
          referral_id: enriched.referral_id,
          partner_id: enriched.partner_id,
          partner_name: enriched.partner_name,
          partner_email: enriched.partner_email,
          prospect_name: enriched.prospect_name,
          prospect_company: enriched.prospect_company,
          amount: parseFloat(enriched.amount) || 0,
          amount_ht:  enriched.amount_ht  != null ? parseFloat(enriched.amount_ht)  : null,
          amount_tax: enriched.amount_tax != null ? parseFloat(enriched.amount_tax) : null,
          amount_ttc: enriched.amount_ttc != null ? parseFloat(enriched.amount_ttc) : null,
          tax_rate:   enriched.tax_rate_applied != null ? parseFloat(enriched.tax_rate_applied) : null,
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
  // Approve / reject / delete flows always operate on live (non-trashed)
  // rows. Soft-deleted commissions and commissions whose parent deal
  // is in the Corbeille are filtered out so 404 is returned instead of
  // letting the admin act on a row the UI doesn't show.
  const { rows } = await query(
    `SELECT c.*, p.name AS partner_name, r.prospect_name
       FROM commissions c
       JOIN partners p ON p.id = c.partner_id
       JOIN referrals r ON r.id = c.referral_id
      WHERE c.id = $1
        AND c.deleted_at IS NULL AND r.deleted_at IS NULL
        AND ($2::uuid IS NULL OR c.tenant_id = $2)
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

    logAudit(req, 'commission.approved', 'commission', req.params.id, { amount: existing.amount, partner_id: existing.partner_id });

    // Fire-and-forget: create the Pennylane supplier invoice if the
    // tenant has the integration on. Detached from the response so a
    // slow Pennylane API never makes the admin's "Approuver" click
    // feel laggy.
    createPennylaneInvoice(req.params.id, existing.tenant_id).catch(() => {});

    (async () => {
      try {
        // F2a: pour les tenants en cadence monthly/quarterly, on ne
        // veut PAS spammer le partenaire d'un email par commission
        // approuvée — il recevra un seul email payoutBatchInvoiceRequest
        // à la création du batch (cf. routes/payouts.js create-batches).
        // L'in-app reste envoyée dans tous les cas : le partenaire
        // voit l'approval immédiatement dans le bell, l'email batch
        // arrive plus tard à la clôture de la période.
        const { rows: [tenantRow] } = await query(
          `SELECT COALESCE(payout_cadence, 'unitary') AS payout_cadence FROM tenants WHERE id = $1`,
          [existing.tenant_id]
        );
        const cadence = tenantRow?.payout_cadence || 'unitary';
        const skipEmail = cadence !== 'unitary';
        const users = await partnerUsers(existing.partner_id);
        const amountLabel = fmtMoney(existing.amount);
        for (const u of users) {
          notify.createNotification(u.id, 'commission_approved', {
            title: `Commission approuvée — ${amountLabel}`,
            message: `Pour ${existing.prospect_name || 'votre lead'} — merci de déposer votre facture.`,
            link: '/partner/payments',
            tenantId: existing.tenant_id,
          }).catch(() => {});
          if (skipEmail) {
            console.log(`[commission.approve] skipped commissionApproved email — tenant cadence=${cadence}`);
            continue;
          }
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

// ─── E4: post-lost arbitrage actions ───────────────────────────────
// When a deal is closed lost and its recurring commission has been
// flipped to status='cancelled' (referrals.js leftWon branch), the
// admin must explicitly arbitrate: pay the last engagement cycle,
// or confirm the cessation. Both routes operate exclusively on
// status='cancelled' rows; non-cancelled commissions return 409.
//
// resume-last-cycle: commission → 'awaiting_invoice' (re-enters the
// existing pay-qonto flow without any new payment plumbing).
// cancelled_resolved=TRUE so the row leaves the "to-arbitrate"
// queue. cancelled_at + cancelled_reason are kept as historical
// markers so we don't lose the audit trail.
//
// confirm-cancellation: status stays 'cancelled', cancelled_resolved
// flips to TRUE — the commission is sealed, no further versement
// will ever be wired against it. Idempotent.

router.post('/:id/resume-last-cycle', authorize('admin'), async (req, res) => {
  try {
    const existing = await loadCommissionWithContext(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ error: 'Commission introuvable' });
    if (existing.status !== 'cancelled') {
      return res.status(409).json({ error: 'not_cancelled', message: 'Cette action ne s\'applique qu\'à une commission annulée.' });
    }
    // Defensive: never re-open an in-flight transfer that somehow
    // co-existed with cancelled state (shouldn't happen — the
    // referrals.js guard rejects lost mid-flight — but cheap to
    // re-check).
    if (existing.qonto_transfer_id && !existing.payment_completed_at) {
      return res.status(409).json({
        error: 'transfer_in_flight',
        message: 'Un virement est en cours pour cette commission. Attendez sa finalisation.',
      });
    }
    const { rows: [updated] } = await query(
      `UPDATE commissions
          SET status = 'awaiting_invoice',
              cancelled_resolved = TRUE
        WHERE id = $1 AND status = 'cancelled'
        RETURNING *`,
      [req.params.id]
    );
    if (!updated) return res.status(409).json({ error: 'state_changed', message: 'La commission a changé d\'état.' });

    // Activity on the parent referral so the timeline records the
    // admin decision in plain language.
    try {
      await query(
        `INSERT INTO referral_activities (referral_id, user_id, action, old_value, new_value, comment)
         VALUES ($1, $2, 'commission_last_cycle_authorized', 'cancelled', 'awaiting_invoice', 'Dernier cycle autorisé au paiement avant arrêt définitif.')`,
        [existing.referral_id, req.user.id]
      );
    } catch (e) { console.warn('[resume-last-cycle] activity log failed:', e.message); }

    res.json({ commission: updated });
  } catch (err) {
    console.error('Resume last cycle error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/confirm-cancellation', authorize('admin'), async (req, res) => {
  try {
    const existing = await loadCommissionWithContext(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ error: 'Commission introuvable' });
    if (existing.status !== 'cancelled') {
      return res.status(409).json({ error: 'not_cancelled', message: 'Cette action ne s\'applique qu\'à une commission annulée.' });
    }
    // Idempotent: re-confirming an already-resolved cancellation
    // is a noop, not an error — the FE may double-click the button.
    const { rows: [updated] } = await query(
      `UPDATE commissions
          SET cancelled_resolved = TRUE
        WHERE id = $1 AND status = 'cancelled'
        RETURNING *`,
      [req.params.id]
    );
    if (!updated) return res.status(409).json({ error: 'state_changed', message: 'La commission a changé d\'état.' });

    try {
      await query(
        `INSERT INTO referral_activities (referral_id, user_id, action, old_value, new_value, comment)
         VALUES ($1, $2, 'commission_cancellation_confirmed', 'cancelled', 'cancelled', 'Arrêt confirmé — aucun versement supplémentaire.')`,
        [existing.referral_id, req.user.id]
      );
    } catch (e) { console.warn('[confirm-cancellation] activity log failed:', e.message); }

    res.json({ commission: updated });
  } catch (err) {
    console.error('Confirm cancellation error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Delete commission ─────────────────────────────────────────────
// Hard-delete a commission row + email the partner. Refuses if the
// commission is already paid, or if a Qonto transfer is mid-flight
// (qonto_transfer_id set + payment_completed_at NULL) — once money's
// in motion we don't pretend the commission never existed.
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const { reason } = req.body || {};
    const existing = await loadCommissionWithContext(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ error: 'Commission introuvable' });
    if (existing.status === 'paid') {
      return res.status(409).json({ error: 'commission_paid', message: 'Une commission payée ne peut pas être supprimée.' });
    }
    if (existing.qonto_transfer_id && !existing.payment_completed_at) {
      return res.status(409).json({ error: 'transfer_in_flight', message: 'Un virement est en cours pour cette commission. Annulez-le côté Qonto avant de la supprimer.' });
    }

    // Pull tenant + deal context for the email before we drop the row.
    const { rows: [ctx] } = await query(
      `SELECT t.name AS tenant_name,
              r.prospect_name, r.prospect_company,
              p.name AS partner_label
         FROM commissions c
         JOIN tenants t ON t.id = c.tenant_id
         JOIN partners p ON p.id = c.partner_id
         JOIN referrals r ON r.id = c.referral_id
        WHERE c.id = $1
        LIMIT 1`,
      [req.params.id]
    );

    // Soft delete — moves the row to the Corbeille for 30 days.
    // Tenant filter is defense-in-depth: loadCommissionWithContext()
    // already verified ownership at line 510, but if a future
    // refactor changes that helper, the missing filter here would
    // re-open the cross-tenant delete window.
    await query(
      'UPDATE commissions SET deleted_at = NOW(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL AND tenant_id = $3',
      [req.user?.id || null, req.params.id, existing.tenant_id]
    );

    logAudit(req, 'commission.deleted', 'commission', req.params.id, {
      amount: existing.amount,
      partner_id: existing.partner_id,
      reason: reason || null,
    });

    (async () => {
      try {
        const users = await partnerUsers(existing.partner_id);
        const dealLabel = ctx?.prospect_company || ctx?.prospect_name || existing.prospect_name || '';
        const amount = parseFloat(existing.amount) || 0;
        for (const u of users) {
          notify.createNotification(u.id, 'commission_deleted', {
            title: `Commission annulée — ${fmtMoney(amount)}`,
            message: reason || `La commission pour ${dealLabel || 'votre deal'} a été annulée.`,
            link: '/partner/payments',
            tenantId: existing.tenant_id,
          }).catch(() => {});
          const p = await notify.shouldNotifyPartner(existing.partner_id, 'email_commission_update');
          if (p.email) {
            const tpl = require('../utils/emailTemplates').commissionCancelled({
              partnerName: u.full_name,
              prospectName: ctx?.prospect_name || existing.prospect_name,
              dealName: dealLabel,
              amount,
              currency: '€',
              tenantName: ctx?.tenant_name,
              reason,
            });
            sendEmail(u.email, tpl.subject, tpl.html).catch(() => {});
          }
        }
      } catch (e) {
        console.error('[commissions.delete] notify error:', e.message);
      }
    })();

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete commission error:', err);
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
    // Per-file cap: 5 MB raw → ~6.7 MB base64. The global JSON limit
    // is 15 MB (server.js) so without this check a partner could
    // file ~10 MB invoices into the DB on every approval. 5 MB is
    // generous for a PDF invoice and keeps `commissions.invoice_url`
    // (TEXT) from bloating the row.
    if (data_url.length > 7_000_000) {
      return res.status(413).json({ error: 'Fichier trop volumineux (5 MB max)' });
    }

    let where = 'id = $1 AND deleted_at IS NULL';
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

    // Tell the admin a partner just submitted an invoice — both
    // in-app and via email. Fire-and-forget so the invoice upload
    // response isn't blocked on Resend.
    (async () => {
      try {
        const { rows: [ctx] } = await query(
          `SELECT c.tenant_id, c.amount, p.name AS partner_name,
                  r.prospect_name, r.prospect_company
             FROM commissions c
             JOIN partners p ON p.id = c.partner_id
             JOIN referrals r ON r.id = c.referral_id
            WHERE c.id = $1 LIMIT 1`,
          [req.params.id]
        );
        if (!ctx) return;
        const dealLabel = ctx.prospect_company || ctx.prospect_name || '';
        notify.fanoutAdminNotification(ctx.tenant_id, 'invoice_submitted', {
          title: `Facture reçue — ${ctx.partner_name}`,
          message: `Commission ${fmtMoney(ctx.amount)}${dealLabel ? ' — ' + dealLabel : ''} : facture à valider.`,
          link: '/commissions',
        }).catch(() => {});
        const recipients = await notify.adminEmails(ctx.tenant_id);
        const tpl = require('../utils/emailTemplates').invoiceSubmitted({
          partnerName: ctx.partner_name,
          prospectName: ctx.prospect_name,
          dealName: dealLabel,
          amount: ctx.amount,
        });
        for (const r of recipients) sendEmail(r.email, tpl.subject, tpl.html).catch(() => {});
      } catch (e) {
        console.error('[upload-invoice] notify error:', e.message);
      }
    })();

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
    let where = 'id = $1 AND deleted_at IS NULL';
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
      // Tenant filter is the same one the primary path uses; the
      // previous fallback skipped it, which let any authenticated
      // user fetch any tenant's invoice base64 by guessing the
      // commission UUID (CRITICAL pre-fix).
      try {
        const fallbackParams = [req.params.id];
        let fallbackSql = 'SELECT invoice_url FROM commissions WHERE id = $1';
        if (req.tenantId && !req.skipTenantFilter) {
          fallbackParams.push(req.tenantId);
          fallbackSql += ` AND tenant_id = $${fallbackParams.length}`;
        }
        const { rows: [c] } = await query(fallbackSql, fallbackParams);
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

// ─── Plan gate (Qonto pay routes) ──────────────────────────────────
// Qonto banking is a Business-plan feature — mirrors crm.js +
// routes/qonto.js. /pay-qonto + /pay-bulk reject anyone below
// Business with 403 plan_upgrade_required. The other Qonto-flavoured
// commission routes (/poll-qonto, /:id/confirm-sca, /:id/reset-payment)
// are intentionally NOT gated: they're recovery actions on rows that
// were already initiated under the right plan, and we don't want a
// downgraded tenant to be unable to clean up an in-flight transfer.
async function requireBusinessPlan(req, res, next) {
  if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
  try {
    const { rows } = await query('SELECT plan FROM tenants WHERE id = $1', [req.tenantId]);
    const plan = rows[0]?.plan || 'starter';
    if (plan !== 'business') {
      return res.status(403).json({ error: 'plan_upgrade_required', currentPlan: plan, requiredPlan: 'business' });
    }
    next();
  } catch (err) {
    console.error('[commissions.requireBusinessPlan] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}
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
  // Fall back to the raw JS error message so non-Qonto crashes
  // (ReferenceError, TypeError, SQL errors, …) are persisted in
  // commissions.payment_error verbatim instead of being flattened to
  // the generic "qonto_error" — which is what hid the L.974
  // `tenantId is not defined` regression for a full day.
  return (message || err?.message || 'qonto_error').slice(0, 200);
}

async function loadCommissionForPayment(commissionId, tenantId) {
  // Pay flow operates on live rows only — once a commission is in the
  // Corbeille, the bulk-pay UI shouldn't be able to push it to Qonto.
  const { rows } = await query(
    `SELECT c.id, c.tenant_id, c.amount, c.status, c.qonto_transfer_id,
            c.invoice_url, c.invoice_filename, c.qonto_attachment_id,
            c.qonto_idempotency_key, c.qonto_sca_session_token,
            p.id AS partner_id, p.name AS partner_name,
            p.iban, p.bic, p.account_holder, p.bank_name,
            p.tax_subject, p.tax_country, p.tax_rate, p.tax_id,
            r.prospect_name, r.prospect_company
       FROM commissions c
       JOIN partners p ON p.id = c.partner_id
       JOIN referrals r ON r.id = c.referral_id
      WHERE c.id = $1
        AND c.deleted_at IS NULL AND r.deleted_at IS NULL
        AND ($2::uuid IS NULL OR c.tenant_id = $2)
      LIMIT 1`,
    [commissionId, tenantId || null]
  );
  return rows[0] || null;
}

// ─── POST /commissions/:id/pay-qonto ───────────────────────────────
router.post('/:id/pay-qonto', authorize('admin'), requireBusinessPlan, async (req, res) => {
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
    // SCA-pending: redirect to /confirm-sca ("J'ai déjà approuvé")
    // instead of starting a parallel attempt.
    if (c.qonto_sca_session_token) {
      return res.status(409).json({
        error: 'sca_pending',
        message: 'Validez la SCA dans Qonto puis cliquez sur "J\'ai déjà approuvé".',
      });
    }
    // Transfer already in flight on Qonto's side. The status check
    // above excludes 'paid', so this only fires while we wait on
    // pending/processing → settled. /reset-payment is the escape
    // hatch for genuinely stuck rows.
    if (c.qonto_transfer_id && c.status !== 'paid') {
      return res.status(409).json({
        error: 'transfer_already_initiated',
        transfer_id: c.qonto_transfer_id,
        message: 'Un virement est déjà en cours pour cette commission.',
      });
    }
    if (!c.iban) return res.status(400).json({ error: 'partner_iban_missing' });
    const amount = parseFloat(c.amount) || 0;
    if (amount <= 0) return res.status(400).json({ error: 'amount_zero' });

    // ─── VAT decomposition ──────────────────────────────────────────
    // TODO: handle intracommunity reverse charge — when the payer's
    // country differs from the partner's country and both are VAT-
    // subject inside the EU, the partner should invoice without VAT
    // and the payer self-assesses (reverse charge B2B). The current
    // model is "RefBoost wires the partner's local VAT" which is
    // correct for FR→FR but not for FR→DE intra-EU. Out of scope for
    // this ticket per spec section 10.
    if (c.tax_subject && (!c.tax_rate || parseFloat(c.tax_rate) <= 0)) {
      return res.status(400).json({
        error: 'partner_tax_rate_missing',
        message: 'Le partenaire est déclaré assujetti TVA mais sans taux configuré.',
      });
    }
    const taxRate = c.tax_subject ? Number(c.tax_rate) : 0;
    const breakdown = decomposeAmountWithTax(amount, taxRate);

    console.log(`[pay-qonto] Starting payment for commission ${c.id} (HT: ${breakdown.amount_ht}€, TVA ${breakdown.tax_rate}%: ${breakdown.amount_tax}€, TTC: ${breakdown.amount_ttc}€)`);

    // Upload attachment (best-effort)
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
            await query('UPDATE commissions SET qonto_attachment_id = $2 WHERE id = $1 AND tenant_id = $3', [c.id, attachmentId, req.tenantId]);
          }
        }
      } catch (e) {
        console.warn('[qonto.pay] attachment upload failed, continuing without:', e.message);
      }
    }

    const beneficiary = await qonto.findBeneficiaryByIban(req.tenantId, c.iban);
    const dealName = c.prospect_company || c.prospect_name || '';
    const beneficiaryName = c.account_holder || c.partner_name;

    // === CORRIGÉ : Idempotency Key Strategy ===
    // Reuse if exists (for network retries), mint fresh only on first attempt
    let idempotencyKey = c.qonto_idempotency_key;
    if (!idempotencyKey) {
      idempotencyKey = qonto.newIdempotencyKey();
      await query(
        'UPDATE commissions SET qonto_idempotency_key = $2 WHERE id = $1 AND tenant_id = $3',
        [c.id, idempotencyKey, req.tenantId]
      );
    }

    // Snapshot the breakdown on the row BEFORE wiring — if the
    // transfer fails partway, we still know what numbers were attempted.
    await query(
      `UPDATE commissions
          SET amount_ht = $2, tax_rate_applied = $3, amount_tax = $4, amount_ttc = $5
        WHERE id = $1`,
      [c.id, breakdown.amount_ht, breakdown.tax_rate, breakdown.amount_tax, breakdown.amount_ttc]
    );

    const result = await qonto.createSingleTransfer(req.tenantId, {
      commissionId: c.id,
      bankAccountId: integ.bank_account_id,
      // Legacy `amount` kept for back-compat; qontoService prefers
      // amountTtc when present.
      amount,
      amountHt:  breakdown.amount_ht,
      amountTax: breakdown.amount_tax,
      amountTtc: breakdown.amount_ttc,
      taxRate:   breakdown.tax_rate,
      partnerName: c.partner_name,
      dealName,
      iban: c.iban,
      beneficiaryName,
      beneficiaryId: beneficiary?.id || null,
      attachmentIds: attachmentId ? [attachmentId] : [],
      idempotencyKey,
      scaSessionToken: c.qonto_sca_session_token || undefined,
    });

    const transfer = result.transfer || {};

    // Sauvegarde du résultat
    await query(
      `UPDATE commissions
          SET qonto_transfer_id = $2,
              qonto_sca_session_token = $3,
              qonto_vop_proof_token = $4,
              qonto_request_body = $5,
              payment_initiated_at = NOW(),
              payment_reference = $6,
              payment_error = NULL
        WHERE id = $1`,
      [
        c.id,
        transfer.id || null,
        result.requires_sca ? (result.sca_session_token || null) : null,
        result.requires_sca ? (result.vop_proof_token || null) : null,
        result.requires_sca ? JSON.stringify(result.request_body) : null,
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

// ─── Internal: pay one commission via single SEPA transfer ─────
async function payOneCommissionViaQonto(c, integ, tenantId) {
  if (c.status !== 'pending_validation') {
    return { ok: false, code: 'commission_not_payable' };
  }
  // Same guards as /pay-qonto: SCA-pending rows route through
  // /confirm-sca; in-flight transfers are skipped so bulk doesn't
  // double-pay them.
  if (c.qonto_sca_session_token) return { ok: false, code: 'sca_pending' };
  if (c.qonto_transfer_id && c.status !== 'paid') return { ok: false, code: 'transfer_already_initiated' };
  if (!c.iban) return { ok: false, code: 'partner_iban_missing' };
  const amount = parseFloat(c.amount) || 0;
  if (amount <= 0) return { ok: false, code: 'amount_zero' };

  // VAT decomposition — same gate as /pay-qonto. Bulk surfaces the
  // missing-rate error per-commission so a mis-configured partner
  // doesn't block the whole batch.
  if (c.tax_subject && (!c.tax_rate || parseFloat(c.tax_rate) <= 0)) {
    return { ok: false, code: 'partner_tax_rate_missing' };
  }
  const taxRate = c.tax_subject ? Number(c.tax_rate) : 0;
  const breakdown = decomposeAmountWithTax(amount, taxRate);

  // === CORRIGÉ : Idempotency Key Strategy ===
  let idempotencyKey = c.qonto_idempotency_key;
  if (!idempotencyKey) {
    idempotencyKey = qonto.newIdempotencyKey();
    await query(
      'UPDATE commissions SET qonto_idempotency_key = $2 WHERE id = $1 AND tenant_id = $3',
      [c.id, idempotencyKey, tenantId]
    );
  }

  let beneficiary = null;
  try {
    beneficiary = await qonto.findBeneficiaryByIban(tenantId, c.iban);
  } catch {}

  try {
    // Snapshot the breakdown before wiring (same rationale as the
    // single endpoint: persist what we attempted).
    await query(
      `UPDATE commissions
          SET amount_ht = $2, tax_rate_applied = $3, amount_tax = $4, amount_ttc = $5
        WHERE id = $1`,
      [c.id, breakdown.amount_ht, breakdown.tax_rate, breakdown.amount_tax, breakdown.amount_ttc]
    );

    const result = await qonto.createSingleTransfer(tenantId, {
      commissionId: c.id,
      bankAccountId: integ.bank_account_id,
      amount,
      amountHt:  breakdown.amount_ht,
      amountTax: breakdown.amount_tax,
      amountTtc: breakdown.amount_ttc,
      taxRate:   breakdown.tax_rate,
      partnerName: c.partner_name,
      dealName: c.prospect_company || c.prospect_name || '',
      iban: c.iban,
      beneficiaryName: c.account_holder || c.partner_name,
      beneficiaryId: beneficiary?.id || null,
      attachmentIds: [], // attachments omitted for stability
      idempotencyKey,
      scaSessionToken: c.qonto_sca_session_token || undefined,
    });

    const transfer = result.transfer || {};

    await query(
      `UPDATE commissions
          SET qonto_transfer_id = $2,
              qonto_sca_session_token = $3,
              qonto_vop_proof_token = $4,
              qonto_request_body = $5,
              payment_initiated_at = NOW(),
              payment_reference = $6,
              payment_error = NULL
        WHERE id = $1`,
      [
        c.id,
        transfer.id || null,
        result.requires_sca ? (result.sca_session_token || null) : null,
        result.requires_sca ? (result.vop_proof_token || null) : null,
        result.requires_sca ? JSON.stringify(result.request_body) : null,
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
      await query('UPDATE commissions SET payment_error = $2 WHERE id = $1 AND tenant_id = $3', [c.id, sanitized, tenantId]);
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
router.post('/pay-bulk', authorize('admin'), requireBusinessPlan, async (req, res) => {
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
              p.tax_subject, p.tax_country, p.tax_rate, p.tax_id,
              r.prospect_name, r.prospect_company
         FROM commissions c
         JOIN partners p ON p.id = c.partner_id
         JOIN referrals r ON r.id = c.referral_id
        WHERE c.tenant_id = $1
          AND c.deleted_at IS NULL AND r.deleted_at IS NULL
          AND c.id IN (${placeholders})`,
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
            c.amount_ht, c.amount_tax, c.amount_ttc, c.tax_rate_applied,
            c.tenant_id, c.partner_id,
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
        // Mark the Pennylane invoice as paid in lockstep with the
        // RefBoost status flip. Fire-and-forget; logged on failure.
        markPennylaneInvoicePaid(c.id, c.tenant_id).catch(() => {});
        // Send the proof-of-payment email. Best-effort — failures are
        // logged, the commission stays paid.
        try {
          const ibanLast4 = (c.iban || '').replace(/\s+/g, '').slice(-4);
          const dealLabel = c.prospect_company || c.prospect_name || '';
          const dateLabel = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
          // Both partner + admin emails now carry the VAT breakdown
          // (HT / VAT / TTC) snapshotted on the commission row at
          // payout time. Headline amount = TTC (what actually got
          // wired). Pre-v31 rows fall back to `amount` and the
          // template hides the VAT breakdown when amount_ttc is null.
          const payoutAmount = c.amount_ttc != null ? c.amount_ttc : c.amount;
          // Partner-facing email (existing template).
          const tpl = emailTemplates.commissionPaymentSent({
            partnerName: c.partner_name,
            amount: payoutAmount,
            amountHt:  c.amount_ht,
            amountTax: c.amount_tax,
            amountTtc: c.amount_ttc,
            taxRate:   c.tax_rate_applied,
            currency: '€',
            tenantName: c.tenant_name,
            dealName: dealLabel,
            transferReference: c.payment_reference,
            transferDateLabel: dateLabel,
            ibanLast4,
          });
          if (c.partner_email && tpl) {
            await sendEmail(c.partner_email, tpl.subject, tpl.html);
          }
          // In-app + email fan-out for the new payment_completed event.
          // Partners see "your payment was sent"; admins see the
          // confirmation receipt.
          const partners = await partnerUsers(c.partner_id);
          for (const u of partners) {
            notify.createNotification(u.id, 'payment_completed', {
              title: `Paiement effectué — ${fmtMoney(payoutAmount)}`,
              message: `Référence ${c.payment_reference || '—'}. Vous le recevrez sous 1-2 jours ouvrés.`,
              link: '/partner/payments',
              tenantId: c.tenant_id,
            }).catch(() => {});
          }
          notify.fanoutAdminNotification(c.tenant_id, 'payment_completed', {
            title: `Virement confirmé — ${c.partner_name}`,
            message: `${fmtMoney(payoutAmount)} · réf. ${c.payment_reference || '—'}`,
            link: '/commissions',
          }).catch(() => {});
          const adminEmailTpl = emailTemplates.paymentSentAdmin({
            partnerName: c.partner_name,
            amount: payoutAmount,
            amountHt:  c.amount_ht,
            amountTax: c.amount_tax,
            amountTtc: c.amount_ttc,
            taxRate:   c.tax_rate_applied,
            currency: '€',
            dealName: dealLabel,
            transferReference: c.payment_reference,
            transferDateLabel: dateLabel,
          });
          const admins = await notify.adminEmails(c.tenant_id);
          for (const a of admins) sendEmail(a.email, adminEmailTpl.subject, adminEmailTpl.html).catch(() => {});
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
        // Page the admin: a transfer they initiated didn't go
        // through. In-app + email so they retry promptly. Best-effort.
        try {
          const dealLabel = c.prospect_company || c.prospect_name || '';
          notify.fanoutAdminNotification(c.tenant_id, 'payment_failed', {
            title: `⚠️ Virement échoué — ${c.partner_name}`,
            message: `${fmtMoney(c.amount)} : ${String(reason).slice(0, 120)}`,
            link: '/commissions',
          }).catch(() => {});
          const failTpl = emailTemplates.qontoTransferFailed({
            partnerName: c.partner_name,
            amount: c.amount,
            currency: '€',
            dealName: dealLabel,
            errorMessage: String(reason),
          });
          const admins = await notify.adminEmails(c.tenant_id);
          for (const a of admins) sendEmail(a.email, failTpl.subject, failTpl.html).catch(() => {});
        } catch (e) {
          console.warn('[qonto.reconcile] failure-notify failed for', c.id, ':', e.message);
        }
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
            c.qonto_vop_proof_token,
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
                  qonto_vop_proof_token = NULL,
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
          markPennylaneInvoicePaid(c.id, c.tenant_id).catch(() => {});
          // Best-effort proof-of-payment email — same template path
          // as the regular settled branch above.
          try {
            const { rows: extra } = await query(
              `SELECT c.amount, c.amount_ht, c.amount_tax, c.amount_ttc, c.tax_rate_applied,
                      p.email AS partner_email, p.name AS partner_name, p.iban,
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
                amount: x.amount_ttc != null ? x.amount_ttc : x.amount,
                amountHt:  x.amount_ht,
                amountTax: x.amount_tax,
                amountTtc: x.amount_ttc,
                taxRate:   x.tax_rate_applied,
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
                  qonto_vop_proof_token = NULL,
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
          'UPDATE commissions SET qonto_retry_count = COALESCE(qonto_retry_count, 0) + 1 WHERE id = $1 AND tenant_id = $2',
          [c.id, tenantId]
        );
        const result = await qonto.replayTransfer(tid, {
          body: c.qonto_request_body,
          idempotencyKey: c.qonto_idempotency_key,
          scaSessionToken: c.qonto_sca_session_token,
          vopToken: c.qonto_vop_proof_token || undefined,
        });
        if (result.ok) {
          const transfer = result.transfer || {};
          // Transfer actually created on Qonto's side — clear SCA +
          // VOP scratch fields, drop retry budget back to 0, let the
          // next reconcile tick promote 'settled' → 'paid'.
          await query(
            `UPDATE commissions
                SET qonto_transfer_id = $2,
                    qonto_sca_session_token = NULL,
                    qonto_vop_proof_token = NULL,
                    qonto_request_body = NULL,
                    qonto_retry_count = 0,
                    payment_error = NULL
              WHERE id = $1`,
            [c.id, transfer.id || null]
          );
          updates.push({ commission_id: c.id, transfer_id: transfer.id, status: 'initiated_after_sca' });
        } else if (result.expired || result.not_found) {
          // Partial reset: clear only the expired SCA + VOP tokens.
          // We KEEP qonto_request_body + qonto_idempotency_key + the
          // pending_validation status + payment_initiated_at so that
          // /confirm-sca ("J'ai déjà approuvé") can still attempt a
          // header-less replay with the saved body — Qonto either
          // honours an already-approved challenge or answers with a
          // fresh 428 we re-save.
          console.log(`[qonto.reconcile] SCA session ${result.expired ? 'expired (412)' : 'invalid (422/401)'} for commission ${c.id}, partial reset`);
          await query(
            `UPDATE commissions
                SET qonto_sca_session_token = NULL,
                    qonto_vop_proof_token = NULL,
                    payment_error = NULL
              WHERE id = $1`,
            [c.id]
          );
          updates.push({
            commission_id: c.id,
            status: result.expired ? 'sca_token_expired' : 'sca_session_not_found',
          });
        } else {
          // Still 428 — admin hasn't approved on their phone yet.
          // Refresh SCA + VOP tokens if Qonto rotated either.
          const newSca = result.sca_session_token && result.sca_session_token !== c.qonto_sca_session_token
            ? result.sca_session_token : null;
          const newVop = result.vop_proof_token && result.vop_proof_token !== c.qonto_vop_proof_token
            ? result.vop_proof_token : null;
          if (newSca || newVop) {
            await query(
              `UPDATE commissions
                  SET qonto_sca_session_token = COALESCE($2, qonto_sca_session_token),
                      qonto_vop_proof_token = COALESCE($3, qonto_vop_proof_token)
                WHERE id = $1`,
              [c.id, newSca, newVop]
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
  console.log(`[confirm-sca] User clicked "J'ai déjà approuvé" for commission ${req.params.id}`);
  try {
    let where = 'id = $1 AND deleted_at IS NULL';
    const params = [req.params.id];
    let i = 2;
    if (req.tenantId && !req.skipTenantFilter) {
      where += ` AND tenant_id = $${i++}`;
      params.push(req.tenantId);
    }
    const { rows } = await query(
      `SELECT id, tenant_id, status, partner_id, amount, payment_reference,
              qonto_request_body, qonto_idempotency_key,
              qonto_sca_session_token, qonto_vop_proof_token,
              payment_initiated_at
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
    if (!c.qonto_request_body || !c.qonto_idempotency_key) {
      console.log(`[confirm-sca] Missing SCA data for ${c.id} — cannot replay`);
      return res.status(400).json({ error: 'no_pending_sca', message: 'Aucun virement en attente de validation SCA pour cette commission.' });
    }
    // No sca_session_token typically means the reconcile worker did
    // a partial reset after a 412 (token aged out). Replaying without
    // an SCA header risks creating an inconsistent state on Qonto's
    // side — safer to ask the admin to click Payer again, which will
    // mint a fresh challenge.
    if (!c.qonto_sca_session_token) {
      console.log(`[confirm-sca] No sca_session_token available for ${c.id} — asking user to restart payment`);
      return res.json({
        ok: false,
        needs_restart: true,
        message: 'La validation SCA a expiré. Veuillez cliquer sur "Payer" pour relancer le virement.',
      });
    }

    console.log(`[confirm-sca] Replaying with sca_token ${String(c.qonto_sca_session_token).slice(0, 8)}…`);

    const result = await qonto.replayTransfer(c.tenant_id, {
      body: c.qonto_request_body,           // replayTransfer gère string ou objet
      idempotencyKey: c.qonto_idempotency_key,
      scaSessionToken: c.qonto_sca_session_token,
      vopToken: c.qonto_vop_proof_token || undefined,
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
                qonto_vop_proof_token = NULL,
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
        markPennylaneInvoicePaid(c.id, c.tenant_id).catch(() => {});
      }
      return res.json({
        ok: true,
        transfer_id: transfer.id || null,
        status: transfer.status || 'processing',
      });
    }

    // 428 sca_required from the replay. We split this into two paths:
    //   * with vop_proof_token → legit "admin hasn't approved on
    //     phone yet" — preserve the still-pending UX so the user
    //     keeps waiting instead of being told to restart.
    //   * without vop_proof_token → Qonto's response can't be
    //     replayed (subsequent attempts would 401), so we fall
    //     through to the catch-all and ask the user to restart.
    if (result.sca_still_pending) {
      if (result.vop_proof_token) {
        console.log(`[confirm-sca] SCA still pending for ${c.id} — admin hasn't approved on phone yet`);
        const newSca = result.sca_session_token && result.sca_session_token !== c.qonto_sca_session_token
          ? result.sca_session_token : null;
        const newVop = result.vop_proof_token !== c.qonto_vop_proof_token
          ? result.vop_proof_token : null;
        if (newSca || newVop) {
          await query(
            `UPDATE commissions
                SET qonto_sca_session_token = COALESCE($2, qonto_sca_session_token),
                    qonto_vop_proof_token = COALESCE($3, qonto_vop_proof_token)
              WHERE id = $1`,
            [c.id, newSca, newVop]
          );
        }
        return res.json({
          ok: false,
          sca_still_pending: true,
          message: 'Le virement attend toujours votre validation dans Qonto.',
        });
      }
      console.log(`[confirm-sca] 428 sca_required without vop_proof_token for ${c.id} — treating as needs_restart`);
      // Falls through to the catch-all below.
    }

    // Catch-all for any other failure: 412 (token aged out, 15 min) /
    // 422 (Qonto lost the session or admin tapped "un problème est
    // survenu") / 401 vop_proof_token_missing / 428 without
    // vop_proof_token / any unknown shape. All require the admin to
    // start over from a clean slate.
    console.log(`[confirm-sca] Replay failed for ${c.id} (${result.expired ? '412' : result.not_found ? '422/401' : result.sca_still_pending ? '428-no-vop' : 'unknown'}) — full reset, asking user to restart`);
    await query(
      `UPDATE commissions
          SET qonto_sca_session_token = NULL,
              qonto_vop_proof_token = NULL,
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
      needs_restart: true,
      message: 'La validation SCA a expiré ou n\'a pas abouti. Veuillez cliquer sur "Payer" pour relancer le virement avec un nouveau challenge.',
    });
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
              qonto_vop_proof_token = NULL,
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

// ─── E5: event-driven renewal worker ──────────────────────────────
//
// Prepares cycle N+1 for recurring commissions whose conditions are
// met. Calqué sur reconcileQontoTransfers (same shape, same isolation
// guarantees). The worker NEVER pays and NEVER auto-approves —
// renewals land in status='pending_validation' WITH
// approval_status='pending_approval' so the admin can review them
// through the normal approval flow before they become payable.
//
// Series semantics (E5 spec — A4):
//   - "cycle 1" of a referral  = the commission with the smallest
//     cycle_index AMONG status != 'cancelled' AND deleted_at IS NULL.
//   - "latest cycle"           = the commission with the largest
//     cycle_index AMONG the same set.
//   - cancelled commissions are EXCLUDED from min/max and from
//     longevity inheritance — a lost→won reopen starts a fresh
//     series; the prior cancelled chain never anchors anything.
//
// Temporal anchor (E5 spec — A2):
//   - anchor = created_at of CYCLE 1 of the series. ONE rule, no
//     fallback, no paid_at conditional.
//   - cycle N is due when anchor + N × cycle_duration_months <= today.
//   - cycle_duration_months = engagement_periods × monthsPerPeriod
//     (forfait:1 / mensuel:1 / trimestriel:3 / annuel:12). Engagement
//     metadata is read off the latest cycle of the series — it stays
//     in sync with whatever the deal currently advertises.
//
// Idempotence (E5 spec):
//   - commissions_referral_cycle_uidx (partial unique on
//     (referral_id, cycle_index) WHERE deleted_at IS NULL) makes a
//     double-insert physically impossible. A concurrent poll on the
//     same series throws 23505 on the second attempt; we swallow it
//     with a debug log and move on.
//
// Anti-pileup (E5 spec — A3, mode 'temporal' only):
//   - if >=2 unsettled cycles already exist for the series
//     (status NOT IN cancelled,paid), refuse to prepare a new one
//     and emit a warning. The 'on_paid' mode is naturally immune
//     (it needs cycle N paid before preparing N+1).

const PERIOD_MONTHS_E5 = { forfait: 1, mensuel: 1, trimestriel: 3, annuel: 12 };
function cycleDurationMonths(engagementType, engagementPeriods) {
  const mult = PERIOD_MONTHS_E5[engagementType] || 1;
  const periods = Math.max(1, parseInt(engagementPeriods, 10) || 1);
  return mult * periods;
}

async function prepareRecurringRenewals(tenantId) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const result = { prepared: 0, skipped: 0, errors: [] };

  // ─── Candidate selection ─────────────────────────────────────
  // We pick the LATEST non-cancelled commission of each recurring
  // series in a won deal on an opted-in tenant. The trigger filter
  // (on_paid vs temporal) and the due-date filter run in JS so the
  // SQL stays straightforward and the logic stays auditable.
  //
  // For each candidate row we also need cycle 1's created_at (the
  // anchor) and cycle 1's is_perpetual / engagement_until /
  // tier_at_won (inherited verbatim). Those are read via a
  // correlated subquery to keep the worker single-round-trip per
  // tenant.
  const { rows: candidates } = await query(
    `WITH series_latest AS (
       SELECT c.referral_id,
              MAX(c.cycle_index) AS max_idx
         FROM commissions c
        WHERE c.is_recurring = TRUE
          AND c.deleted_at IS NULL
          AND c.status <> 'cancelled'
        GROUP BY c.referral_id
     ), series_anchor AS (
       SELECT c1.referral_id,
              c1.id            AS cycle1_id,
              c1.created_at    AS cycle1_created_at,
              c1.is_perpetual  AS cycle1_is_perpetual,
              c1.engagement_until AS cycle1_engagement_until,
              c1.tier_at_won   AS cycle1_tier_at_won
         FROM commissions c1
         JOIN (
           SELECT referral_id, MIN(cycle_index) AS min_idx
             FROM commissions
            WHERE is_recurring = TRUE
              AND deleted_at IS NULL
              AND status <> 'cancelled'
            GROUP BY referral_id
         ) m ON m.referral_id = c1.referral_id AND m.min_idx = c1.cycle_index
        WHERE c1.is_recurring = TRUE
          AND c1.deleted_at IS NULL
          AND c1.status <> 'cancelled'
     )
     SELECT c.id, c.referral_id, c.partner_id, c.tenant_id, c.status,
            c.cycle_index, c.engagement_type, c.engagement_periods,
            c.amount, c.amount_ht, c.amount_tax, c.amount_ttc, c.tax_rate_applied, c.rate, c.deal_value,
            sa.cycle1_id, sa.cycle1_created_at, sa.cycle1_is_perpetual,
            sa.cycle1_engagement_until, sa.cycle1_tier_at_won,
            r.status AS referral_status,
            t.recurring_renewal_trigger AS trigger_mode
       FROM commissions c
       JOIN series_latest sl ON sl.referral_id = c.referral_id AND sl.max_idx = c.cycle_index
       JOIN series_anchor sa ON sa.referral_id = c.referral_id
       JOIN referrals r ON r.id = c.referral_id
       JOIN tenants t   ON t.id = c.tenant_id
      WHERE c.is_recurring = TRUE
        AND c.deleted_at IS NULL
        AND c.status <> 'cancelled'
        AND r.status = 'won'
        AND r.deleted_at IS NULL
        AND COALESCE(t.recurring_billing_enabled, FALSE) = TRUE
        AND (c.is_perpetual = TRUE OR (c.engagement_until IS NOT NULL AND c.engagement_until >= $1::date))
        AND ($2::uuid IS NULL OR c.tenant_id = $2)`,
    [todayIso, tenantId || null]
  );

  for (const cand of candidates) {
    try {
      // Due-date check — common to both trigger modes.
      const durationMonths = cycleDurationMonths(cand.engagement_type, cand.engagement_periods);
      const due = new Date(cand.cycle1_created_at);
      due.setMonth(due.getMonth() + cand.cycle_index * durationMonths);
      if (due.getTime() > new Date(todayIso).getTime()) {
        result.skipped++;
        continue;
      }
      // Trigger-mode-specific gate.
      if (cand.trigger_mode === 'temporal') {
        // A3 — anti-pileup. Refuse if 2+ unsettled cycles already
        // exist for this referral (cancelled and paid don't count).
        const { rows: [pileup] } = await query(
          `SELECT COUNT(*)::int AS open_cycles
             FROM commissions
            WHERE referral_id = $1
              AND is_recurring = TRUE
              AND deleted_at IS NULL
              AND status NOT IN ('cancelled', 'paid')`,
          [cand.referral_id]
        );
        if (pileup && pileup.open_cycles >= 2) {
          console.warn(`[recurring-renewal] renouvellements en pause — ${pileup.open_cycles} cycles non réglés pour referral ${cand.referral_id}`);
          result.skipped++;
          continue;
        }
      } else {
        // 'on_paid' (default): cycle N must be paid for N+1 to be prepared.
        if (cand.status !== 'paid') {
          result.skipped++;
          continue;
        }
      }

      // Pull the latest revision of the source cycle. Its monetary
      // columns are what the renewal copies verbatim. The
      // commission headline columns above already reflect this
      // revision (E3 syncs them at insert time) so either source
      // works; we read from commission_revisions for explicitness.
      const { rows: [srcRev] } = await query(
        `SELECT * FROM commission_revisions
          WHERE commission_id = $1
          ORDER BY revision_index DESC
          LIMIT 1`,
        [cand.id]
      );
      const dealValueRenewal = srcRev ? srcRev.deal_value : cand.deal_value;
      const rateRenewal      = srcRev ? srcRev.rate       : cand.rate;
      const htRenewal        = srcRev ? srcRev.amount_ht  : cand.amount_ht;
      const taxRateRenewal   = srcRev ? srcRev.tax_rate_applied : cand.tax_rate_applied;
      const taxRenewal       = srcRev ? srcRev.amount_tax : cand.amount_tax;
      const ttcRenewal       = srcRev ? srcRev.amount_ttc : cand.amount_ttc;
      const amountRenewal    = srcRev ? srcRev.amount_ttc : (cand.amount_ttc || cand.amount);

      const newCycleIndex = cand.cycle_index + 1;

      // INSERT new commission for cycle N+1. The partial UNIQUE
      // index on (referral_id, cycle_index) WHERE deleted_at IS
      // NULL is what makes this idempotent: a concurrent poll
      // racing on the same series gets a 23505 unique violation
      // on the second attempt and we swallow it below.
      //
      // approval_status='pending_approval' — A1: renewals go
      // through the normal admin approval, NEVER auto-approved.
      // This is the explicit human-checkpoint the spec calls for.
      let newCommissionId = null;
      try {
        const { rows: [created] } = await query(
          `INSERT INTO commissions
             (referral_id, partner_id, tenant_id, cycle_index,
              status, approval_status, is_recurring,
              is_perpetual, engagement_until, tier_at_won,
              engagement_type, engagement_periods,
              rate, deal_value,
              amount, amount_ht, tax_rate_applied, amount_tax, amount_ttc,
              current_revision_index, approved_at)
           VALUES
             ($1, $2, $3, $4,
              'pending_validation', 'pending_approval', TRUE,
              $5, $6, $7,
              $8, $9,
              $10, $11,
              $12, $13, $14, $15, $16,
              1, NULL)
           RETURNING id`,
          [
            cand.referral_id, cand.partner_id, cand.tenant_id, newCycleIndex,
            cand.cycle1_is_perpetual, cand.cycle1_engagement_until, cand.cycle1_tier_at_won,
            cand.engagement_type, cand.engagement_periods,
            rateRenewal, dealValueRenewal,
            amountRenewal, htRenewal, taxRateRenewal, taxRenewal, ttcRenewal,
          ]
        );
        newCommissionId = created.id;
      } catch (err) {
        if (err && err.code === '23505') {
          // Idempotence in action: another worker tick already
          // inserted this cycle. Silent debug log, not an error.
          console.log(`[recurring-renewal] cycle ${newCycleIndex} déjà préparé pour referral ${cand.referral_id} (race idempotent)`);
          result.skipped++;
          continue;
        }
        throw err;
      }

      // INSERT initial revision row for the new cycle — same
      // contract as E1 (revision_index=1, reason hints origin).
      await query(
        `INSERT INTO commission_revisions
           (commission_id, revision_index, deal_value, rate,
            amount_ht, tax_rate_applied, amount_tax, amount_ttc,
            effective_date, reason, created_by, created_at)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, 'renewal', NULL, NOW())`,
        [newCommissionId, dealValueRenewal, rateRenewal,
         htRenewal, taxRateRenewal, taxRenewal, ttcRenewal,
         todayIso]
      );

      // Activity on the parent referral so the timeline records
      // the renewal preparation in plain language.
      try {
        await query(
          `INSERT INTO referral_activities (referral_id, user_id, action, old_value, new_value, comment)
           VALUES ($1, NULL, 'commission_renewed', $2, $3, $4)`,
          [
            cand.referral_id,
            String(cand.cycle_index),
            String(newCycleIndex),
            `Renouvellement cycle ${newCycleIndex} préparé (en attente d'approbation puis de validation).`,
          ]
        );
      } catch (e) {
        console.warn('[recurring-renewal] activity log failed:', e.message);
      }

      // In-app notifications. Best-effort — never blocks the loop.
      try {
        const ttcLabel = (parseFloat(ttcRenewal) || 0).toFixed(2) + ' €';
        const { rows: [ctx] } = await query(
          `SELECT p.name AS partner_name, r.prospect_name, r.prospect_company
             FROM commissions c
             JOIN partners p ON p.id = c.partner_id
             JOIN referrals r ON r.id = c.referral_id
            WHERE c.id = $1`,
          [newCommissionId]
        );
        notify.fanoutAdminNotification(cand.tenant_id, 'commission_renewed', {
          title: `Renouvellement à valider — ${ctx?.partner_name || ''}`,
          message: `Cycle ${newCycleIndex} · ${ttcLabel}`,
          link: '/commissions',
        }).catch(() => {});
        const partners = await partnerUsers(cand.partner_id);
        for (const u of partners) {
          notify.createNotification(u.id, 'commission_renewed', {
            title: 'Commission de renouvellement générée',
            message: `Pour ${ctx?.prospect_company || ctx?.prospect_name || '—'} · ${ttcLabel}`,
            link: '/partner/payments',
            tenantId: cand.tenant_id,
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('[recurring-renewal] notify failed:', e.message);
      }

      result.prepared++;
    } catch (err) {
      console.error(`[recurring-renewal] failed for commission ${cand.id}:`, err.message);
      result.errors.push({ commission_id: cand.id, error: err.message });
    }
  }

  return result;
}

// Admin endpoint: trigger the worker manually. Same auth contract as
// /poll-qonto. Returns the same { prepared, skipped, errors } shape
// the internal loop assembles.
router.post('/poll-renewals', authorize('admin'), async (req, res) => {
  try {
    const out = await prepareRecurringRenewals(req.tenantId || null);
    res.json(out);
  } catch (err) {
    console.error('[commissions.poll-renewals] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
module.exports.reconcileQontoTransfers = reconcileQontoTransfers;
module.exports.prepareRecurringRenewals = prepareRecurringRenewals;

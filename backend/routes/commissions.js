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

module.exports = router;

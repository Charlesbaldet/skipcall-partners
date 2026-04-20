const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, partnerScope, tenantScope } = require('../middleware/auth');
const resend = require('../services/resend');
const templates = require('../services/email-templates');
const { sendEmail } = require('../services/emailService');
const notify = require('../services/notifyService');

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

// âââ List commissions âââ
router.get('/', async (req, res) => {
  try {
    const { status, partner_id, approval_status } = req.query;
    let where = [];
    let params = [];
    let i = 1;

    // Tenant isolation
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
      where.push(`c.status = $${i++}`);
      params.push(status);
    }
    if (approval_status && approval_status !== 'all') {
      where.push(`c.approval_status = $${i++}`);
      params.push(approval_status);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT c.*, p.name as partner_name, p.contact_name as partner_contact,
              r.prospect_name, r.prospect_company
       FROM commissions c
       JOIN partners p ON c.partner_id = p.id
       JOIN referrals r ON c.referral_id = r.id
       ${whereClause}
       ORDER BY c.created_at DESC`,
      params
    );

    const totalPending = rows.filter(r => r.status === 'pending').reduce((s, r) => s + parseFloat(r.amount), 0);
    const totalApproved = rows.filter(r => r.status === 'approved').reduce((s, r) => s + parseFloat(r.amount), 0);
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

// âââ Summary by partner âââ
router.get('/summary', authorize('admin', 'commercial'), async (req, res) => {
  try {
    let where = ['p.is_active = true'];
    let params = [];
    let i = 1;

    // Tenant isolation
    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`p.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    const { rows } = await query(
      `SELECT p.id, p.name, p.contact_name, p.commission_rate,
              COUNT(c.id) as total_commissions,
              COALESCE(SUM(c.amount), 0) as total_amount,
              COALESCE(SUM(CASE WHEN c.status = 'pending' THEN c.amount END), 0) as pending_amount,
              COALESCE(SUM(CASE WHEN c.status = 'approved' THEN c.amount END), 0) as approved_amount,
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

// âââ Update commission status (admin only) âââ
router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'paid'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    const approvedAt = status === 'approved' ? new Date().toISOString() : null;
    const paidAt = status === 'paid' ? new Date().toISOString() : null;

    // Tenant check
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
    commission.is_late = commission.approved_at && commission.status !== 'paid' && new Date(nextQuarterEnd(commission.aproved_at)) < new Date();

    // Fire-and-forget email when commission is approved or paid
        if (status === 'approved' || status === 'paid') {
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
                const tmpl = status === 'approved'
                  ? templates.commissionValidated({
                      partnerName: u.full_name,
                      prospectName,
                      commissionAmount: amount,
                      currency: '€',
                      dashboardUrl,
                      tenantName: enriched.tenant_name,
                    })
                  : templates.commissionPaid({
                      partnerName: u.full_name,
                      prospectName,
                      commissionAmount: amount,
                      currency: '€',
                      dashboardUrl,
                      tenantName: enriched.tenant_name,
                    });
                await resend.sendAndLog({
                  to: u.email,
                  subject: tmpl.subject,
                  html: tmpl.html,
                  text: tmpl.text,
                  template: status === 'approved' ? 'commission_validated' : 'commission_paid',
                  payload: { recipient_name: u.full_name, commission_id: enriched.id, amount },
                  query,
                });
              }
            } catch (e) { console.error('[commissions.statusChange] email error:', e.message); }
          })();
        }
    
    res.json({ commission });
  } catch (err) {
    console.error('Update commission error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Approve / Reject commission (admin approval flow) ─────────────
// A commission is created with approval_status='pending_approval'
// whenever a referral transitions to a won stage. An admin must
// then explicitly approve (→ 'approved', payment eligible) or reject
// (→ 'rejected', with an optional reason). Both paths notify the
// partner; approve is email-framed as good news, reject as
// "requires review".
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

router.post('/:id/approve', authorize('admin'), async (req, res) => {
  try {
    const existing = await loadCommissionWithContext(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ error: 'Commission introuvable' });
    if (existing.approval_status === 'approved') return res.json({ commission: existing, noop: true });

    const { rows: [updated] } = await query(
      `UPDATE commissions
          SET approval_status = 'approved',
              rejection_reason = NULL,
              approved_at = COALESCE(approved_at, NOW())
        WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    // In-app + email notify the partner
    (async () => {
      try {
        const users = await partnerUsers(existing.partner_id);
        const amountLabel = fmtMoney(existing.amount);
        for (const u of users) {
          notify.createNotification(u.id, 'commission', {
            title: `Commission approuvée — ${amountLabel}`,
            message: `Pour ${existing.prospect_name || 'votre lead'}`,
            link: '/partner/payments',
            tenantId: existing.tenant_id,
          }).catch(() => {});
          const tpl = require('../utils/emailTemplates').commissionApproved({
            partnerName: u.full_name,
            prospectName: existing.prospect_name,
            amount: existing.amount,
          });
          sendEmail(u.email, tpl.subject, tpl.html).catch(() => {});
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
          const tpl = require('../utils/emailTemplates').commissionRejected({
            partnerName: u.full_name,
            prospectName: existing.prospect_name,
            reason,
          });
          sendEmail(u.email, tpl.subject, tpl.html).catch(() => {});
        }
      } catch {}
    })();

    res.json({ commission: updated });
  } catch (err) {
    console.error('Reject commission error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

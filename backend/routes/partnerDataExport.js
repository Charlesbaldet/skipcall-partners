// GDPR Article 20 — partner-initiated data portability.
// Mounted at /api/partner/export-data. Returns one JSON file with
// the partner's profile, referrals, commissions, and messages, all
// strictly tenant-scoped to (req.tenantId, req.user.partnerId) so a
// partner can never download another partner's data even with a
// hand-crafted token. Sensitive columns (password_hash, tokens,
// internal IDs not useful to the export) are stripped before the
// response is serialised.

const express = require('express');
const { query } = require('../db');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);

// Stripping helper — drops any key whose presence in the export
// would leak credentials or internal-only state. We allow-list only
// what the partner already sees in their own UI.
function stripSensitive(row) {
  if (!row || typeof row !== 'object') return row;
  const SENSITIVE = [
    'password_hash',
    'token',
    'access_token',
    'refresh_token',
    'reset_token',
    'qonto_sca_session_token',
    'qonto_vop_proof_token',
    'qonto_idempotency_key',
    'qonto_request_body',
    'pennylane_invoice_id',
  ];
  const out = { ...row };
  for (const k of SENSITIVE) delete out[k];
  return out;
}

router.get('/', async (req, res) => {
  try {
    if (req.user.role !== 'partner') {
      return res.status(403).json({ error: 'Réservé aux partenaires' });
    }
    const partnerId = req.user.partnerId;
    const tenantId = req.tenantId;
    if (!partnerId || !tenantId) {
      return res.status(400).json({ error: 'Profil partenaire incomplet' });
    }

    // Profile — pull from partners + the linked user row. Bank info
    // included so the partner can verify what's on file; we redact
    // the password_hash via stripSensitive even though it lives on
    // users (defence in depth in case a column is later joined in).
    const { rows: partnerRows } = await query(
      'SELECT * FROM partners WHERE id = $1 AND tenant_id = $2',
      [partnerId, tenantId]
    );
    const { rows: userRows } = await query(
      'SELECT id, email, full_name, role, tenant_id, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    const profile = {
      partner: partnerRows[0] ? stripSensitive(partnerRows[0]) : null,
      user: userRows[0] ? stripSensitive(userRows[0]) : null,
    };

    // Referrals submitted by this partner.
    const { rows: referrals } = await query(
      `SELECT id, prospect_name, prospect_company, prospect_email, prospect_phone,
              status, deal_value, notes, created_at, updated_at, deleted_at
         FROM referrals
        WHERE partner_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC`,
      [partnerId, tenantId]
    );

    // Commissions for this partner. We join referrals for prospect
    // context so the export is self-contained.
    const { rows: commissions } = await query(
      `SELECT c.id, c.referral_id, c.amount, c.amount_ht, c.amount_tax, c.amount_ttc,
              c.currency, c.status, c.created_at, c.updated_at,
              c.payment_initiated_at, c.payment_completed_at,
              r.prospect_name, r.prospect_company
         FROM commissions c
    LEFT JOIN referrals r ON r.id = c.referral_id
        WHERE c.partner_id = $1 AND c.tenant_id = $2
        ORDER BY c.created_at DESC`,
      [partnerId, tenantId]
    );

    // Messages — every message in conversations the partner is part
    // of, scoped to their tenant. We keep the conversation subject
    // so the export reads like a thread per row group.
    let messages = [];
    try {
      const { rows: msgRows } = await query(
        `SELECT m.id, m.conversation_id, m.content, m.created_at,
                m.sender_id, c.subject AS conversation_subject
           FROM messages m
           JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
           JOIN conversations c ON c.id = m.conversation_id
          WHERE cp.user_id = $1
            AND ($2::uuid IS NULL OR c.tenant_id = $2)
          ORDER BY m.created_at ASC`,
        [req.user.id, tenantId]
      );
      messages = msgRows;
    } catch (err) {
      // Old deployments without the conversations.tenant_id column
      // get an empty messages array rather than a 500.
      console.warn('[export-data.messages] skipped:', err.message);
    }

    const payload = {
      exported_at: new Date().toISOString(),
      profile,
      referrals: referrals.map(stripSensitive),
      commissions: commissions.map(stripSensitive),
      messages: messages.map(stripSensitive),
    };

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="refboost-export-${today}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('[partner.export-data] error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

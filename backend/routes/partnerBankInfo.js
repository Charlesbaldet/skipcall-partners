// Partner self-service bank info — mounted at /api/partner/bank-info.
// Reads/writes the same iban/bic/account_holder columns the admin pay
// modal already uses on the partners table, plus a new bank_name string.
// Scoped strictly to the partner attached to the JWT, so the route
// doesn't take a partner ID in the URL — there's nothing for a partner
// to mistakenly poke at across tenants.

const express = require('express');
const { query } = require('../db');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);

router.get('/', async (req, res) => {
  if (!req.user.partnerId) return res.status(403).json({ error: 'Accès interdit' });
  try {
    const { rows } = await query(
      `SELECT account_holder, iban, bic, bank_name
         FROM partners WHERE id = $1`,
      [req.user.partnerId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ bank_info: rows[0] });
  } catch (err) {
    console.error('Get bank-info error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/', async (req, res) => {
  if (!req.user.partnerId) return res.status(403).json({ error: 'Accès interdit' });
  try {
    const { account_holder, iban, bic, bank_name } = req.body || {};
    if (iban) {
      const cleanIban = String(iban).replace(/\s/g, '').toUpperCase();
      if (cleanIban.length < 15 || cleanIban.length > 34) {
        return res.status(400).json({ error: 'Format IBAN invalide' });
      }
    }
    const { rows: [partner] } = await query(
      `UPDATE partners
          SET account_holder = $2, iban = $3, bic = $4, bank_name = $5
        WHERE id = $1
        RETURNING account_holder, iban, bic, bank_name`,
      [
        req.user.partnerId,
        account_holder || null,
        iban ? String(iban).replace(/\s/g, '').toUpperCase() : null,
        bic ? String(bic).toUpperCase() : null,
        bank_name || null,
      ]
    );
    if (!partner) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ bank_info: partner });
  } catch (err) {
    console.error('Update bank-info error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

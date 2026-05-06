// Partner self-service bank info — mounted at /api/partner/bank-info.
// Reads/writes the same iban/bic/account_holder columns the admin pay
// modal already uses on the partners table, plus a new bank_name string.
// Scoped strictly to the partner attached to the JWT, so the route
// doesn't take a partner ID in the URL — there's nothing for a partner
// to mistakenly poke at across tenants.
//
// VAT additions (v31): partners declare their VAT status here too, so
// /pay-qonto and /pay-bulk can wire the correct gross amount and embed
// HT/VAT/TTC in the Qonto note for each transfer.

const express = require('express');
const { query } = require('../db');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);

// Two-letter country codes pass through (Qonto itself doesn't care
// about this column); the sentinel `OTHER` is also accepted from
// the UI, but stored as NULL since the column is CHAR(2). On read
// we map NULL + tax_subject=true back to "OTHER" so the dropdown
// shows the right state.
const COUNTRY_RE = /^([A-Z]{2}|OTHER)$/;
const dbCountry = (raw) => (raw === 'OTHER' ? null : raw);
const apiCountry = (row) => (row && row.tax_subject && !row.tax_country ? 'OTHER' : (row?.tax_country || null));

router.get('/', async (req, res) => {
  if (!req.user.partnerId) return res.status(403).json({ error: 'Accès interdit' });
  try {
    const { rows } = await query(
      `SELECT account_holder, iban, bic, bank_name,
              tax_subject, tax_country, tax_rate, tax_id
         FROM partners WHERE id = $1`,
      [req.user.partnerId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Partenaire introuvable' });
    const row = rows[0];
    res.json({ bank_info: { ...row, tax_country: apiCountry(row) } });
  } catch (err) {
    console.error('Get bank-info error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/', async (req, res) => {
  if (!req.user.partnerId) return res.status(403).json({ error: 'Accès interdit' });
  try {
    const {
      account_holder, iban, bic, bank_name,
      tax_subject, tax_country, tax_rate, tax_id,
    } = req.body || {};

    if (iban) {
      const cleanIban = String(iban).replace(/\s/g, '').toUpperCase();
      if (cleanIban.length < 15 || cleanIban.length > 34) {
        return res.status(400).json({ error: 'Format IBAN invalide' });
      }
    }

    // VAT validation. tax_subject defaults to false; when it's true,
    // tax_country AND tax_rate are mandatory so /pay-qonto can never
    // reach a partner with `subject=true` and missing config.
    const subject = tax_subject === true;
    let country = null;
    let rate = null;
    if (subject) {
      country = String(tax_country || '').trim().toUpperCase();
      if (!COUNTRY_RE.test(country)) {
        return res.status(400).json({ error: 'tax_country_required', message: 'Pays TVA invalide ou manquant.' });
      }
      const parsed = parseFloat(tax_rate);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 30) {
        return res.status(400).json({ error: 'tax_rate_invalid', message: 'Taux TVA invalide (entre 0 et 30 attendu).' });
      }
      rate = Math.round(parsed * 100) / 100;
    }
    const cleanTaxId = tax_id != null ? String(tax_id).trim().slice(0, 64) : null;

    const { rows: [partner] } = await query(
      `UPDATE partners
          SET account_holder = $2,
              iban           = $3,
              bic            = $4,
              bank_name      = $5,
              tax_subject    = $6,
              tax_country    = $7,
              tax_rate       = $8,
              tax_id         = $9
        WHERE id = $1
        RETURNING account_holder, iban, bic, bank_name,
                  tax_subject, tax_country, tax_rate, tax_id`,
      [
        req.user.partnerId,
        account_holder || null,
        iban ? String(iban).replace(/\s/g, '').toUpperCase() : null,
        bic ? String(bic).toUpperCase() : null,
        bank_name || null,
        subject,
        subject ? dbCountry(country) : null,
        subject ? rate : null,
        cleanTaxId || null,
      ]
    );
    if (!partner) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ bank_info: { ...partner, tax_country: apiCountry(partner) } });
  } catch (err) {
    console.error('Update bank-info error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

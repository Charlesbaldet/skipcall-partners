const express = require('express');
const { query } = require('../db');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);

// Six email toggles (in-app is always on per spec).
const DEFAULTS = {
  email_referral_status: true,
  email_referral_won: true,
  email_commission_update: true,
  email_new_message: true,
  email_news: false,
  email_tier_change: true,
};
const KEYS = Object.keys(DEFAULTS);

// Resolve the partner id for the current user. Reads the JWT's
// partnerId first; falls back to user_roles when the JWT was minted
// before multi-role was added (/switch-space flow).
async function resolvePartnerId(req) {
  if (req.user?.partnerId) return req.user.partnerId;
  if (!req.user?.id) return null;
  const { rows } = await query(
    `SELECT partner_id FROM user_roles
      WHERE user_id = $1 AND role = 'partner' AND is_active = TRUE
        AND ($2::uuid IS NULL OR tenant_id = $2)
        AND partner_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [req.user.id, req.tenantId || req.user.tenantId || null]
  );
  return rows[0]?.partner_id || null;
}

router.get('/', async (req, res) => {
  try {
    const partnerId = await resolvePartnerId(req);
    if (!partnerId) return res.status(400).json({ error: 'Aucun partenaire associé' });
    const { rows } = await query(
      'SELECT notification_preferences FROM partners WHERE id = $1 LIMIT 1',
      [partnerId]
    );
    const stored = rows[0]?.notification_preferences || {};
    // Merge saved values over defaults so new keys added later still
    // return a sensible value for old partners.
    const out = { ...DEFAULTS };
    for (const k of KEYS) if (typeof stored[k] === 'boolean') out[k] = stored[k];
    res.json({ preferences: out });
  } catch (err) {
    console.error('[partner-notif-prefs GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/', async (req, res) => {
  try {
    const partnerId = await resolvePartnerId(req);
    if (!partnerId) return res.status(400).json({ error: 'Aucun partenaire associé' });
    const input = req.body?.preferences && typeof req.body.preferences === 'object' ? req.body.preferences : {};
    const next = { ...DEFAULTS };
    for (const k of KEYS) if (typeof input[k] === 'boolean') next[k] = input[k];
    await query(
      'UPDATE partners SET notification_preferences = $1 WHERE id = $2',
      [JSON.stringify(next), partnerId]
    );
    res.json({ preferences: next });
  } catch (err) {
    console.error('[partner-notif-prefs PUT]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

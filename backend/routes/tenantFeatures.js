const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const { getFeatures, invalidate } = require('../middleware/featureFlag');

const router = express.Router();
// NB: authenticate/tenantScope are attached PER ROUTE rather than via
// router.use(...) so requests for paths not declared here (notably
// /api/tenants/public/:slug, which lives in tenantRoutes) fall
// through without being 401'd first. Applying them globally would
// hijack every /api/tenants/* request and block the public slug
// lookup used by the partner registration page.

// GET /api/tenants/features — return the flags + tracking config for
// the caller's tenant. Any authenticated user can read (the frontend
// needs them to gate UI), only admins can write.
router.get('/features', authenticate, tenantScope, async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'no tenant' });
    const flags = await getFeatures(req.tenantId);
    res.json({ features: flags });
  } catch (err) {
    console.error('[tenantFeatures GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/tenants/features — admin updates flags + tracking config.
// Body: any subset of { feature_referral_links, feature_promo_codes,
// feature_tracking_script, tracking_redirect_url, tracking_cookie_days }
router.put('/features', authenticate, tenantScope, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'no tenant' });
    const {
      feature_referral_links,
      feature_promo_codes,
      feature_tracking_script,
      tracking_redirect_url,
      tracking_cookie_days,
    } = req.body || {};

    const sets = [];
    const params = [];
    let i = 1;
    const add = (col, val) => { sets.push(`${col} = $${i++}`); params.push(val); };
    if (feature_referral_links !== undefined) add('feature_referral_links', !!feature_referral_links);
    if (feature_promo_codes !== undefined) add('feature_promo_codes', !!feature_promo_codes);
    if (feature_tracking_script !== undefined) add('feature_tracking_script', !!feature_tracking_script);
    if (tracking_redirect_url !== undefined) add('tracking_redirect_url', tracking_redirect_url || null);
    if (tracking_cookie_days !== undefined) {
      const n = parseInt(tracking_cookie_days, 10);
      add('tracking_cookie_days', Number.isFinite(n) && n > 0 ? n : 30);
    }
    if (!sets.length) return res.json({ ok: true, noop: true });

    params.push(req.tenantId);
    await query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $${i}`, params);
    invalidate(req.tenantId);

    const flags = await getFeatures(req.tenantId);
    res.json({ features: flags });
  } catch (err) {
    console.error('[tenantFeatures PUT]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

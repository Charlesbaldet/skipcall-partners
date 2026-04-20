const express = require('express');
const { query } = require('../db');

const router = express.Router();

// Public redirect endpoint mounted at the app root. Vercel rewrites
// /r/:path* to this service so sharing refboost.io/r/{slug}?ref=CODE
// works as a short link.
//
// Flow: resolve tenant by slug → resolve partner by referral code →
// fire-and-forget click insert → 302 to tenants.website. Missing
// website returns a minimal HTML placeholder so the visitor knows the
// link isn't broken, just misconfigured.
router.get('/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const ref = req.query.ref ? String(req.query.ref).toUpperCase() : null;

    const { rows: [tenant] } = await query(
      `SELECT id, name, website FROM tenants WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    if (!tenant) {
      return res.status(404).type('html').send(
        '<!doctype html><meta charset="utf-8"><title>RefBoost</title>' +
        '<body style="font-family:system-ui;padding:40px;text-align:center;">' +
        '<h2>Lien non valide</h2></body>'
      );
    }

    // Fire-and-forget click log. Resolve the partner only if the ref
    // code matches this tenant; otherwise we still redirect (anonymous
    // landing) but skip the insert.
    if (ref) {
      (async () => {
        try {
          const { rows: [partner] } = await query(
            `SELECT id FROM partners WHERE referral_code = $1 AND tenant_id = $2 LIMIT 1`,
            [ref, tenant.id]
          );
          if (!partner) return;
          await query(
            `INSERT INTO referral_clicks
              (tenant_id, partner_id, referral_code, ip_address, user_agent, referrer_url, landing_page)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              tenant.id,
              partner.id,
              ref,
              (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 45),
              (req.headers['user-agent'] || '').toString().slice(0, 500),
              (req.headers['referer'] || '').toString().slice(0, 500),
              req.originalUrl.slice(0, 500),
            ]
          );
        } catch (err) {
          console.error('[r/redirect click log]', err.message);
        }
      })();
    }

    if (!tenant.website) {
      return res.status(200).type('html').send(
        '<!doctype html><meta charset="utf-8"><title>RefBoost</title>' +
        '<body style="font-family:system-ui;padding:40px;text-align:center;">' +
        `<h2>Lien non configuré</h2><p>${tenant.name || ''} n'a pas configuré de site web de destination.</p></body>`
      );
    }

    return res.redirect(302, tenant.website);
  } catch (err) {
    console.error('[r/redirect]', err);
    res.status(500).type('html').send('<!doctype html><body>Erreur</body>');
  }
});

module.exports = router;

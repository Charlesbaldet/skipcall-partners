const express = require('express');
const { query } = require('../db');

const router = express.Router();

const BACKEND = (process.env.RAILWAY_PUBLIC_DOMAIN
  ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN.replace(/^https?:\/\//, '')
  : 'https://skipcall-partners-production.up.railway.app').replace(/\/$/, '');

// GET /api/tracking/refboost.js — embeddable client-side tracker.
// Served with an open CORS policy so it can be included from any
// customer-owned site via `<script src="…/refboost.js" data-tenant="slug"></script>`.
// Feature-gated by `feature_tracking_script` on the tenant — if the
// flag is off, the script short-circuits at runtime (still 200 OK so
// script tags on customer sites don't start throwing).
router.get('/refboost.js', async (req, res) => {
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=300');

  let cookieDays = 30;
  let enabled = false;
  const slug = req.query.tenant;
  if (slug) {
    try {
      const { rows } = await query(
        'SELECT feature_tracking_script, tracking_cookie_days FROM tenants WHERE slug = $1 LIMIT 1',
        [String(slug)]
      );
      if (rows[0]) {
        enabled = !!rows[0].feature_tracking_script;
        if (rows[0].tracking_cookie_days) cookieDays = rows[0].tracking_cookie_days;
      }
    } catch {}
  }

  const js = `(function() {
  var ENABLED = ${enabled ? 'true' : 'false'};
  var TRACK_URL = ${JSON.stringify(BACKEND + '/api/referral-links/track')};
  var COOKIE_DAYS = ${cookieDays};
  if (!ENABLED) return;
  try {
    var params = new URLSearchParams(window.location.search);
    var ref = params.get('ref');
    var promo = params.get('promo');
    var script = document.currentScript;
    var tenant = (script && script.getAttribute('data-tenant')) ||
      (function(){ try { return new URL(script.src).searchParams.get('tenant'); } catch (e) { return null; } })();
    function setCookie(name, value) {
      document.cookie = name + '=' + encodeURIComponent(value) + ';max-age=' + (COOKIE_DAYS*24*60*60) + ';path=/;SameSite=Lax';
    }
    if (ref) {
      setCookie('refboost_ref', ref);
      var url = TRACK_URL + '?ref=' + encodeURIComponent(ref) +
        (tenant ? '&tenant=' + encodeURIComponent(tenant) : '') +
        '&landing=' + encodeURIComponent(location.href);
      try { fetch(url, { mode: 'cors', keepalive: true }).catch(function(){}); } catch(e){}
    }
    if (promo) setCookie('refboost_promo', promo);
    window.RefBoost = {
      getRef: function(){ var m = document.cookie.match(/refboost_ref=([^;]+)/); return m ? decodeURIComponent(m[1]) : null; },
      getPromo: function(){ var m = document.cookie.match(/refboost_promo=([^;]+)/); return m ? decodeURIComponent(m[1]) : null; }
    };
  } catch(e) {}
})();`;
  res.send(js);
});

router.options('/refboost.js', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.sendStatus(204);
});

module.exports = router;

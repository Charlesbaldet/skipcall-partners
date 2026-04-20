const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const { requireFeature } = require('../middleware/featureFlag');

const router = express.Router();

const FRONTEND = (process.env.FRONTEND_URL || 'https://refboost.io').replace(/\/$/, '');

// Unique 6-char alphanumeric code with REF- prefix. Caller is expected
// to verify uniqueness against the partners.referral_code unique index.
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'REF-' + s;
}

async function allocateUniqueCode() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = generateCode();
    const { rows } = await query('SELECT 1 FROM partners WHERE referral_code = $1 LIMIT 1', [candidate]);
    if (!rows.length) return candidate;
  }
  // Very unlikely — fall back to a longer string
  return generateCode() + generateCode().slice(4);
}

// ─── Authenticated endpoints ────────────────────────────────────────

router.use(['/partners', '/click-stats', '/source-breakdown'], authenticate, tenantScope);

// GET /api/referral-links/partners/:id — returns the partner's code +
// shareable link + lifetime / month click counts + conversion count.
// Feature-gated.
router.get('/partners/:id', requireFeature('feature_referral_links'), async (req, res) => {
  try {
    const { id } = req.params;
    // Partners can only read their own.
    if (req.user.role === 'partner' && req.user.partnerId !== id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { rows: [p] } = await query(
      'SELECT p.id, p.name, p.referral_code, t.slug AS tenant_slug FROM partners p JOIN tenants t ON t.id = p.tenant_id WHERE p.id = $1 AND p.tenant_id = $2',
      [id, req.tenantId]
    );
    if (!p) return res.status(404).json({ error: 'Partner introuvable' });

    let code = p.referral_code;
    if (!code) {
      code = await allocateUniqueCode();
      await query('UPDATE partners SET referral_code = $1 WHERE id = $2', [code, id]);
    }

    const { rows: [stats] } = await query(
      `SELECT
         COUNT(*)::int AS total_clicks,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS month_clicks
       FROM referral_clicks
       WHERE partner_id = $1`,
      [id]
    );

    const referralLink = `${FRONTEND}/r/${p.tenant_slug || ''}?ref=${encodeURIComponent(code)}`;
    res.json({
      referralCode: code,
      referralLink,
      stats: {
        total_clicks: stats?.total_clicks || 0,
        month_clicks: stats?.month_clicks || 0,
      },
    });
  } catch (err) {
    console.error('[referral-links GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/referral-links/partners/:id/regenerate — admin-only.
router.post('/partners/:id/regenerate', requireFeature('feature_referral_links'), authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: [p] } = await query('SELECT id FROM partners WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
    if (!p) return res.status(404).json({ error: 'Partner introuvable' });
    const code = await allocateUniqueCode();
    await query('UPDATE partners SET referral_code = $1 WHERE id = $2', [code, id]);
    res.json({ referralCode: code });
  } catch (err) {
    console.error('[referral-links regenerate]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/referral-links/click-stats — admin overview: per-partner
// click counts + conversion rate.
router.get('/click-stats', requireFeature('feature_referral_links'), authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.name, p.referral_code,
              COALESCE(clicks.total, 0)::int AS total_clicks,
              COALESCE(clicks.month, 0)::int AS month_clicks,
              COALESCE(conv.n, 0)::int AS conversions
         FROM partners p
         LEFT JOIN (
           SELECT partner_id,
                  COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS month
             FROM referral_clicks
            WHERE tenant_id = $1
            GROUP BY partner_id
         ) clicks ON clicks.partner_id = p.id
         LEFT JOIN (
           SELECT partner_id, COUNT(*) AS n
             FROM referrals
            WHERE tenant_id = $1 AND (source IN ('referral_link', 'promo_code') OR referral_code_used IS NOT NULL)
            GROUP BY partner_id
         ) conv ON conv.partner_id = p.id
        WHERE p.tenant_id = $1
        ORDER BY total_clicks DESC, p.name`,
      [req.tenantId]
    );
    res.json({ stats: rows });
  } catch (err) {
    console.error('[referral-links click-stats]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/referral-links/source-breakdown — admin: count referrals by
// source bucket so the dashboard can render a simple breakdown.
router.get('/source-breakdown', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT COALESCE(source, 'manual') AS source, COUNT(*)::int AS n
         FROM referrals
        WHERE tenant_id = $1
        GROUP BY 1
        ORDER BY n DESC`,
      [req.tenantId]
    );
    res.json({ breakdown: rows });
  } catch (err) {
    console.error('[referral-links source-breakdown]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Public endpoints (no auth) ─────────────────────────────────────

// GET /api/referral-links/track?ref=REF-XXXX&tenant=slug — logs the
// click and returns JSON (the refboost.js client ignores the body).
// Kept as a JSON endpoint rather than a 302 redirect so it's easy to
// call via fetch from arbitrary origins.
router.get('/track', async (req, res) => {
  // Wide-open CORS — this endpoint is meant to be called from any
  // customer site where the tracking script is embedded.
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  try {
    const { ref, tenant, promo, landing } = req.query;
    if (!ref && !promo) return res.json({ ok: true, skipped: 'no_code' });

    // Resolve tenant by slug (or by ref code if no slug was passed).
    let tenantRow = null;
    if (tenant) {
      const r = await query('SELECT id FROM tenants WHERE slug = $1 LIMIT 1', [tenant]);
      tenantRow = r.rows[0];
    }
    let partnerRow = null;
    if (ref) {
      const r = await query(
        'SELECT id, tenant_id FROM partners WHERE referral_code = $1 LIMIT 1',
        [String(ref).toUpperCase()]
      );
      partnerRow = r.rows[0];
    } else if (promo && tenantRow) {
      const r = await query(
        'SELECT partner_id FROM promo_codes WHERE tenant_id = $1 AND code = $2 AND is_active = TRUE LIMIT 1',
        [tenantRow.id, String(promo).toUpperCase()]
      );
      if (r.rows[0]) partnerRow = { id: r.rows[0].partner_id, tenant_id: tenantRow.id };
    }
    if (!partnerRow) return res.json({ ok: true, skipped: 'unknown_code' });

    await query(
      `INSERT INTO referral_clicks
        (tenant_id, partner_id, referral_code, promo_code, ip_address, user_agent, referrer_url, landing_page)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        partnerRow.tenant_id,
        partnerRow.id,
        ref ? String(ref).toUpperCase() : null,
        promo ? String(promo).toUpperCase() : null,
        (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 45),
        (req.headers['user-agent'] || '').toString().slice(0, 500),
        (req.headers['referer'] || '').toString().slice(0, 500),
        (landing || '').toString().slice(0, 500),
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[referral-links track]', err.message);
    res.json({ ok: false });
  }
});

router.options('/track', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.sendStatus(204);
});

module.exports = router;

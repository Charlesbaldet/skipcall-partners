// Partner-facing read of "their" form link.
//
// The partner needs to see and copy the public form URL their tenant
// has set up for them: /f/<form_id>?p=<token>. The admin builder
// already lets the tenant generate these tokens; this endpoint
// just exposes the result to the owning partner (and only to them).
//
// Returns null when:
//   - the tenant hasn't created a form yet, OR
//   - the form is not published, OR
//   - no token exists yet for this partner.
// The FE renders an empty-state hint in that case.
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    const partnerId = req.user.partnerId;
    const tenantId  = req.user.tenantId;
    if (!partnerId || !tenantId) return res.json({ link: null });

    // One published form per tenant — partial UNIQUE on deleted_at IS
    // NULL keeps the assumption true. If the tenant has a draft form
    // we still surface it as null so the partner doesn't try to share
    // a non-public URL.
    const { rows: formRows } = await query(
      `SELECT id, title FROM forms
        WHERE tenant_id = $1 AND deleted_at IS NULL AND is_published = TRUE
        LIMIT 1`,
      [tenantId]
    );
    if (!formRows.length) return res.json({ link: null });
    const form = formRows[0];

    const { rows: tokenRows } = await query(
      `SELECT token FROM form_partner_tokens
        WHERE form_id = $1 AND partner_id = $2 LIMIT 1`,
      [form.id, partnerId]
    );
    if (!tokenRows.length) return res.json({ link: null });

    // Pull the tenant name so the FE can say "your client <name>"
    // without making a second round-trip.
    const { rows: tRows } = await query(
      `SELECT name FROM tenants WHERE id = $1 LIMIT 1`,
      [tenantId]
    );

    res.json({
      link: {
        form_id: form.id,
        form_title: form.title,
        token: tokenRows[0].token,
        tenant_name: tRows[0]?.name || '',
      },
    });
  } catch (err) {
    console.error('[partnerFormLink.GET] failed:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/partner/form-link/stats?period=30d
// Aggregates the partner's own funnel events on whatever form their
// tenant has published. Returns zeros when there's no published form
// or no token yet — the FE renders the empty-state placeholder in
// that case but the endpoint still 200s for symmetry.
router.get('/stats', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    const partnerId = req.user.partnerId;
    const tenantId  = req.user.tenantId;
    if (!partnerId || !tenantId) return res.json({ views: 0, submissions: 0, conversion_rate: 0 });

    const period = ['7d', '30d', '90d', 'all'].includes(req.query.period) ? req.query.period : '30d';
    const since = (() => {
      const now = Date.now();
      if (period === 'all') return null;
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      return new Date(now - days * 24 * 3600 * 1000);
    })();

    // Resolve tokens this partner holds on the tenant's form(s).
    const { rows: tokens } = await query(
      `SELECT fpt.token
         FROM form_partner_tokens fpt
         JOIN forms f ON f.id = fpt.form_id
        WHERE fpt.partner_id = $1 AND f.tenant_id = $2 AND f.deleted_at IS NULL`,
      [partnerId, tenantId]
    );
    if (!tokens.length) return res.json({ period, views: 0, submissions: 0, conversion_rate: 0 });

    const params = [tokens.map(r => r.token)];
    let extra = '';
    if (since) { params.push(since); extra = ' AND created_at >= $2'; }

    const { rows: typeRows } = await query(
      `SELECT event_type, COUNT(*)::int AS c
         FROM form_events
        WHERE partner_token = ANY($1::text[])${extra}
        GROUP BY event_type`,
      params
    );
    const counts = Object.fromEntries(typeRows.map(r => [r.event_type, r.c]));
    const views = counts.form_view || 0;
    const submissions = counts.form_submit || 0;

    res.json({
      period,
      views,
      submissions,
      conversion_rate: views ? submissions / views : 0,
    });
  } catch (err) {
    console.error('[partnerFormLink.stats] failed:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;

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

module.exports = router;

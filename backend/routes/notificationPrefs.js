const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const { KNOWN_EVENTS, invalidatePrefsCache } = require('../services/notifyService');
const { TEMPLATES, previewEmail } = require('../utils/emailTemplates');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);

// Map Settings event_types → email template keys. Used by the
// "Preview" button in Settings → Notifications et emails so admins
// can see what partners will actually receive.
const EVENT_TO_TEMPLATE = {
  new_referral: 'newReferralToAdmin',
  new_application: 'newApplicationToAdmin',
  referral_update: 'referralStatusChange',
  commission: 'commissionApproved',
  deal_won: 'commissionToApprove',
  news: null, // no dedicated template in the new catalog
  access_revoked: null,
};

// GET /api/settings/notification-preferences — admins read their tenant's prefs.
router.get('/', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.json({ preferences: [] });
    const { rows } = await query(
      'SELECT event_type, in_app, email FROM notification_preferences WHERE tenant_id = $1',
      [req.tenantId]
    );
    // Ensure every known event_type is represented (auto-filling defaults
    // for tenants whose seed didn't land — e.g. they were created after
    // the migration seed ran).
    const byType = Object.fromEntries(rows.map(r => [r.event_type, r]));
    const preferences = [...KNOWN_EVENTS].map(type => ({
      event_type: type,
      in_app: byType[type]?.in_app !== false,
      email: byType[type]?.email !== false,
    }));
    res.json({ preferences });
  } catch (err) {
    console.error('[notification-preferences GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/settings/notification-preferences — admin updates prefs.
// Body: { preferences: [{ event_type, in_app, email }, …] }
router.put('/', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'no tenant' });
    const input = Array.isArray(req.body?.preferences) ? req.body.preferences : [];
    for (const p of input) {
      if (!KNOWN_EVENTS.has(p.event_type)) continue;
      await query(
        `INSERT INTO notification_preferences (tenant_id, event_type, in_app, email)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, event_type)
         DO UPDATE SET in_app = EXCLUDED.in_app, email = EXCLUDED.email`,
        [req.tenantId, p.event_type, !!p.in_app, !!p.email]
      );
    }
    invalidatePrefsCache(req.tenantId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[notification-preferences PUT]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/settings/notification-preferences/preview/:key — renders the
// named email template with sample data. Accepts either an event_type
// (mapped via EVENT_TO_TEMPLATE) or a direct template key. Returns
// `{ subject, html }`. Admin-only — same surface as the prefs
// endpoints above.
router.get('/preview/:key', authorize('admin', 'superadmin'), (req, res) => {
  const raw = req.params.key;
  const templateKey = TEMPLATES[raw] ? raw : EVENT_TO_TEMPLATE[raw];
  if (!templateKey) {
    return res.status(404).json({ error: 'No preview available for this event.' });
  }
  const rendered = previewEmail(templateKey);
  if (!rendered) return res.status(404).json({ error: 'Template not found' });
  res.json({ subject: rendered.subject, html: rendered.html });
});

module.exports = router;

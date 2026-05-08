const express = require('express');
const { query } = require('../db');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);

// Tenant scoping on every read/write. The notifications table got
// its tenant_id column in v38 (with backfill from news_post_id +
// users.tenant_id). Without these filters a user re-invited as a
// partner in a second program would see the union of both tenants'
// notifications in their sidebar feed.
//
// req.skipTenantFilter is set by tenantScope for superadmin —
// honoured here so the ops side keeps cross-tenant reach. For every
// other role, tenantId is required (the ::uuid cast on a NULL would
// match a NULL column and cancel the filter, so we gate explicitly).

function tenantParams(req) {
  return {
    tenantId: req.skipTenantFilter ? null : (req.tenantId || null),
    skip: !!req.skipTenantFilter,
  };
}

// GET /api/notifications — most recent 50 for current user
router.get('/', async (req, res) => {
  try {
    const { tenantId, skip } = tenantParams(req);
    const { rows } = await query(
      `SELECT id, type, title, message, link, is_read, news_post_id, created_at
         FROM notifications
        WHERE user_id = $1
          AND ($2::boolean OR tenant_id = $3)
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.user.id, skip, tenantId]
    );
    res.json({ notifications: rows });
  } catch (err) {
    console.error('[notifications GET /]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/notifications/unread-count — { count }
router.get('/unread-count', async (req, res) => {
  try {
    const { tenantId, skip } = tenantParams(req);
    const { rows } = await query(
      `SELECT COUNT(*)::int AS c
         FROM notifications
        WHERE user_id = $1
          AND is_read = false
          AND ($2::boolean OR tenant_id = $3)`,
      [req.user.id, skip, tenantId]
    );
    res.json({ count: rows[0]?.c || 0 });
  } catch (err) {
    console.error('[notifications unread-count]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/notifications/unread-by-category — { news, referral_update, … }
// Used by the sidebar red-dot poll. Returns zero for categories the user
// has no unread notifications in, so the frontend can treat missing keys
// as 0.
router.get('/unread-by-category', async (req, res) => {
  try {
    const { tenantId, skip } = tenantParams(req);
    const { rows } = await query(
      `SELECT type, COUNT(*)::int AS c
         FROM notifications
        WHERE user_id = $1
          AND is_read = false
          AND ($2::boolean OR tenant_id = $3)
        GROUP BY type`,
      [req.user.id, skip, tenantId]
    );
    const counts = {};
    for (const r of rows) counts[r.type] = r.c;
    res.json({ counts });
  } catch (err) {
    console.error('[notifications unread-by-category]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/notifications/mark-category-read/:category
// Called when the user visits a page that corresponds to a notification
// category — marks every unread notification of that type as read so
// the sidebar dot clears immediately.
router.put('/mark-category-read/:category', async (req, res) => {
  try {
    const cat = String(req.params.category || '').slice(0, 50);
    if (!cat) return res.status(400).json({ error: 'category required' });
    const { tenantId, skip } = tenantParams(req);
    const { rowCount } = await query(
      `UPDATE notifications SET is_read = true
        WHERE user_id = $1
          AND type = $2
          AND is_read = false
          AND ($3::boolean OR tenant_id = $4)`,
      [req.user.id, cat, skip, tenantId]
    );
    res.json({ ok: true, updated: rowCount });
  } catch (err) {
    console.error('[notifications mark-category-read]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/notifications/read-all — mark all for current user as read
// NOTE: must be declared before /:id/read so Express doesn't match
// "read-all" against the :id param.
router.put('/read-all', async (req, res) => {
  try {
    const { tenantId, skip } = tenantParams(req);
    await query(
      `UPDATE notifications SET is_read = true
        WHERE user_id = $1
          AND is_read = false
          AND ($2::boolean OR tenant_id = $3)`,
      [req.user.id, skip, tenantId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications read-all]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    const { tenantId, skip } = tenantParams(req);
    const { rowCount } = await query(
      `UPDATE notifications SET is_read = true
        WHERE id = $1
          AND user_id = $2
          AND ($3::boolean OR tenant_id = $4)`,
      [req.params.id, req.user.id, skip, tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'introuvable' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications read]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

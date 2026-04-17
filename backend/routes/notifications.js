const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/notifications — most recent 50 for current user
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, type, title, message, link, is_read, news_post_id, created_at
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.user.id]
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
    const { rows } = await query(
      'SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
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
    const { rows } = await query(
      `SELECT type, COUNT(*)::int AS c
         FROM notifications
        WHERE user_id = $1 AND is_read = false
        GROUP BY type`,
      [req.user.id]
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
    const { rowCount } = await query(
      `UPDATE notifications SET is_read = true
        WHERE user_id = $1 AND type = $2 AND is_read = false`,
      [req.user.id, cat]
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
    await query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.user.id]
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
    const { rowCount } = await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'introuvable' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications read]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

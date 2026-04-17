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

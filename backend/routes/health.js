// Health + status surface (ISO 27001 A.12.1 / SOC 2 CC7).
//
// GET  /api/health               public liveness probe — DB ping +
//                                memory + uptime + commit sha
// GET  /api/health/incidents     public list of the last 30 days
//                                of incidents, newest first
// POST /api/health/incidents     superadmin-only manual entry
// PATCH /api/health/incidents/:id superadmin-only update (close,
//                                change status / severity, etc)
//
// Mounted before rate limiters and before authenticate so the
// liveness probe and the public StatusPage fetch are always
// reachable, even when the rest of the API is rate-limited or
// degraded.

const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', async (req, res) => {
  const checks = {};

  try {
    const start = Date.now();
    await query('SELECT 1');
    checks.database = { status: 'ok', latency_ms: Date.now() - start };
  } catch (e) {
    checks.database = { status: 'error', message: e.message };
  }

  const mem = process.memoryUsage();
  checks.memory = {
    status: mem.heapUsed < 500 * 1024 * 1024 ? 'ok' : 'warning',
    heap_mb: Math.round(mem.heapUsed / 1024 / 1024),
  };

  checks.uptime_s = Math.round(process.uptime());
  checks.version = process.env.RAILWAY_GIT_COMMIT_SHA?.substring(0, 7) || 'dev';

  const allOk = checks.database.status === 'ok' && checks.memory.status === 'ok';
  res.status(allOk ? 200 : 503).json(checks);
});

// Public — last 30 days of incidents, newest first. The status page
// renders the latest 10 client-side; we ship 30 days for any
// future "view full history" link without an extra round-trip.
router.get('/incidents', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, title, severity, status, description,
              started_at, resolved_at, created_at
         FROM status_incidents
        WHERE started_at > NOW() - INTERVAL '30 days'
        ORDER BY started_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load incidents' });
  }
});

router.post('/incidents', authenticate, authorize('superadmin'), async (req, res) => {
  const { title, severity, status, description } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const { rows } = await query(
      `INSERT INTO status_incidents (title, severity, status, description)
       VALUES ($1, COALESCE($2, 'minor'), COALESCE($3, 'investigating'), $4)
       RETURNING *`,
      [title, severity || null, status || null, description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/incidents/:id', authenticate, authorize('superadmin'), async (req, res) => {
  const { id } = req.params;
  const { title, severity, status, description, resolved_at } = req.body || {};
  // Auto-stamp resolved_at when the incident transitions to "resolved"
  // and the caller didn't supply an explicit timestamp.
  const resolvedAt = resolved_at !== undefined
    ? resolved_at
    : (status === 'resolved' ? new Date().toISOString() : undefined);
  try {
    const { rows } = await query(
      `UPDATE status_incidents
          SET title       = COALESCE($1, title),
              severity    = COALESCE($2, severity),
              status      = COALESCE($3, status),
              description = COALESCE($4, description),
              resolved_at = COALESCE($5, resolved_at)
        WHERE id = $6
        RETURNING *`,
      [title || null, severity || null, status || null, description || null, resolvedAt || null, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

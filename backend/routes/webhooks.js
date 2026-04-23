const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const { generateSecret, retryDelivery, EVENT_TYPES } = require('../services/webhookService');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);

const MAX_ENDPOINTS_PER_TENANT = 10;

function isValidHttpsUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'https:';
  } catch { return false; }
}

function sanitizeEvents(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter(e => typeof e === 'string' && EVENT_TYPES.includes(e)))];
}

// Public: the supported event types, so the frontend doesn't have to
// hardcode them.
router.get('/event-types', (_req, res) => {
  res.json({ events: EVENT_TYPES });
});

// ─── Endpoints CRUD ──────────────────────────────────────────────────
router.get('/endpoints', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, url, events, is_active, created_at, updated_at
         FROM webhook_endpoints
        WHERE tenant_id = $1
        ORDER BY created_at DESC`,
      [req.tenantId]
    );
    res.json({ endpoints: rows });
  } catch (err) {
    console.error('[webhooks] list endpoints:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/endpoints', authorize('admin', 'superadmin'), async (req, res) => {
  const { url, events } = req.body || {};
  if (!url || !isValidHttpsUrl(url)) {
    return res.status(400).json({ error: 'invalid_url', message: 'URL must start with https://' });
  }
  const cleanEvents = sanitizeEvents(events);
  if (!cleanEvents.length) {
    return res.status(400).json({ error: 'no_events', message: 'At least one event must be subscribed' });
  }

  try {
    const { rows: [countRow] } = await query(
      'SELECT COUNT(*)::int AS n FROM webhook_endpoints WHERE tenant_id = $1',
      [req.tenantId]
    );
    if (countRow.n >= MAX_ENDPOINTS_PER_TENANT) {
      return res.status(400).json({ error: 'limit_reached', message: `Maximum ${MAX_ENDPOINTS_PER_TENANT} endpoints per tenant` });
    }
    const secret = generateSecret();
    const { rows: [row] } = await query(
      `INSERT INTO webhook_endpoints (tenant_id, url, secret, events)
       VALUES ($1, $2, $3, $4)
       RETURNING id, url, secret, events, is_active, created_at, updated_at`,
      [req.tenantId, url, secret, cleanEvents]
    );
    // Secret is returned ONCE at creation — subsequent GETs omit it.
    res.status(201).json({ endpoint: row });
  } catch (err) {
    console.error('[webhooks] create endpoint:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.put('/endpoints/:id', authorize('admin', 'superadmin'), async (req, res) => {
  const { id } = req.params;
  const { url, events, is_active } = req.body || {};

  const sets = [];
  const params = [];
  let i = 1;
  if (typeof url === 'string') {
    if (!isValidHttpsUrl(url)) return res.status(400).json({ error: 'invalid_url' });
    sets.push(`url = $${i++}`); params.push(url);
  }
  if (events !== undefined) {
    const cleanEvents = sanitizeEvents(events);
    if (!cleanEvents.length) return res.status(400).json({ error: 'no_events' });
    sets.push(`events = $${i++}`); params.push(cleanEvents);
  }
  if (typeof is_active === 'boolean') {
    sets.push(`is_active = $${i++}`); params.push(is_active);
  }
  if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
  sets.push('updated_at = NOW()');
  params.push(id, req.tenantId);

  try {
    const { rows: [row] } = await query(
      `UPDATE webhook_endpoints
          SET ${sets.join(', ')}
        WHERE id = $${i++} AND tenant_id = $${i++}
        RETURNING id, url, events, is_active, created_at, updated_at`,
      params
    );
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json({ endpoint: row });
  } catch (err) {
    console.error('[webhooks] update endpoint:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.delete('/endpoints/:id', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM webhook_endpoints WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[webhooks] delete endpoint:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ─── Deliveries ──────────────────────────────────────────────────────
router.get('/endpoints/:id/deliveries', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    // Confirm the endpoint belongs to this tenant before exposing its
    // delivery log.
    const { rows: [ep] } = await query(
      'SELECT id FROM webhook_endpoints WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!ep) return res.status(404).json({ error: 'not_found' });

    const { rows } = await query(
      `SELECT id, event_type, response_status, success, attempts,
              next_retry_at, created_at,
              LEFT(response_body, 500) AS response_body
         FROM webhook_deliveries
        WHERE webhook_endpoint_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.params.id]
    );
    res.json({ deliveries: rows });
  } catch (err) {
    console.error('[webhooks] list deliveries:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/endpoints/:id/deliveries/:deliveryId/retry', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const result = await retryDelivery(req.params.deliveryId, req.tenantId);
    if (!result.ok) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('[webhooks] retry delivery:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;

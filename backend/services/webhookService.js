const crypto = require('crypto');
const { query } = require('../db');

// ─── Config ──────────────────────────────────────────────────────────
const TIMEOUT_MS = 10_000;
// Retry cadence per task spec: 1 minute, 10 minutes, 1 hour.
const RETRY_DELAYS_MS = [60_000, 10 * 60_000, 60 * 60_000];
const MAX_ATTEMPTS = 4; // 1 initial + 3 retries
const RETRY_WORKER_INTERVAL_MS = 30_000;
const EVENT_TYPES = [
  'referral.created',
  'referral.updated',
  'referral.won',
  'referral.lost',
  'partner.registered',
  'partner.approved',
  'commission.created',
  'commission.approved',
  'commission.paid',
];

// ─── Crypto helpers ──────────────────────────────────────────────────
function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function signPayload(secret, rawBody) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  return 'sha256=' + hmac.digest('hex');
}

// ─── Delivery ────────────────────────────────────────────────────────
// Perform a single POST attempt against the endpoint's URL. Persists
// the result in webhook_deliveries and schedules the next retry if we
// haven't exhausted MAX_ATTEMPTS. Callers shouldn't await this —
// sendWebhookEvent fires it off without blocking the triggering
// request handler.
async function deliverOnce(delivery, endpoint) {
  const rawBody = JSON.stringify(delivery.payload);
  const signature = signPayload(endpoint.secret, rawBody);

  let responseStatus = null;
  let responseBody = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RefBoost-Signature': signature,
        'X-RefBoost-Event': delivery.event_type,
        'X-RefBoost-Delivery': delivery.id,
        'User-Agent': 'RefBoost-Webhooks/1.0',
      },
      body: rawBody,
      signal: controller.signal,
    });
    clearTimeout(timer);

    responseStatus = res.status;
    // Cap the stored response body so a chatty endpoint can't blow up
    // our webhook_deliveries table.
    try { responseBody = (await res.text()).slice(0, 2000); } catch { responseBody = null; }
    success = res.status >= 200 && res.status < 300;
  } catch (err) {
    responseStatus = 0;
    responseBody = String(err?.message || err).slice(0, 2000);
    success = false;
  }

  const attempts = (delivery.attempts || 0) + 1;
  let nextRetryAt = null;
  if (!success && attempts < MAX_ATTEMPTS) {
    const delay = RETRY_DELAYS_MS[attempts - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    nextRetryAt = new Date(Date.now() + delay);
  }

  await query(
    `UPDATE webhook_deliveries
       SET response_status = $1,
           response_body = $2,
           success = $3,
           attempts = $4,
           next_retry_at = $5
     WHERE id = $6`,
    [responseStatus, responseBody, success, attempts, nextRetryAt, delivery.id]
  );

  return { success, responseStatus };
}

// Public: called from route handlers after the triggering change has
// been committed. Non-blocking — we insert a pending delivery row per
// subscribed endpoint, then kick off each POST in the background. If
// the DB insert itself fails we swallow the error so the caller's
// response isn't affected (webhook misconfig shouldn't break the app).
async function sendWebhookEvent(tenantId, eventType, data) {
  if (!tenantId || !eventType) return;
  if (!EVENT_TYPES.includes(eventType)) {
    console.warn('[webhooks] unknown event type:', eventType);
    return;
  }

  let endpoints;
  try {
    const { rows } = await query(
      `SELECT id, url, secret, events
         FROM webhook_endpoints
        WHERE tenant_id = $1
          AND is_active = true
          AND $2 = ANY(events)`,
      [tenantId, eventType]
    );
    endpoints = rows;
  } catch (err) {
    // Table might not exist yet on a fresh boot (pre-migration). Fail
    // silently rather than breaking referral/commission creation.
    if (!err.message.includes('does not exist')) {
      console.error('[webhooks] endpoint lookup failed:', err.message);
    }
    return;
  }

  if (!endpoints.length) return;

  const eventEnvelope = {
    id: 'evt_' + crypto.randomBytes(8).toString('hex'),
    type: eventType,
    created_at: new Date().toISOString(),
    data,
  };

  for (const ep of endpoints) {
    try {
      const { rows: [row] } = await query(
        `INSERT INTO webhook_deliveries (webhook_endpoint_id, event_type, payload)
         VALUES ($1, $2, $3)
         RETURNING id, event_type, payload, attempts`,
        [ep.id, eventType, eventEnvelope]
      );
      // Fire the POST in the background. We intentionally don't
      // await — the triggering request handler shouldn't wait up to
      // 10s for a customer's endpoint.
      deliverOnce(row, ep).catch(err => {
        console.error('[webhooks] deliverOnce threw:', err.message);
      });
    } catch (err) {
      console.error('[webhooks] failed to queue delivery for endpoint', ep.id, err.message);
    }
  }
}

// Retry worker: scans for deliveries whose next_retry_at has passed
// and replays them. Called on a timer from server.js.
async function runRetryWorker() {
  try {
    const { rows } = await query(
      `SELECT d.id, d.event_type, d.payload, d.attempts,
              e.id AS endpoint_id, e.url, e.secret, e.is_active
         FROM webhook_deliveries d
         JOIN webhook_endpoints e ON e.id = d.webhook_endpoint_id
        WHERE d.success = false
          AND d.next_retry_at IS NOT NULL
          AND d.next_retry_at <= NOW()
          AND d.attempts < $1
          AND e.is_active = true
        ORDER BY d.next_retry_at ASC
        LIMIT 50`,
      [MAX_ATTEMPTS]
    );
    for (const r of rows) {
      // Optimistically clear next_retry_at so we don't double-fire if
      // the worker runs again while deliverOnce is still in flight.
      await query(
        `UPDATE webhook_deliveries SET next_retry_at = NULL WHERE id = $1`,
        [r.id]
      );
      const delivery = { id: r.id, event_type: r.event_type, payload: r.payload, attempts: r.attempts };
      const endpoint = { id: r.endpoint_id, url: r.url, secret: r.secret };
      deliverOnce(delivery, endpoint).catch(err => {
        console.error('[webhooks] retry deliverOnce threw:', err.message);
      });
    }
  } catch (err) {
    if (!err.message.includes('does not exist')) {
      console.error('[webhooks] retry worker error:', err.message);
    }
  }
}

function startRetryWorker() {
  setInterval(runRetryWorker, RETRY_WORKER_INTERVAL_MS);
  // First pass shortly after boot so stuck deliveries don't wait a
  // full interval.
  setTimeout(runRetryWorker, 15_000);
}

// Manually retry a specific delivery (from the admin UI). Resets
// attempts/retry clock so deliverOnce treats it as a fresh try.
async function retryDelivery(deliveryId, tenantId) {
  const { rows: [row] } = await query(
    `SELECT d.id, d.event_type, d.payload, d.attempts,
            e.id AS endpoint_id, e.url, e.secret, e.tenant_id, e.is_active
       FROM webhook_deliveries d
       JOIN webhook_endpoints e ON e.id = d.webhook_endpoint_id
      WHERE d.id = $1
        AND e.tenant_id = $2`,
    [deliveryId, tenantId]
  );
  if (!row) return { ok: false, error: 'not_found' };
  if (!row.is_active) return { ok: false, error: 'endpoint_inactive' };

  // Reset the retry bookkeeping so this counts as a fresh attempt.
  await query(
    `UPDATE webhook_deliveries
        SET success = false,
            response_status = NULL,
            response_body = NULL,
            next_retry_at = NULL
      WHERE id = $1`,
    [deliveryId]
  );
  const delivery = { id: row.id, event_type: row.event_type, payload: row.payload, attempts: row.attempts };
  const endpoint = { id: row.endpoint_id, url: row.url, secret: row.secret };
  const result = await deliverOnce(delivery, endpoint);
  return { ok: true, success: result.success, status: result.responseStatus };
}

module.exports = {
  sendWebhookEvent,
  startRetryWorker,
  retryDelivery,
  generateSecret,
  signPayload,
  EVENT_TYPES,
};

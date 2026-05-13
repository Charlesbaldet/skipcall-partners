// Pipedrive CRM connector — OAuth 2.0 + token refresh worker.
//
// Storage lives entirely in crm_integrations (existing table) under
// provider='pipedrive'. Tokens, api_domain, webhook credentials, and
// per-tenant config (pipeline_id, auto_push, last_pushed_at) all live
// in the settings JSONB. Sensitive values (access_token,
// refresh_token, webhook_auth_*) are encrypted via utils/crypto.js
// before persistence.
//
// This module ships P1 (OAuth + refresh worker) only. Push (P3),
// pull (P4), and webhooks (P5) will plug into the same row.

const crypto = require('crypto');
const { query } = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');

const PIPEDRIVE_AUTH_URL = 'https://oauth.pipedrive.com/oauth/authorize';
const PIPEDRIVE_TOKEN_URL = 'https://oauth.pipedrive.com/oauth/token';
// 10 minutes — wide enough to absorb a slow browser hand-off but short
// enough to make replay attacks impractical.
const STATE_TTL_MS = 10 * 60 * 1000;
// Refresh ahead of expiry so an in-flight request never gets a 401.
const TOKEN_REFRESH_LEEWAY_MS = 60 * 1000;
const REFRESH_WORKER_INTERVAL_MS = 10 * 60 * 1000;
// Pipedrive access tokens last 60 min; we refresh anything expiring
// within 5 min on each worker tick to stay well clear of the deadline.
const WORKER_REFRESH_HORIZON_MS = 5 * 60 * 1000;

const STATE_SECRET = () => process.env.JWT_SECRET || 'dev-state-secret';

function isConfigured() {
  return !!(process.env.PIPEDRIVE_CLIENT_ID && process.env.PIPEDRIVE_CLIENT_SECRET);
}

// ─── state signing (HMAC-SHA256) ─────────────────────────────────────
// Mirrors the qonto.js pattern: payload + ts, base64url'd, signed with
// JWT_SECRET. The signature binds the payload so we can trust
// tenantId on the unauthenticated /callback route.
function signState(payload) {
  const json = JSON.stringify({ ...payload, ts: Date.now() });
  const b64 = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', STATE_SECRET()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verifyState(state) {
  if (!state || typeof state !== 'string' || !state.includes('.')) return null;
  const [b64, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', STATE_SECRET()).update(b64).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(b64, 'base64url').toString()); }
  catch { return null; }
  if (!payload || !payload.ts) return null;
  if (Date.now() - payload.ts > STATE_TTL_MS) return null;
  return payload;
}

// ─── OAuth URLs ──────────────────────────────────────────────────────
// Pipedrive doesn't take a `scope` query param — the granted scopes are
// the union of what the Marketplace app config declares. We just store
// what /token returns so the UI can surface it.
function buildAuthorizeUrl(tenantId, redirectUri) {
  if (!isConfigured()) return null;
  const state = signState({ tenantId });
  const params = new URLSearchParams({
    client_id: process.env.PIPEDRIVE_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
  });
  return `${PIPEDRIVE_AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code, redirectUri) {
  if (!isConfigured()) throw new Error('pipedrive_not_configured');
  const basic = Buffer.from(
    `${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`
  ).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const r = await fetch(PIPEDRIVE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`pipedrive token exchange failed: ${r.status} ${txt.slice(0, 200)}`);
  }
  // Shape: { access_token, token_type:'bearer', refresh_token, scope,
  //          expires_in, api_domain, company_id, user_id }
  return r.json();
}

// ─── Persistence helpers ─────────────────────────────────────────────
async function ensurePipedriveIntegrationRow(tenantId) {
  const { rows } = await query(
    `INSERT INTO crm_integrations (tenant_id, provider, is_active, settings, connected_at)
     VALUES ($1, 'pipedrive', FALSE, '{}'::jsonb, NOW())
     ON CONFLICT (tenant_id, provider)
     DO UPDATE SET provider = crm_integrations.provider
     RETURNING id`,
    [tenantId]
  );
  return rows[0]?.id;
}

async function readSettings(tenantId) {
  const { rows } = await query(
    `SELECT settings FROM crm_integrations
      WHERE tenant_id = $1 AND provider = 'pipedrive' LIMIT 1`,
    [tenantId]
  );
  return rows[0]?.settings || null;
}

async function writeSettings(tenantId, nextSettings, { setActive } = {}) {
  const sql = setActive
    ? `UPDATE crm_integrations
          SET settings = $1::jsonb,
              is_active = TRUE,
              connected_at = COALESCE(connected_at, NOW())
        WHERE tenant_id = $2 AND provider = 'pipedrive'`
    : `UPDATE crm_integrations
          SET settings = $1::jsonb
        WHERE tenant_id = $2 AND provider = 'pipedrive'`;
  await query(sql, [JSON.stringify(nextSettings), tenantId]);
}

// Merge new OAuth tokens into the integration row. Existing fields
// (pipeline_id, auto_push, webhook_*) are preserved so a token refresh
// doesn't wipe later configuration.
async function saveTokens(tenantId, tokens) {
  await ensurePipedriveIntegrationRow(tenantId);
  const current = (await readSettings(tenantId)) || {};
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  const next = {
    ...current,
    api_domain: tokens.api_domain || current.api_domain || null,
    access_token: encrypt(tokens.access_token),
    refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : (current.refresh_token || null),
    token_expires_at: expiresAt,
    scope: tokens.scope || current.scope || null,
    company_id: tokens.company_id != null ? String(tokens.company_id) : (current.company_id || null),
    user_id: tokens.user_id != null ? String(tokens.user_id) : (current.user_id || null),
    pipeline_id: current.pipeline_id || null,
    auto_push: current.auto_push || false,
    webhook_id: current.webhook_id || null,
    webhook_auth_user: current.webhook_auth_user || null,
    webhook_auth_password: current.webhook_auth_password || null,
    last_pushed_at: current.last_pushed_at || {},
    connected_at: current.connected_at || new Date().toISOString(),
    last_error: null,
  };
  await writeSettings(tenantId, next, { setActive: true });
  return next;
}

async function markPipedriveIntegrationInactive(tenantId, reason) {
  const current = await readSettings(tenantId);
  if (!current) return;
  const next = { ...current, last_error: reason || 'unknown' };
  await query(
    `UPDATE crm_integrations
        SET is_active = FALSE, settings = $1::jsonb
      WHERE tenant_id = $2 AND provider = 'pipedrive'`,
    [JSON.stringify(next), tenantId]
  );
  // Log into crm_sync_log so the admin's history view can surface it.
  try {
    const { rows: ir } = await query(
      `SELECT id FROM crm_integrations
        WHERE tenant_id = $1 AND provider = 'pipedrive' LIMIT 1`,
      [tenantId]
    );
    if (ir[0]) {
      await query(
        `INSERT INTO crm_sync_log (integration_id, action, status, details)
         VALUES ($1, 'error', 'inactive', $2::jsonb)`,
        [ir[0].id, JSON.stringify({ reason: reason || 'unknown' })]
      );
    }
  } catch (e) {
    console.error('[pipedrive.markInactive.log]', e.message);
  }
}

// Decrypt + flatten into a caller-friendly shape. Never log this object
// raw — accessToken / refreshToken / webhookAuthPassword are in clear.
async function getTenantPipedrive(tenantId) {
  const { rows } = await query(
    `SELECT id, tenant_id, is_active, settings, connected_at, last_pull_at
       FROM crm_integrations
      WHERE tenant_id = $1 AND provider = 'pipedrive' LIMIT 1`,
    [tenantId]
  );
  const row = rows[0];
  if (!row) return null;
  const s = row.settings || {};
  return {
    id: row.id,
    tenantId: row.tenant_id,
    isActive: row.is_active,
    connectedAt: row.connected_at,
    lastPullAt: row.last_pull_at,
    apiDomain: s.api_domain || null,
    accessToken: s.access_token ? decrypt(s.access_token) : null,
    refreshToken: s.refresh_token ? decrypt(s.refresh_token) : null,
    tokenExpiresAt: s.token_expires_at || null,
    scope: s.scope || null,
    companyId: s.company_id || null,
    userId: s.user_id || null,
    pipelineId: s.pipeline_id || null,
    autoPush: !!s.auto_push,
    webhookId: s.webhook_id || null,
    webhookAuthUser: s.webhook_auth_user ? decrypt(s.webhook_auth_user) : null,
    webhookAuthPassword: s.webhook_auth_password ? decrypt(s.webhook_auth_password) : null,
    lastError: s.last_error || null,
    rawSettings: s,
  };
}

// ─── Refresh ─────────────────────────────────────────────────────────
// Called proactively by the worker and reactively by pipedriveFetch on
// a 401. A 400/401 from /token means the refresh_token is dead — flip
// the integration inactive and surface the reason so the admin can
// reconnect.
async function refreshAccessToken(tenantId) {
  if (!isConfigured()) throw new Error('pipedrive_not_configured');
  const integ = await getTenantPipedrive(tenantId);
  if (!integ) throw new Error('no_integration');
  if (!integ.refreshToken) {
    await markPipedriveIntegrationInactive(tenantId, 'no_refresh_token');
    throw new Error('no_refresh_token');
  }
  const basic = Buffer.from(
    `${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`
  ).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: integ.refreshToken,
  });
  const r = await fetch(PIPEDRIVE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    if (r.status === 400 || r.status === 401) {
      await markPipedriveIntegrationInactive(tenantId, `refresh_failed_${r.status}`);
    }
    throw new Error(`pipedrive token refresh failed: ${r.status} ${txt.slice(0, 200)}`);
  }
  const tokens = await r.json();
  return saveTokens(tenantId, tokens);
}

// Returns { accessToken, apiDomain } valid for ≥ TOKEN_REFRESH_LEEWAY_MS.
async function ensureValidAccessToken(tenantId) {
  const integ = await getTenantPipedrive(tenantId);
  if (!integ || !integ.isActive) throw new Error('not_connected');
  const expiresAt = integ.tokenExpiresAt ? new Date(integ.tokenExpiresAt).getTime() : 0;
  if (expiresAt - Date.now() < TOKEN_REFRESH_LEEWAY_MS) {
    const refreshed = await refreshAccessToken(tenantId);
    return {
      accessToken: decrypt(refreshed.access_token),
      apiDomain: refreshed.api_domain,
    };
  }
  return { accessToken: integ.accessToken, apiDomain: integ.apiDomain };
}

// ─── Authenticated HTTP wrapper ──────────────────────────────────────
// Used by P3+ once push/pull land. Defensive against:
//   - 401: refresh once then retry
//   - 404: maybe api_domain drifted (workspace migrated) — refresh
//     once to pick up the new api_domain, then retry
//   - 429: backoff 2s and retry once
// Anything else flows back to the caller unchanged.
async function pipedriveFetch(tenantId, path, options = {}, _retryFlags = {}) {
  const { accessToken, apiDomain } = await ensureValidAccessToken(tenantId);
  if (!apiDomain) throw new Error('no_api_domain');
  const url = `${apiDomain.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
  const r = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  if (r.status === 401 && !_retryFlags.refreshed) {
    await refreshAccessToken(tenantId);
    return pipedriveFetch(tenantId, path, options, { ..._retryFlags, refreshed: true });
  }
  if (r.status === 404 && !_retryFlags.domainRefreshed) {
    console.warn('[pipedrive] 404 on', path, '— refreshing token in case api_domain drifted');
    try { await refreshAccessToken(tenantId); } catch (e) { /* swallow */ }
    return pipedriveFetch(tenantId, path, options, { ..._retryFlags, domainRefreshed: true });
  }
  if (r.status === 429 && !_retryFlags.throttled) {
    await new Promise(res => setTimeout(res, 2000));
    return pipedriveFetch(tenantId, path, options, { ..._retryFlags, throttled: true });
  }
  return r;
}

// ─── Worker ──────────────────────────────────────────────────────────
// Sweeps every 10 min for tokens expiring within the next 5 min and
// refreshes them in parallel. Idempotent: an in-flight refresh for a
// given tenant won't be retriggered.
const _refreshInFlight = new Set();

async function refreshDueTokens() {
  if (!isConfigured()) return;
  const horizon = new Date(Date.now() + WORKER_REFRESH_HORIZON_MS).toISOString();
  let rows = [];
  try {
    ({ rows } = await query(
      `SELECT tenant_id FROM crm_integrations
        WHERE provider = 'pipedrive'
          AND is_active = TRUE
          AND COALESCE(settings->>'token_expires_at', '1970-01-01') < $1`,
      [horizon]
    ));
  } catch (err) {
    console.error('[pipedrive.refresh.scan]', err.message);
    return;
  }
  for (const r of rows) {
    if (_refreshInFlight.has(r.tenant_id)) continue;
    _refreshInFlight.add(r.tenant_id);
    refreshAccessToken(r.tenant_id)
      .then(() => console.log('[pipedrive.refresh] ok tenant', r.tenant_id))
      .catch(e => console.error('[pipedrive.refresh] failed tenant', r.tenant_id, e.message))
      .finally(() => _refreshInFlight.delete(r.tenant_id));
  }
}

function startPipedriveRefreshWorker() {
  if (!isConfigured()) {
    console.warn('[pipedrive] refresh worker NOT armed — PIPEDRIVE_CLIENT_ID / PIPEDRIVE_CLIENT_SECRET missing');
    return;
  }
  // First sweep 60 s after boot so we don't pile onto migration startup
  // I/O; then every 10 min.
  setTimeout(
    () => refreshDueTokens().catch(e => console.error('[pipedrive.refresh.tick]', e.message)),
    60_000
  );
  setInterval(
    () => refreshDueTokens().catch(e => console.error('[pipedrive.refresh.tick]', e.message)),
    REFRESH_WORKER_INTERVAL_MS
  );
  console.log('[pipedrive] refresh worker armed (10 min cadence)');
}

module.exports = {
  isConfigured,
  signState,
  verifyState,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  ensurePipedriveIntegrationRow,
  markPipedriveIntegrationInactive,
  saveTokens,
  getTenantPipedrive,
  ensureValidAccessToken,
  pipedriveFetch,
  startPipedriveRefreshWorker,
};

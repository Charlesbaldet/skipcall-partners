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
  // Brand-new Pipedrive integrations default to auto_push: true (the
  // connector is useless without auto-sync — the admin connected
  // specifically to mirror RefBoost into Pipedrive). ON CONFLICT
  // intentionally does NOT touch settings, so a reconnect on an
  // existing row preserves whatever the admin had configured
  // (including auto_push: false if they deliberately turned it off).
  const { rows } = await query(
    `INSERT INTO crm_integrations (tenant_id, provider, is_active, settings, connected_at)
     VALUES ($1, 'pipedrive', FALSE, '{"auto_push": true}'::jsonb, NOW())
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
  // Surface any non-2xx with the URL we hit. Helps debug missing-scope
  // and api_domain-drift cases from the logs alone.
  if (!r.ok) {
    console.warn(`[pipedrive.fetch] non-2xx tenant=${tenantId} ${options.method || 'GET'} ${url} → ${r.status}${_retryFlags.refreshed ? ' (after token refresh)' : ''}`);
  }
  if (r.status === 401 && !_retryFlags.refreshed) {
    // Token might just be expired; a refresh attempt is cheap. If the
    // refresh itself blows up (e.g. provider config went sideways), we
    // surface a CLEAN propagation rather than letting the original
    // 'pipedrive_not_configured' bubble up — the calling endpoint
    // would otherwise return 503 to the FE, which is misleading when
    // the actual cause is a missing OAuth scope.
    try {
      await refreshAccessToken(tenantId);
    } catch (refreshErr) {
      console.warn(`[pipedrive.fetch] refresh-after-401 failed tenant=${tenantId} reason=${refreshErr.message} — returning original 401`);
      return r;
    }
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

// ─── P2: Pipelines / Stages / Fields API wrappers ────────────────────
// All read-only — push (P3) and webhooks (P5) plug onto pipedriveFetch
// from here.

const CANONICAL_STATUSES = ['new', 'contacted', 'qualified', 'meeting', 'proposal', 'won', 'lost'];
// Pipedrive separates the deal's pipeline stage (stage_id, an integer
// pointing at a real stage row) from its lifecycle status
// (status: 'open' | 'won' | 'lost' | 'deleted'). 'won' and 'lost' are
// never stages — pushing a deal as won/lost is a PATCH on the status
// field, not a stage move. We expose that contract to the push layer
// (P3) via PIPEDRIVE_STATUS_OVERRIDE so the resolver doesn't have to
// special-case those slugs at every call site.
const PIPEDRIVE_STATUS_OVERRIDE = { won: 'won', lost: 'lost' };
// Everything in CANONICAL_STATUSES that IS routable to a Pipedrive
// stage — i.e. minus the two status-override slugs above. Used by
// saveStageMappings to drop any 'won'/'lost' rows the FE might send
// (defensive: the UI doesn't render them anymore but a stale client
// could) and by the on-read getStageMappings filter.
const STAGE_MAPPABLE_STATUSES = CANONICAL_STATUSES.filter(
  s => !Object.prototype.hasOwnProperty.call(PIPEDRIVE_STATUS_OVERRIDE, s)
);
// Lookup table for the RefBoost fields the admin can map onto a
// Pipedrive Deal / Person / Organization. The lambda is the value
// extractor used by the future push (P3); for P2 only the keys are
// consulted, but defining both here keeps the source of truth in one
// spot for both cycles.
//
// contact_first_name / contact_last_name come from the dedicated
// referrals columns added in migrate.js v18d (the form-builder's
// 'contact_first_name' / 'contact_last_name' field_roles feed them
// straight through). prospect_name stays the deal/company header
// (kanban card title) — it's NOT a person's name.
const REFBOOST_FIELDS = {
  prospect_name:       r => r.prospect_name,
  contact_first_name:  r => r.contact_first_name,
  contact_last_name:   r => r.contact_last_name,
  email:               r => r.prospect_email || r.email,
  phone:               r => r.prospect_phone || r.phone,
  company:             r => r.prospect_company,
  notes:               r => r.notes,
  mrr:                 r => r.deal_value,
  partner_name:        r => r.partner_name,
  role:                r => r.prospect_role,
};

function isValidRefboostStatus(s) { return CANONICAL_STATUSES.includes(s); }
function isValidRefboostField(f)  { return Object.prototype.hasOwnProperty.call(REFBOOST_FIELDS, f); }

// Pipedrive returns API responses wrapped in { success, data, ... }.
// Helper that surfaces a clean error when the wrapper says failure but
// the HTTP status was 200 (does happen on /v1 endpoints).
//
// On error, attaches `status`, `body` (truncated) and `kind` to the
// thrown Error so the route handler can map them to clean HTTP codes
// + log enough context to debug a missing-scope or wrong-path case
// without having to repro from the browser.
async function pdJson(r, label) {
  let body;
  let rawText = '';
  try { body = await r.json(); }
  catch {
    // Try to capture the raw text body if JSON parse fails — useful
    // for debugging proxy errors / HTML error pages from Pipedrive's
    // edge layer.
    try { rawText = await r.text(); } catch {}
    const e = new Error(`pipedrive ${label} ${r.status} (non-json)`);
    e.status = r.status;
    e.body = rawText.slice(0, 500);
    e.kind = 'pipedrive_http';
    throw e;
  }
  if (!r.ok) {
    // Pipedrive error bodies vary: { success:false, error, error_info }
    // for v1, { success:false, error } for v2. We extract whatever's
    // readable.
    const errMsg = (body && (body.error_info || body.error || body.errorCode)) || `${r.status}`;
    const e = new Error(`pipedrive ${label} ${r.status} ${errMsg}`);
    e.status = r.status;
    e.body = body;
    e.kind = 'pipedrive_http';
    throw e;
  }
  if (body && body.success === false) {
    const e = new Error(`pipedrive ${label} api error: ${body.error || 'unknown'}`);
    e.status = r.status;
    e.body = body;
    e.kind = 'pipedrive_api';
    throw e;
  }
  return body;
}

async function listPipelines(tenantId) {
  const r = await pipedriveFetch(tenantId, '/api/v2/pipelines');
  const body = await pdJson(r, 'pipelines');
  // v2 returns { success, data: [{ id, name, ... }] }
  return (body.data || []).map(p => ({
    id: p.id,
    name: p.name,
    is_default: !!(p.is_default || p.selected),
    is_deleted_flag: !!p.is_deleted_flag,
    order_nr: p.order_nr != null ? p.order_nr : 0,
  }));
}

async function listStages(tenantId, pipelineId) {
  const r = await pipedriveFetch(tenantId, `/api/v2/stages?pipeline_id=${encodeURIComponent(pipelineId)}`);
  const body = await pdJson(r, 'stages');
  return (body.data || []).map(s => ({
    id: s.id,
    name: s.name,
    order_nr: s.order_nr != null ? s.order_nr : 0,
    pipeline_id: s.pipeline_id,
  }));
}

// entityType ∈ {deal, person, organization}. Pipedrive's *fields
// endpoints are still on /v1 — v2 hasn't ported them yet. enum/set
// fields ship their options inline, we normalise them to a uniform
// {id,label} shape so the FE can render a select without conditional
// logic.
async function listFields(tenantId, entityType) {
  const PATH_BY_ENTITY = {
    deal: '/api/v1/dealFields',
    person: '/api/v1/personFields',
    organization: '/api/v1/organizationFields',
  };
  const path = PATH_BY_ENTITY[entityType];
  if (!path) throw new Error('invalid_entity_type');
  console.log(`[pipedrive.listFields] tenant=${tenantId} entity=${entityType} path=${path}`);
  const r = await pipedriveFetch(tenantId, path);
  console.log(`[pipedrive.listFields] tenant=${tenantId} entity=${entityType} status=${r.status}`);
  const body = await pdJson(r, `${entityType}Fields`);
  return (body.data || []).map(f => {
    const out = {
      key: f.key,
      name: f.name,
      field_type: f.field_type || null,
      // edit_flag is true for custom fields, false/missing for stock
      // fields. Surfacing it lets the FE put a "personnalisé" badge
      // on custom rows without re-deriving from the key shape.
      is_custom: !!f.edit_flag,
    };
    if ((f.field_type === 'enum' || f.field_type === 'set') && Array.isArray(f.options)) {
      out.options = f.options.map(o => ({
        id: o.id != null ? String(o.id) : String(o.value || ''),
        label: o.label != null ? String(o.label) : String(o.value || ''),
      }));
    }
    return out;
  });
}

// ─── P2: Settings + mapping persistence ──────────────────────────────
// Stage mappings live in crm_stage_mappings (existing) tied to the
// pipedrive integration row's id. Field mappings live in
// crm_field_mappings (existing) but since that table has no
// entity_type column and adding one would mean a migration, we
// namespace the crm_field value with "{entity}:{key}" — e.g.
// "deal:title", "person:92f5dd33", "organization:name". On read we
// split, on write we prefix. Safe because Pipedrive field keys are
// either simple snake_case (no colon) or hex hashes (no colon).

async function getSettings(tenantId) {
  const integ = await getTenantPipedrive(tenantId);
  if (!integ) return null;
  return {
    pipeline_id: integ.pipelineId != null ? String(integ.pipelineId) : null,
    auto_push: !!integ.autoPush,
  };
}

async function updateSettings(tenantId, partial) {
  const current = (await readSettings(tenantId)) || {};
  const next = { ...current };
  if (Object.prototype.hasOwnProperty.call(partial, 'pipeline_id')) {
    // Persist as string for JSONB stability — JS Number↔BigInt drift
    // on Pipedrive integer IDs has bitten us elsewhere.
    next.pipeline_id = partial.pipeline_id == null
      ? null
      : String(partial.pipeline_id);
  }
  if (Object.prototype.hasOwnProperty.call(partial, 'auto_push')) {
    next.auto_push = !!partial.auto_push;
  }
  await writeSettings(tenantId, next);
  return { pipeline_id: next.pipeline_id || null, auto_push: !!next.auto_push };
}

async function getStageMappings(tenantId) {
  const integ = await getTenantPipedrive(tenantId);
  if (!integ) return [];
  const { rows } = await query(
    `SELECT refboost_status, crm_stage, crm_pipeline_id
       FROM crm_stage_mappings WHERE integration_id = $1`,
    [integ.id]
  );
  // Defensive: a prior version (or stale FE) may have written 'won' /
  // 'lost' rows. They're not stage-routable in Pipedrive, so drop them
  // on read so the UI doesn't try to render a stage select for them.
  return rows.filter(r => !Object.prototype.hasOwnProperty.call(PIPEDRIVE_STATUS_OVERRIDE, r.refboost_status));
}

// Resolver used by the P3 push layer. Maps a RefBoost status to one
// of two shapes:
//   - { status: 'won' | 'lost' }              for terminal statuses
//   - { stage_id: <pipedrive_stage_id> | null } for everything else
// The caller (push) merges this into the Pipedrive PATCH body.
function resolvePushTarget(refboostStatus, stageMappings = []) {
  if (Object.prototype.hasOwnProperty.call(PIPEDRIVE_STATUS_OVERRIDE, refboostStatus)) {
    return { status: PIPEDRIVE_STATUS_OVERRIDE[refboostStatus] };
  }
  const match = stageMappings.find(m => m.refboost_status === refboostStatus);
  return { stage_id: match && match.crm_stage ? match.crm_stage : null };
}

// Atomic replace: drop the rows we know about (those matching one of
// CANONICAL_STATUSES) then INSERT the new set. Rows tied to legacy
// status slugs are left alone so an existing tenant's prior config
// doesn't get torched if we shipped a status rename in the meantime.
async function saveStageMappings(tenantId, list) {
  const integ = await getTenantPipedrive(tenantId);
  if (!integ) throw new Error('not_connected');
  // Only persist stage-mappable statuses. won/lost are never stages
  // in Pipedrive (they're a separate status field on the deal — see
  // PIPEDRIVE_STATUS_OVERRIDE) so we silently strip them here even
  // if a stale client sends them through.
  const cleaned = (Array.isArray(list) ? list : []).filter(m =>
    STAGE_MAPPABLE_STATUSES.includes(m.refboost_status) &&
    typeof m.crm_stage === 'string' && m.crm_stage.trim()
  );
  await query('BEGIN');
  try {
    // DELETE the full CANONICAL_STATUSES set (not just the mappable
    // ones) so any leftover 'won' / 'lost' rows from a previous
    // schema also get cleaned up. INSERTs only the routable subset.
    await query(
      `DELETE FROM crm_stage_mappings
        WHERE integration_id = $1 AND refboost_status = ANY($2::text[])`,
      [integ.id, CANONICAL_STATUSES]
    );
    for (const m of cleaned) {
      await query(
        `INSERT INTO crm_stage_mappings (integration_id, refboost_status, crm_stage, crm_pipeline_id)
         VALUES ($1, $2, $3, $4)`,
        [integ.id, m.refboost_status, String(m.crm_stage).slice(0, 100), m.crm_pipeline_id != null ? String(m.crm_pipeline_id).slice(0, 100) : null]
      );
    }
    await query('COMMIT');
  } catch (e) {
    await query('ROLLBACK').catch(() => {});
    throw e;
  }
  return cleaned.length;
}

// byEntity = { deal: [{refboost_field, crm_field}], person: [...], organization: [...] }
// Persisted as crm_field row with crm_field = "{entity}:{key}".
async function getFieldMappings(tenantId) {
  const integ = await getTenantPipedrive(tenantId);
  const empty = { deal: [], person: [], organization: [] };
  if (!integ) return empty;
  const { rows } = await query(
    `SELECT refboost_field, crm_field, direction
       FROM crm_field_mappings WHERE integration_id = $1`,
    [integ.id]
  );
  const out = { deal: [], person: [], organization: [] };
  for (const r of rows) {
    const idx = String(r.crm_field || '').indexOf(':');
    if (idx <= 0) continue; // not a pipedrive-prefixed row → ignore
    const entity = r.crm_field.slice(0, idx);
    const key = r.crm_field.slice(idx + 1);
    if (out[entity] && key) out[entity].push({ refboost_field: r.refboost_field, crm_field: key });
  }
  return out;
}

const ENTITY_TYPES = ['deal', 'person', 'organization'];

async function saveFieldMappings(tenantId, byEntity) {
  const integ = await getTenantPipedrive(tenantId);
  if (!integ) throw new Error('not_connected');
  const cleaned = { deal: [], person: [], organization: [] };
  for (const entity of ENTITY_TYPES) {
    const list = byEntity && Array.isArray(byEntity[entity]) ? byEntity[entity] : [];
    for (const m of list) {
      if (!isValidRefboostField(m.refboost_field)) continue;
      if (typeof m.crm_field !== 'string' || !m.crm_field.trim()) continue;
      cleaned[entity].push({
        refboost_field: m.refboost_field,
        crm_field: m.crm_field.trim(),
      });
    }
  }
  await query('BEGIN');
  try {
    // Wipe every prefixed row for this integration in one go — saving
    // is "replace the whole set" semantics, no per-entity surgery.
    await query(
      `DELETE FROM crm_field_mappings
        WHERE integration_id = $1
          AND (crm_field LIKE 'deal:%'
               OR crm_field LIKE 'person:%'
               OR crm_field LIKE 'organization:%')`,
      [integ.id]
    );
    for (const entity of ENTITY_TYPES) {
      for (const m of cleaned[entity]) {
        const prefixed = `${entity}:${m.crm_field}`.slice(0, 100);
        await query(
          `INSERT INTO crm_field_mappings (integration_id, refboost_field, crm_field, direction)
           VALUES ($1, $2, $3, 'push')`,
          [integ.id, m.refboost_field, prefixed]
        );
      }
    }
    await query('COMMIT');
  } catch (e) {
    await query('ROLLBACK').catch(() => {});
    throw e;
  }
  return {
    deal: cleaned.deal.length,
    person: cleaned.person.length,
    organization: cleaned.organization.length,
  };
}

// ─── P3: Push (RefBoost → Pipedrive) ─────────────────────────────────
// Fire-and-forget from every referral write path. Never throws to
// the caller — failures land in crm_sync_log + a structured
// {ok:false, reason, error} return so the route handler can decide
// what to surface (manual push gets a toast; auto push stays silent).
//
// Flow:
//   1. Load context: integration row, mappings (stages + fields per
//      entity), and the pipeline's stages (used as a fallback when a
//      status has no explicit mapping).
//   2. Upsert Organization from referrals.prospect_company.
//   3. Upsert Person from contact_first_name / contact_last_name /
//      email, attached to the org.
//   4. Upsert Deal: title from prospect_name, value from deal_value,
//      person_id + org_id from above, stage_id or status from
//      resolvePushTarget().
//   5. Persist Pipedrive IDs back onto referrals.pipedrive_*_id so
//      the next push PATCHes instead of POSTing.

async function loadPipedriveContext(tenantId) {
  const integ = await getTenantPipedrive(tenantId);
  if (!integ || !integ.isActive) return null;
  const [stageMappings, fieldMappings] = await Promise.all([
    getStageMappings(tenantId),
    getFieldMappings(tenantId),
  ]);
  let stages = [];
  if (integ.pipelineId) {
    try {
      stages = await listStages(tenantId, integ.pipelineId);
    } catch (e) {
      console.warn('[pipedrive.push.context] stages fetch failed:', e.message);
    }
  }
  return { integ, stageMappings, fieldMappings, stages };
}

// Walk a list of {refboost_field, crm_field} mappings and produce a
// flat {pipedriveKey: value} payload, skipping null/undefined/empty
// values. Standard and custom fields share the same shape in the
// Pipedrive request body.
function buildEntityPayload(mappings, referral) {
  const out = {};
  for (const m of mappings) {
    const extractor = REFBOOST_FIELDS[m.refboost_field];
    if (!extractor) continue;
    const value = extractor(referral);
    if (value === null || value === undefined || value === '') continue;
    out[m.crm_field] = value;
  }
  return out;
}

// Pipedrive Person email and phone are array-of-objects ([{value,
// primary, label}]) — flat string values produce a 400. Normalises
// any string we receive from a buildEntityPayload pass into that
// shape.
function normalisePersonContactArrays(payload) {
  for (const k of ['email', 'phone']) {
    if (payload[k] && typeof payload[k] === 'string') {
      payload[k] = [{ value: payload[k], primary: true, label: 'work' }];
    }
  }
  return payload;
}

async function pipedriveJson(tenantId, path, options) {
  // Thin wrapper around pipedriveFetch + pdJson so each upsert reads
  // tighter.
  const r = await pipedriveFetch(tenantId, path, options);
  return pdJson(r, path);
}

// Upsert an Organization. Strategy:
//   - referrals.pipedrive_organization_id present → PATCH that id
//   - else search by exact name → reuse first match
//   - else POST a new one
// Returns the org id (string) or null if the referral has no company
// to anchor on (Pipedrive Organisation requires a name; we skip
// rather than create a "Sans nom" row).
async function upsertOrganization(tenantId, referral, mappings) {
  const companyName = (referral.prospect_company || '').trim();
  // Build payload from mappings (custom fields + anything else the
  // admin chose to map onto Organisation).
  const extraFields = buildEntityPayload(mappings, referral);
  // Existing link → PATCH
  if (referral.pipedrive_organization_id) {
    const body = { ...extraFields };
    if (companyName) body.name = companyName;
    if (Object.keys(body).length === 0) return referral.pipedrive_organization_id;
    try {
      await pipedriveJson(tenantId, `/api/v2/organizations/${encodeURIComponent(referral.pipedrive_organization_id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return referral.pipedrive_organization_id;
    } catch (e) {
      // 404 — the org was deleted Pipedrive-side. Fall through to
      // re-create.
      if (e.status !== 404) throw e;
    }
  }
  if (!companyName) return null;

  // Search by name. v2 search accepts a `term` query string + `fields`
  // filter. We use exact_match=true and the `name` field so we don't
  // accidentally attach to a near-name match.
  try {
    const search = await pipedriveJson(
      tenantId,
      `/api/v2/organizations/search?term=${encodeURIComponent(companyName)}&fields=name&exact_match=true&limit=1`
    );
    const hit = search?.data?.items?.[0]?.item;
    if (hit?.id) {
      // Patch on top of the found org so custom fields stay in sync.
      const patchBody = { ...extraFields };
      if (Object.keys(patchBody).length > 0) {
        try {
          await pipedriveJson(tenantId, `/api/v2/organizations/${hit.id}`, {
            method: 'PATCH',
            body: JSON.stringify(patchBody),
          });
        } catch (e) {
          console.warn('[pipedrive.push.org] post-search patch failed:', e.message);
        }
      }
      return String(hit.id);
    }
  } catch (e) {
    console.warn('[pipedrive.push.org] search failed (falling back to create):', e.message);
  }

  // Create new.
  const created = await pipedriveJson(tenantId, '/api/v2/organizations', {
    method: 'POST',
    body: JSON.stringify({ name: companyName, ...extraFields }),
  });
  return created?.data?.id ? String(created.data.id) : null;
}

// Upsert a Person. Email is the strongest identity anchor so we
// search by email when no link exists yet. If neither first/last
// name nor email is available, we skip rather than create a Person
// with a placeholder name.
async function upsertPerson(tenantId, referral, mappings, orgId) {
  // Build payload from explicit mappings — typically first_name,
  // last_name, email, phone + custom fields.
  const payload = normalisePersonContactArrays(buildEntityPayload(mappings, referral));
  // Pipedrive Person requires a `name` field on create; v2 will
  // synthesise it from first_name + last_name if both are sent. Add
  // an explicit fallback when neither is mapped, so unnamed contacts
  // still surface (prospect_name is the deal/company header — it's
  // a decent last-resort identity).
  const hasFirst = !!payload.first_name;
  const hasLast = !!payload.last_name;
  const hasEmail = Array.isArray(payload.email) && payload.email.length > 0;
  if (!hasFirst && !hasLast && !hasEmail) return null;
  if (orgId) payload.org_id = Number(orgId) || orgId;
  if (!hasFirst && !hasLast && referral.prospect_name) {
    payload.name = referral.prospect_name;
  }

  // Existing link → PATCH.
  if (referral.pipedrive_person_id) {
    try {
      await pipedriveJson(tenantId, `/api/v2/persons/${encodeURIComponent(referral.pipedrive_person_id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return referral.pipedrive_person_id;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }

  // Search by email if we have one. exact_match keeps us from
  // attaching to a colleague with a typo'd address.
  if (hasEmail) {
    const emailRaw = payload.email[0]?.value;
    if (emailRaw) {
      try {
        const search = await pipedriveJson(
          tenantId,
          `/api/v2/persons/search?term=${encodeURIComponent(emailRaw)}&fields=email&exact_match=true&limit=1`
        );
        const hit = search?.data?.items?.[0]?.item;
        if (hit?.id) {
          try {
            await pipedriveJson(tenantId, `/api/v2/persons/${hit.id}`, {
              method: 'PATCH',
              body: JSON.stringify(payload),
            });
          } catch (e) {
            console.warn('[pipedrive.push.person] post-search patch failed:', e.message);
          }
          return String(hit.id);
        }
      } catch (e) {
        console.warn('[pipedrive.push.person] search failed (falling back to create):', e.message);
      }
    }
  }

  // Create new.
  const created = await pipedriveJson(tenantId, '/api/v2/persons', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return created?.data?.id ? String(created.data.id) : null;
}

// Upsert a Deal. Stage resolution rules:
//   - status ∈ {won, lost} → status field on the deal, no stage move
//   - status mapped → stage_id from the mapping
//   - status unmapped, deal already exists → leave stage_id alone
//   - status unmapped, brand-new deal → fall back to the pipeline's
//     first stage (Pipedrive requires a stage_id on create)
async function upsertDeal(tenantId, referral, mappings, personId, orgId, stageMappings, stages, pipelineId) {
  const fieldsPayload = buildEntityPayload(mappings, referral);
  // Pipedrive Deal needs a `title` on create. Default to prospect_name
  // (the deal/company header) if no mapping sets it.
  if (!fieldsPayload.title && referral.prospect_name) {
    fieldsPayload.title = referral.prospect_name;
  }
  // Currency default (V1 hardcoded EUR per product decision).
  if (fieldsPayload.value != null && !fieldsPayload.currency) {
    fieldsPayload.currency = 'EUR';
  }
  if (personId) fieldsPayload.person_id = Number(personId) || personId;
  if (orgId) fieldsPayload.org_id = Number(orgId) || orgId;

  const target = resolvePushTarget(referral.status, stageMappings);
  if (target.status) {
    // won / lost — separate from stage_id, but we still need
    // SOMETHING in stage_id when creating a brand-new deal.
    fieldsPayload.status = target.status;
  }
  // Existing deal → PATCH (we only attach stage_id if explicitly
  // mapped, to avoid yanking the deal back from a stage the admin
  // moved it to manually in Pipedrive).
  if (referral.pipedrive_deal_id) {
    if (target.stage_id) fieldsPayload.stage_id = Number(target.stage_id) || target.stage_id;
    try {
      await pipedriveJson(tenantId, `/api/v2/deals/${encodeURIComponent(referral.pipedrive_deal_id)}`, {
        method: 'PATCH',
        body: JSON.stringify(fieldsPayload),
      });
      return referral.pipedrive_deal_id;
    } catch (e) {
      if (e.status !== 404) throw e;
      // 404 → recreate.
    }
  }

  // Brand-new deal — must have a stage_id. Mapped > pipeline-first.
  let stageId = target.stage_id || null;
  if (!stageId && stages.length > 0) {
    const first = [...stages].sort((a, b) => (a.order_nr || 0) - (b.order_nr || 0))[0];
    if (first) stageId = String(first.id);
  }
  if (stageId) fieldsPayload.stage_id = Number(stageId) || stageId;
  else if (pipelineId) fieldsPayload.pipeline_id = Number(pipelineId) || pipelineId;
  // Ensure title is present — Pipedrive 400s without one.
  if (!fieldsPayload.title) fieldsPayload.title = 'Untitled deal';

  const created = await pipedriveJson(tenantId, '/api/v2/deals', {
    method: 'POST',
    body: JSON.stringify(fieldsPayload),
  });
  return created?.data?.id ? String(created.data.id) : null;
}

// Main entry. opts.manual=true bypasses the auto_push check.
// Never throws — every failure flows through crm_sync_log + a
// structured return.
async function pushReferralToPipedrive(referralId, tenantId, opts = {}) {
  const manual = !!opts.manual;
  let context = opts.context || null;
  let integrationId = null;
  try {
    if (!context) context = await loadPipedriveContext(tenantId);
    if (!context) return { ok: false, reason: 'not_configured' };
    integrationId = context.integ.id;
    if (!manual && !context.integ.autoPush) {
      return { ok: false, reason: 'auto_push_disabled' };
    }

    const { rows } = await query(
      `SELECT r.id, r.tenant_id, r.partner_id, r.prospect_name,
              r.prospect_email, r.prospect_phone, r.prospect_company,
              r.prospect_role, r.contact_first_name, r.contact_last_name,
              r.notes, r.deal_value, r.status,
              r.pipedrive_deal_id, r.pipedrive_person_id, r.pipedrive_organization_id,
              p.name AS partner_name
         FROM referrals r
         LEFT JOIN partners p ON p.id = r.partner_id
        WHERE r.id = $1 AND r.tenant_id = $2 AND r.deleted_at IS NULL
        LIMIT 1`,
      [referralId, tenantId]
    );
    const referral = rows[0];
    if (!referral) return { ok: false, reason: 'referral_not_found' };

    const { stageMappings, fieldMappings, stages, integ } = context;

    const orgId = await upsertOrganization(tenantId, referral, fieldMappings.organization || []);
    if (orgId !== referral.pipedrive_organization_id) {
      referral.pipedrive_organization_id = orgId;
    }

    const personId = await upsertPerson(tenantId, referral, fieldMappings.person || [], orgId);
    if (personId !== referral.pipedrive_person_id) {
      referral.pipedrive_person_id = personId;
    }

    const dealId = await upsertDeal(
      tenantId, referral, fieldMappings.deal || [],
      personId, orgId, stageMappings, stages, integ.pipelineId
    );

    // Persist the three IDs back onto the referral so the next push
    // PATCHes instead of POSTing.
    await query(
      `UPDATE referrals
          SET pipedrive_deal_id         = COALESCE($1, pipedrive_deal_id),
              pipedrive_person_id       = COALESCE($2, pipedrive_person_id),
              pipedrive_organization_id = COALESCE($3, pipedrive_organization_id),
              updated_at = updated_at
        WHERE id = $4 AND tenant_id = $5`,
      [dealId, personId, orgId, referralId, tenantId]
    );

    if (integrationId) {
      try {
        await query(
          `INSERT INTO crm_sync_log (integration_id, referral_id, action, status, details)
           VALUES ($1, $2, 'push', 'success', $3::jsonb)`,
          [integrationId, referralId, JSON.stringify({
            deal_id: dealId, person_id: personId, organization_id: orgId,
            manual,
          })]
        );
      } catch (e) {
        console.error('[pipedrive.push.log.success]', e.message);
      }
    }

    return { ok: true, deal_id: dealId, person_id: personId, organization_id: orgId };
  } catch (err) {
    // Map Pipedrive HTTP failures (attached on pdJson) to a stable
    // shape so the caller can react. Side-effect: the integration is
    // marked inactive on a 401 so the refresh worker has a clear
    // signal to drop and the next manual reconnect surfaces the
    // problem to the admin.
    console.error('[pipedrive.push] error referral=' + referralId, err.message, err.status || '');
    const kind = err.kind || 'internal';
    let errorCode = 'internal';
    let lastErrorReason = null;
    if (err.status === 401) { errorCode = 'unauthorized'; lastErrorReason = 'token_expired'; }
    else if (err.status === 403) {
      errorCode = /scope/i.test(String(err.body && (err.body.error_info || err.body.error) || '')) ? 'missing_scope' : 'forbidden';
      lastErrorReason = errorCode;
    }
    else if (err.status === 429) errorCode = 'rate_limited';
    else if (kind === 'pipedrive_http') errorCode = `pipedrive_${err.status || 'http'}`;

    if (lastErrorReason && context && context.integ) {
      await markPipedriveIntegrationInactive(tenantId, lastErrorReason).catch(() => {});
    }
    if (integrationId) {
      try {
        await query(
          `INSERT INTO crm_sync_log (integration_id, referral_id, action, status, details)
           VALUES ($1, $2, 'push', 'error', $3::jsonb)`,
          [integrationId, referralId, JSON.stringify({
            error: errorCode,
            message: String(err.message).slice(0, 500),
            status: err.status || null,
            body: err.body && (typeof err.body === 'string' ? err.body.slice(0, 500) : err.body),
            manual,
          })]
        );
      } catch (e) {
        console.error('[pipedrive.push.log.error]', e.message);
      }
    }
    return { ok: false, error: errorCode, detail: err.message };
  }
}

// Bulk push — used by the "Pousser tous les referrals" rattrapage
// button. Loads context once (one /stages call) and iterates
// sequentially to stay well clear of Pipedrive rate limits. Each
// referral failure is captured in the returned summary but does NOT
// abort the run.
async function pushAllReferralsToPipedrive(tenantId, opts = {}) {
  const context = await loadPipedriveContext(tenantId);
  if (!context) return { ok: false, reason: 'not_configured' };
  if (!opts.manual && !context.integ.autoPush) {
    return { ok: false, reason: 'auto_push_disabled' };
  }
  // Order: oldest first so the Pipedrive timeline reads naturally
  // and any partial failure is easy to resume from.
  const { rows } = await query(
    `SELECT id FROM referrals
      WHERE tenant_id = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC`,
    [tenantId]
  );
  let pushed = 0, failed = 0;
  const errors = [];
  for (const r of rows) {
    const res = await pushReferralToPipedrive(r.id, tenantId, { manual: true, context });
    if (res.ok) pushed++;
    else {
      failed++;
      errors.push({ id: r.id, error: res.error || res.reason || 'unknown' });
      // Stop on auth errors — every subsequent push would 401 too.
      if (res.error === 'unauthorized') break;
    }
  }
  return { ok: true, total: rows.length, pushed, failed, errors: errors.slice(0, 20) };
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
  // P2
  CANONICAL_STATUSES,
  STAGE_MAPPABLE_STATUSES,
  PIPEDRIVE_STATUS_OVERRIDE,
  REFBOOST_FIELDS,
  isValidRefboostStatus,
  isValidRefboostField,
  listPipelines,
  listStages,
  listFields,
  getSettings,
  updateSettings,
  getStageMappings,
  saveStageMappings,
  getFieldMappings,
  saveFieldMappings,
  resolvePushTarget,
  // P3
  pushReferralToPipedrive,
  pushAllReferralsToPipedrive,
  loadPipedriveContext,
};

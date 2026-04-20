// CRM integration routes.
//
// Business-plan gate: every authenticated CRM endpoint checks
// tenants.plan === 'business' and returns 403 with `error:
// 'plan_upgrade_required'` for everyone else. The frontend reads that
// error and renders the upgrade prompt.
//
// Webhook receiver (POST /webhook/:tenantId) is intentionally
// unauthenticated — CRMs don't carry our JWT — but it's narrowly
// scoped: we lookup the integration by tenant_id and only act on its
// configured stage mappings.
const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const crmService = require('../services/crmService');

const router = express.Router();

const FRONTEND = () => process.env.FRONTEND_URL || 'https://refboost.io';
// OAuth redirect_uri MUST point at the backend (where the /callback
// handler lives) and MUST exactly match whatever is registered in the
// HubSpot/Salesforce app configuration — not at the frontend origin.
// Prefer RAILWAY_PUBLIC_DOMAIN (auto-populated on Railway) so staging
// deployments pick up their own host without code changes.
const BACKEND = () => {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return 'https://skipcall-partners-production.up.railway.app';
};

// ─── Plan gate middleware ────────────────────────────────────────────
async function requireBusiness(req, res, next) {
  if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
  try {
    const { rows } = await query('SELECT plan FROM tenants WHERE id = $1', [req.tenantId]);
    const plan = rows[0]?.plan || 'starter';
    if (plan !== 'business') {
      return res.status(403).json({ error: 'plan_upgrade_required', currentPlan: plan, requiredPlan: 'business' });
    }
    next();
  } catch (err) {
    console.error('[crm.requireBusiness] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── GET /api/crm/integrations ───────────────────────────────────────
router.get('/integrations', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const { rows } = await query(
      `SELECT id, provider, is_active, webhook_url, instance_url, settings, connected_at, created_at
         FROM crm_integrations WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.tenantId]
    );
    // Surface plan so the UI can render the upgrade banner without a
    // second round-trip.
    const { rows: planRows } = await query('SELECT plan FROM tenants WHERE id = $1', [req.tenantId]);
    res.json({ integrations: rows, plan: planRows[0]?.plan || 'starter' });
  } catch (err) {
    console.error('[crm.list] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/crm/integrations ──────────────────────────────────────
// Create or upsert an integration. Used for the "webhook" provider —
// HubSpot/Salesforce go through their OAuth callbacks instead.
router.post('/integrations', authenticate, tenantScope, authorize('admin'), requireBusiness, async (req, res) => {
  try {
    const { provider, webhook_url, settings } = req.body || {};
    if (!provider || !['webhook', 'hubspot', 'salesforce'].includes(provider)) {
      return res.status(400).json({ error: 'provider invalide' });
    }
    if (provider === 'webhook' && !webhook_url) {
      return res.status(400).json({ error: 'webhook_url requis' });
    }
    const { rows } = await query(
      `INSERT INTO crm_integrations (tenant_id, provider, is_active, webhook_url, settings, connected_at)
       VALUES ($1, $2, TRUE, $3, $4, NOW())
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET is_active = TRUE, webhook_url = COALESCE(EXCLUDED.webhook_url, crm_integrations.webhook_url),
                     settings = COALESCE(EXCLUDED.settings, crm_integrations.settings),
                     connected_at = COALESCE(crm_integrations.connected_at, NOW())
       RETURNING *`,
      [req.tenantId, provider, webhook_url || null, JSON.stringify(settings || {})]
    );
    res.json({ integration: rows[0] });
  } catch (err) {
    console.error('[crm.create] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── DELETE /api/crm/integrations/:id ────────────────────────────────
router.delete('/integrations/:id', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM crm_integrations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Integration introuvable' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[crm.delete] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/crm/integrations/:id/test ─────────────────────────────
router.post('/integrations/:id/test', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM crm_integrations WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [req.params.id, req.tenantId]
    );
    const integration = rows[0];
    if (!integration) return res.status(404).json({ error: 'Integration introuvable' });

    if (integration.provider === 'webhook') {
      if (!integration.webhook_url) return res.status(400).json({ error: 'webhook_url manquant' });
      const resp = await fetch(integration.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RefBoost-Event': 'test.ping' },
        body: JSON.stringify({ event: 'test.ping', message: 'Test from RefBoost', ts: new Date().toISOString() }),
      });
      const ok = resp.ok;
      await crmService.logSync(integration.id, null, 'push', ok ? 'success' : 'error', { test: true, status: resp.status });
      return res.json({ ok, status: resp.status });
    }

    // For OAuth providers, hit a lightweight endpoint to confirm the
    // access token still works.
    if (integration.provider === 'hubspot') {
      const r = await fetch('https://api.hubapi.com/integrations/v1/me', {
        headers: { Authorization: `Bearer ${integration.access_token}` },
      });
      return res.json({ ok: r.ok, status: r.status });
    }
    if (integration.provider === 'salesforce' && integration.instance_url) {
      const r = await fetch(`${integration.instance_url}/services/data/v59.0/`, {
        headers: { Authorization: `Bearer ${integration.access_token}` },
      });
      return res.json({ ok: r.ok, status: r.status });
    }
    res.json({ ok: false, message: 'Test indisponible pour ce provider' });
  } catch (err) {
    console.error('[crm.test] error:', err);
    res.status(500).json({ error: 'Erreur test' });
  }
});

// ─── HubSpot OAuth ───────────────────────────────────────────────────
router.get('/hubspot/auth', authenticate, tenantScope, authorize('admin'), requireBusiness, async (req, res) => {
  // Carry tenantId in `state` so the callback knows who to bind the
  // tokens to — the browser arriving at /callback won't have a JWT.
  // (For production, sign the state to prevent CSRF; placeholder here.)
  const state = Buffer.from(JSON.stringify({ tenantId: req.tenantId, ts: Date.now() })).toString('base64');
  const redirectUri = BACKEND() + '/api/crm/hubspot/callback';
  const url = crmService.hubspotAuthUrl(state, redirectUri);
  if (!url) return res.status(500).json({ error: 'HUBSPOT_CLIENT_ID non configuré' });
  res.json({ url });
});

router.get('/hubspot/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code/state');
    let payload;
    try { payload = JSON.parse(Buffer.from(state, 'base64').toString()); }
    catch { return res.status(400).send('Invalid state'); }
    const tenantId = payload.tenantId;
    if (!tenantId) return res.status(400).send('Invalid state.tenantId');

    // MUST reuse the exact same redirect_uri that was passed to
    // /authorize — HubSpot validates it on /token exchange.
    const redirectUri = BACKEND() + '/api/crm/hubspot/callback';
    const tokens = await crmService.exchangeHubSpotCode(code, redirectUri);
    await query(
      `INSERT INTO crm_integrations (tenant_id, provider, is_active, access_token, refresh_token, connected_at)
       VALUES ($1, 'hubspot', TRUE, $2, $3, NOW())
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
                     is_active = TRUE, connected_at = NOW()`,
      [tenantId, tokens.access_token, tokens.refresh_token || null]
    );
    // Bounce the user back to the frontend Integrations tab.
    res.redirect(FRONTEND() + '/settings?tab=integrations&connected=hubspot');
  } catch (err) {
    console.error('[crm.hubspot.callback] error:', err);
    res.redirect(FRONTEND() + '/settings?tab=integrations&crm=error');
  }
});

router.post('/hubspot/disconnect', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    await query("UPDATE crm_integrations SET is_active = FALSE, access_token = NULL, refresh_token = NULL WHERE tenant_id = $1 AND provider = 'hubspot'", [req.tenantId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Salesforce OAuth ────────────────────────────────────────────────
router.get('/salesforce/auth', authenticate, tenantScope, authorize('admin'), requireBusiness, async (req, res) => {
  const state = Buffer.from(JSON.stringify({ tenantId: req.tenantId, ts: Date.now() })).toString('base64');
  const redirectUri = BACKEND() + '/api/crm/salesforce/callback';
  const url = crmService.salesforceAuthUrl(state, redirectUri);
  if (!url) return res.status(500).json({ error: 'SALESFORCE_CLIENT_ID non configuré' });
  res.json({ url });
});

router.get('/salesforce/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code/state');
    const payload = JSON.parse(Buffer.from(state, 'base64').toString());
    const tenantId = payload.tenantId;
    if (!tenantId) return res.status(400).send('Invalid state');
    // Same exact-match requirement as HubSpot.
    const redirectUri = BACKEND() + '/api/crm/salesforce/callback';
    const tokens = await crmService.exchangeSalesforceCode(code, redirectUri);
    await query(
      `INSERT INTO crm_integrations (tenant_id, provider, is_active, access_token, refresh_token, instance_url, connected_at)
       VALUES ($1, 'salesforce', TRUE, $2, $3, $4, NOW())
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
                     instance_url = EXCLUDED.instance_url, is_active = TRUE, connected_at = NOW()`,
      [tenantId, tokens.access_token, tokens.refresh_token || null, tokens.instance_url || null]
    );
    res.redirect(FRONTEND() + '/settings?tab=integrations&connected=salesforce');
  } catch (err) {
    console.error('[crm.salesforce.callback] error:', err);
    res.redirect(FRONTEND() + '/settings?tab=integrations&crm=error');
  }
});

router.post('/salesforce/disconnect', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    await query("UPDATE crm_integrations SET is_active = FALSE, access_token = NULL, refresh_token = NULL WHERE tenant_id = $1 AND provider = 'salesforce'", [req.tenantId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Field & stage mappings ──────────────────────────────────────────
router.get('/mappings/:integrationId', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    // Ensure the integration belongs to this tenant.
    const { rows: own } = await query(
      'SELECT id FROM crm_integrations WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [req.params.integrationId, req.tenantId]
    );
    if (!own[0]) return res.status(404).json({ error: 'Integration introuvable' });
    const [{ rows: fields }, { rows: stages }] = await Promise.all([
      query('SELECT id, refboost_field, crm_field, direction FROM crm_field_mappings WHERE integration_id = $1', [req.params.integrationId]),
      query('SELECT id, refboost_status, crm_stage, crm_pipeline_id FROM crm_stage_mappings WHERE integration_id = $1', [req.params.integrationId]),
    ]);
    res.json({ fields, stages });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Replace-all semantics: simpler than diffing client-side.
router.put('/mappings/:integrationId', authenticate, tenantScope, authorize('admin'), requireBusiness, async (req, res) => {
  try {
    const { fields = [], stages = [] } = req.body || {};
    const { rows: own } = await query(
      'SELECT id FROM crm_integrations WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [req.params.integrationId, req.tenantId]
    );
    if (!own[0]) return res.status(404).json({ error: 'Integration introuvable' });

    await query('DELETE FROM crm_field_mappings WHERE integration_id = $1', [req.params.integrationId]);
    for (const f of fields) {
      if (!f.refboost_field || !f.crm_field) continue;
      await query(
        'INSERT INTO crm_field_mappings (integration_id, refboost_field, crm_field, direction) VALUES ($1, $2, $3, $4)',
        [req.params.integrationId, f.refboost_field, f.crm_field, f.direction || 'push']
      );
    }
    await query('DELETE FROM crm_stage_mappings WHERE integration_id = $1', [req.params.integrationId]);
    for (const s of stages) {
      if (!s.refboost_status || !s.crm_stage) continue;
      await query(
        'INSERT INTO crm_stage_mappings (integration_id, refboost_status, crm_stage, crm_pipeline_id) VALUES ($1, $2, $3, $4)',
        [req.params.integrationId, s.refboost_status, s.crm_stage, s.crm_pipeline_id || null]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[crm.mappings.put] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── HubSpot/Salesforce metadata fetch (for the mapping picker) ──────
// Translate upstream 401/403 into 502 so the frontend's global 401
// handler doesn't log the RefBoost user out when HubSpot's OAuth token
// has expired. Everything else collapses to 502 as well (this endpoint
// is a proxy, not an auth gate).
function mapUpstreamStatus(s) {
  return s === 401 || s === 403 ? 502 : (s >= 500 ? 502 : 400);
}

router.get('/hubspot/fields', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    const { rows } = await query("SELECT access_token FROM crm_integrations WHERE tenant_id = $1 AND provider = 'hubspot' AND is_active = TRUE LIMIT 1", [req.tenantId]);
    const token = rows[0]?.access_token;
    if (!token) return res.status(400).json({ error: 'HubSpot non connecté' });
    const r = await fetch('https://api.hubapi.com/crm/v3/properties/deals', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return res.status(mapUpstreamStatus(r.status)).json({ error: 'HubSpot unreachable', upstream_status: r.status });
    const data = await r.json();
    res.json({ fields: (data.results || []).map(p => ({ name: p.name, label: p.label, type: p.type })) });
  } catch (err) {
    res.status(502).json({ error: 'Erreur HubSpot' });
  }
});

router.get('/hubspot/pipelines', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    const { rows } = await query("SELECT access_token FROM crm_integrations WHERE tenant_id = $1 AND provider = 'hubspot' AND is_active = TRUE LIMIT 1", [req.tenantId]);
    const token = rows[0]?.access_token;
    if (!token) return res.status(400).json({ error: 'HubSpot non connecté' });
    const r = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return res.status(mapUpstreamStatus(r.status)).json({ error: 'HubSpot unreachable', upstream_status: r.status });
    const data = await r.json();
    res.json({
      pipelines: (data.results || []).map(p => ({
        id: p.id, label: p.label,
        stages: (p.stages || []).map(s => ({ id: s.id, label: s.label })),
      })),
    });
  } catch (err) {
    res.status(502).json({ error: 'Erreur HubSpot' });
  }
});

router.get('/salesforce/fields', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    const { rows } = await query("SELECT access_token, instance_url FROM crm_integrations WHERE tenant_id = $1 AND provider = 'salesforce' AND is_active = TRUE LIMIT 1", [req.tenantId]);
    const it = rows[0];
    if (!it?.access_token || !it.instance_url) return res.status(400).json({ error: 'Salesforce non connecté' });
    const r = await fetch(`${it.instance_url}/services/data/v59.0/sobjects/Opportunity/describe`, {
      headers: { Authorization: `Bearer ${it.access_token}` },
    });
    if (!r.ok) return res.status(mapUpstreamStatus(r.status)).json({ error: 'Salesforce unreachable', upstream_status: r.status });
    const data = await r.json();
    res.json({ fields: (data.fields || []).map(f => ({ name: f.name, label: f.label, type: f.type })) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur Salesforce' });
  }
});

router.get('/salesforce/stages', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    const { rows } = await query("SELECT access_token, instance_url FROM crm_integrations WHERE tenant_id = $1 AND provider = 'salesforce' AND is_active = TRUE LIMIT 1", [req.tenantId]);
    const it = rows[0];
    if (!it?.access_token || !it.instance_url) return res.status(400).json({ error: 'Salesforce non connecté' });
    const r = await fetch(`${it.instance_url}/services/data/v59.0/query?q=SELECT+MasterLabel+FROM+OpportunityStage+WHERE+IsActive=true`, {
      headers: { Authorization: `Bearer ${it.access_token}` },
    });
    if (!r.ok) return res.status(mapUpstreamStatus(r.status)).json({ error: 'Salesforce unreachable', upstream_status: r.status });
    const data = await r.json();
    res.json({ stages: (data.records || []).map(s => ({ id: s.MasterLabel, label: s.MasterLabel })) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur Salesforce' });
  }
});

// ─── Manual sync + sync log ──────────────────────────────────────────
router.post('/sync/:referralId', authenticate, tenantScope, authorize('admin', 'commercial'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, p.name AS partner_name FROM referrals r
       LEFT JOIN partners p ON p.id = r.partner_id
       WHERE r.id = $1 AND ($2::uuid IS NULL OR r.tenant_id = $2)
       LIMIT 1`,
      [req.params.referralId, req.tenantId || null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Referral introuvable' });
    const result = await crmService.pushReferralToCRM(rows[0], req.tenantId);
    res.json(result);
  } catch (err) {
    console.error('[crm.sync] error:', err);
    res.status(500).json({ error: 'Erreur sync' });
  }
});

router.get('/sync/log', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT l.id, l.referral_id, l.action, l.status, l.details, l.created_at,
              i.provider, r.prospect_name
         FROM crm_sync_log l
         JOIN crm_integrations i ON i.id = l.integration_id
         LEFT JOIN referrals r ON r.id = l.referral_id
        WHERE i.tenant_id = $1
        ORDER BY l.created_at DESC LIMIT 50`,
      [req.tenantId]
    );
    res.json({ log: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Inbound webhook (no auth — narrow by tenantId in the URL) ──────
router.post('/webhook/:tenantId', express.json(), async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT * FROM crm_integrations WHERE tenant_id = $1 AND is_active = TRUE LIMIT 1",
      [req.params.tenantId]
    );
    const integration = rows[0];
    if (!integration) return res.status(404).json({ error: 'no integration' });
    const result = await crmService.pullStatusFromCRM(req.body || {}, integration);
    res.json(result);
  } catch (err) {
    console.error('[crm.webhook] error:', err);
    res.status(500).json({ error: 'Erreur webhook' });
  }
});

module.exports = router;
